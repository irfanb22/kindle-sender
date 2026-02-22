import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateKindleEpub } from "@/lib/epub";
import { sendToKindle } from "@/lib/email";

// ── Timezone helpers ────────────────────────────────────────────────────────

const DAY_ABBREV: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

function getCurrentDayAndHour(timezone: string): { day: string; hour: number } {
  try {
    const now = new Date();

    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const dayStr = dayFormatter.format(now).toLowerCase().slice(0, 3);

    const hourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = hourFormatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    const hour = hourPart ? parseInt(hourPart.value, 10) : 0;

    return { day: dayStr, hour };
  } catch {
    const now = new Date();
    const day = DAY_ABBREV[now.getUTCDay()] || "mon";
    return { day, hour: now.getUTCHours() };
  }
}

// ── Cron handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  console.log("⏰ Cron send invoked at", new Date().toISOString());

  // Verify this is a legitimate cron call (check for secret header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log("Unauthorized cron request — missing or invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  console.log("✅ Env vars present, connecting to Supabase...");

  // Use service role key to bypass RLS (no user session in cron context)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all users who have scheduled days configured and complete email settings
  const { data: allSettings, error: settingsError } = await supabase
    .from("settings")
    .select("user_id, kindle_email, schedule_days, schedule_time, timezone, min_article_count, epub_font, epub_include_images, epub_show_author, epub_show_read_time, epub_show_published_date")
    .not("schedule_days", "is", null)
    .not("schedule_time", "is", null)
    .not("kindle_email", "is", null);

  if (settingsError) {
    console.error("Failed to query settings:", settingsError.message);
    return NextResponse.json({ error: "Settings query failed" }, { status: 500 });
  }

  if (!allSettings || allSettings.length === 0) {
    console.log("No users with scheduled sends configured");
    return NextResponse.json({ message: "No scheduled sends" });
  }

  console.log(`Found ${allSettings.length} user(s) with delivery settings configured`);

  // Filter to users whose schedule matches the current day/hour in their timezone
  const matchingUsers = allSettings.filter((s) => {
    const userTimezone = s.timezone || "UTC";
    const { day: currentDay, hour: currentHour } = getCurrentDayAndHour(userTimezone);

    const scheduleDays = s.schedule_days as string[];
    if (!scheduleDays.includes(currentDay)) {
      console.log(`User ${s.user_id}: schedule_days=${JSON.stringify(scheduleDays)}, current day=${currentDay} — no match`);
      return false;
    }

    const [hourStr] = (s.schedule_time as string).split(":");
    const scheduleHour = parseInt(hourStr, 10);
    if (scheduleHour !== currentHour) {
      console.log(`User ${s.user_id}: schedule_time=${s.schedule_time} (hour ${scheduleHour}), current hour=${currentHour} in ${userTimezone} — no match`);
      return false;
    }

    console.log(`User ${s.user_id}: ✅ MATCHED — ${currentDay} at hour ${currentHour} in ${userTimezone}`);
    return true;
  });

  if (matchingUsers.length === 0) {
    console.log("No users matched for this hour");
    return NextResponse.json({ message: "No matching schedules" });
  }

  console.log(`${matchingUsers.length} user(s) matched, processing sends...`);
  const results: Array<{ userId: string; status: string; message: string }> = [];

  for (const settings of matchingUsers) {
    try {
      // Fetch queued articles for this user
      const { data: articles, error: articlesError } = await supabase
        .from("articles")
        .select("*")
        .eq("user_id", settings.user_id)
        .eq("status", "queued")
        .order("created_at", { ascending: true });

      if (articlesError || !articles || articles.length === 0) {
        console.log(`User ${settings.user_id}: no queued articles, skipping`);
        results.push({ userId: settings.user_id, status: "skipped", message: "No queued articles" });
        continue;
      }

      // Filter to articles with content
      const sendableArticles = articles.filter(
        (a: { content?: string }) => a.content && a.content.trim().length > 0
      );

      if (sendableArticles.length === 0) {
        console.log(`User ${settings.user_id}: no articles with content, skipping`);
        results.push({ userId: settings.user_id, status: "skipped", message: "No articles with content" });
        continue;
      }

      // Check minimum article count
      const minCount = settings.min_article_count || 1;
      if (sendableArticles.length < minCount) {
        console.log(`User ${settings.user_id}: only ${sendableArticles.length} articles, minimum is ${minCount}, skipping`);
        results.push({ userId: settings.user_id, status: "skipped", message: `Below minimum (${sendableArticles.length}/${minCount})` });
        continue;
      }

      console.log(`User ${settings.user_id}: ${sendableArticles.length} articles to send`);

      // Get next issue number for this user
      const { data: lastSend } = await supabase
        .from("send_history")
        .select("issue_number")
        .eq("user_id", settings.user_id)
        .eq("status", "success")
        .not("issue_number", "is", null)
        .order("issue_number", { ascending: false })
        .limit(1)
        .single();

      const issueNumber = (lastSend?.issue_number || 0) + 1;

      // Generate EPUB
      let epubBuffer: Buffer;
      let epubFilename: string;
      try {
        const result = await generateKindleEpub({
          articles: sendableArticles,
          preferences: {
            font: settings.epub_font || "bookerly",
            includeImages: settings.epub_include_images ?? true,
            showAuthor: settings.epub_show_author ?? true,
            showReadTime: settings.epub_show_read_time ?? true,
            showPublishedDate: settings.epub_show_published_date ?? true,
          },
          issueNumber,
        });
        epubBuffer = result.buffer;
        epubFilename = result.filename;
        console.log(`User ${settings.user_id}: EPUB generated — ${epubFilename} (${epubBuffer.length} bytes)`);
      } catch (epubError) {
        const msg = epubError instanceof Error ? epubError.message : "Unknown";
        console.error(`User ${settings.user_id}: EPUB generation failed: ${msg}`);
        await supabase.from("send_history").insert({
          user_id: settings.user_id,
          article_count: sendableArticles.length,
          status: "failed",
          error_message: `Scheduled send — EPUB generation failed: ${msg}`,
        });
        results.push({ userId: settings.user_id, status: "failed", message: `EPUB error: ${msg}` });
        continue;
      }

      // Send email via Amazon SES
      try {
        await sendToKindle({
          to: settings.kindle_email,
          subject: "Articles",
          epubBuffer,
          epubFilename,
        });
        console.log(`User ${settings.user_id}: Email sent to ${settings.kindle_email}`);
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : "Unknown";
        console.error(`User ${settings.user_id}: Email failed: ${msg}`);
        await supabase.from("send_history").insert({
          user_id: settings.user_id,
          article_count: sendableArticles.length,
          status: "failed",
          error_message: `Scheduled send — Email failed: ${msg}`,
        });
        results.push({ userId: settings.user_id, status: "failed", message: `Email error: ${msg}` });
        continue;
      }

      // Success — update articles and log
      const nowIso = new Date().toISOString();
      await supabase
        .from("articles")
        .update({ status: "sent", sent_at: nowIso })
        .in("id", sendableArticles.map((a: { id: string }) => a.id));

      await supabase.from("send_history").insert({
        user_id: settings.user_id,
        article_count: sendableArticles.length,
        issue_number: issueNumber,
        status: "success",
        articles_data: sendableArticles.map((a: { title?: string; url: string }) => ({ title: a.title || null, url: a.url })),
      });

      console.log(`User ${settings.user_id}: ✅ Scheduled send successful — ${sendableArticles.length} articles (Issue #${issueNumber})`);
      results.push({ userId: settings.user_id, status: "success", message: `${sendableArticles.length} articles sent` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`User ${settings.user_id}: Unexpected error: ${msg}`);
      results.push({ userId: settings.user_id, status: "error", message: msg });
    }
  }

  return NextResponse.json({ message: "Scheduled send complete", results });
}
