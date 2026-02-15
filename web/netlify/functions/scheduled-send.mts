import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// Day abbreviation to JS day number (0=Sun, 1=Mon, etc.)
const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default async function handler() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL — skipping scheduled send");
    return new Response("Missing env vars", { status: 200 });
  }

  // Use service role key to bypass RLS
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const currentDay = now.getUTCDay(); // 0-6
  const currentHour = now.getUTCHours();

  // Find users whose schedule matches the current UTC day and hour
  // schedule_time is stored as "HH:MM" (user's local time — we match by hour)
  const { data: allSettings, error: settingsError } = await supabase
    .from("settings")
    .select("user_id, kindle_email, sender_email, smtp_password, schedule_day, schedule_time")
    .not("schedule_day", "is", null)
    .not("schedule_time", "is", null)
    .not("kindle_email", "is", null)
    .not("sender_email", "is", null)
    .not("smtp_password", "is", null);

  if (settingsError) {
    console.error("Failed to query settings:", settingsError.message);
    return new Response("Settings query failed", { status: 200 });
  }

  if (!allSettings || allSettings.length === 0) {
    console.log("No users with scheduled sends configured");
    return new Response("No scheduled sends", { status: 200 });
  }

  // Filter to users whose schedule matches the current UTC hour
  // Note: schedule_time is stored as the user's intended local time.
  // For a proper implementation, we'd need timezone per user.
  // For now, we match on UTC — the user sets the time in their local tz
  // and we treat it as UTC. This is documented as a known limitation.
  const matchingUsers = allSettings.filter((s) => {
    const dayNum = DAY_MAP[s.schedule_day];
    if (dayNum === undefined || dayNum !== currentDay) return false;

    // Parse HH:MM and match the hour
    const [hourStr] = (s.schedule_time as string).split(":");
    const scheduleHour = parseInt(hourStr, 10);
    return scheduleHour === currentHour;
  });

  if (matchingUsers.length === 0) {
    console.log(`No users scheduled for day=${currentDay} hour=${currentHour}`);
    return new Response("No matching schedules", { status: 200 });
  }

  console.log(`Found ${matchingUsers.length} user(s) to process for scheduled send`);

  // Dynamically import epub-gen-memory
  const epubModule = await import("epub-gen-memory");
  const generateEpub = epubModule.default ?? epubModule;

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
        continue;
      }

      // Filter to articles with content
      const sendableArticles = articles.filter(
        (a: { content?: string }) => a.content && a.content.trim().length > 0
      );

      if (sendableArticles.length === 0) {
        console.log(`User ${settings.user_id}: no articles with content, skipping`);
        continue;
      }

      // Generate EPUB
      const dateStr = new Date().toISOString().split("T")[0];
      const chapters = sendableArticles.map((article: { title?: string; url: string; author?: string; read_time_minutes?: number; content: string }, i: number) => {
        const titleText = article.title || extractDomain(article.url);
        const readTime = article.read_time_minutes ? `${article.read_time_minutes} min` : "";
        const tocTitle = [titleText, readTime].filter(Boolean).join(" · ");
        const authorDisplay = article.author || extractDomain(article.url);
        const metaParts = [authorDisplay, readTime ? `${readTime} read` : ""].filter(Boolean).join(" · ");

        return {
          title: tocTitle,
          content: `<p class="meta">${escapeHtml(metaParts)}</p>\n${article.content}`,
          filename: `article_${i}.xhtml`,
        };
      });

      let epubBuffer: Buffer;
      try {
        const rawResult = await generateEpub(
          {
            title: `ReadLater - ${dateStr}`,
            author: "Kindle Sender",
            css: `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; margin: 1em; color: #1a1a1a; }
h1 { font-size: 1.35em; margin: 0 0 0.3em; }
.meta { color: #666; font-size: 0.82em; margin-bottom: 1.8em; }
p { margin: 0 0 0.75em; text-indent: 0; }`,
            ignoreFailedDownloads: true,
            fetchTimeout: 10000,
            verbose: false,
          },
          chapters
        );

        if (Buffer.isBuffer(rawResult)) {
          epubBuffer = rawResult;
        } else if (rawResult instanceof Uint8Array) {
          epubBuffer = Buffer.from(rawResult);
        } else {
          throw new Error(`Unexpected epub result type`);
        }
      } catch (epubError) {
        const msg = epubError instanceof Error ? epubError.message : "Unknown";
        console.error(`User ${settings.user_id}: EPUB generation failed: ${msg}`);
        await supabase.from("send_history").insert({
          user_id: settings.user_id,
          article_count: sendableArticles.length,
          status: "failed",
          error_message: `Scheduled send — EPUB generation failed: ${msg}`,
        });
        continue;
      }

      // Send email
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: settings.sender_email,
            pass: settings.smtp_password,
          },
        });

        await transporter.sendMail({
          from: settings.sender_email,
          to: settings.kindle_email,
          subject: "Articles",
          html: "<div></div>",
          attachments: [
            {
              filename: `ReadLater-${dateStr}.epub`,
              content: epubBuffer,
              contentType: "application/epub+zip",
            },
          ],
        });
      } catch (emailError) {
        const msg = emailError instanceof Error ? emailError.message : "Unknown";
        console.error(`User ${settings.user_id}: Email failed: ${msg}`);
        await supabase.from("send_history").insert({
          user_id: settings.user_id,
          article_count: sendableArticles.length,
          status: "failed",
          error_message: `Scheduled send — Email failed: ${msg}`,
        });
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
        status: "success",
      });

      console.log(`User ${settings.user_id}: Scheduled send successful — ${sendableArticles.length} articles`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`User ${settings.user_id}: Unexpected error: ${msg}`);
    }
  }

  return new Response("Scheduled send complete", { status: 200 });
}

// Run every hour at the top of the hour
export const config: Config = {
  schedule: "0 * * * *",
};
