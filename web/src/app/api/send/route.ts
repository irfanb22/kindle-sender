import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateKindleEpub } from "@/lib/epub";
import { sendToKindle } from "@/lib/email";

export async function POST() {
  let supabase;
  let userId: string | undefined;
  let articleCount = 0;

  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    userId = user.id;

    // Load user's email settings and EPUB preferences
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("kindle_email, epub_font, epub_include_images, epub_show_author, epub_show_read_time, epub_show_published_date")
      .eq("user_id", user.id)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        {
          error: "settings_not_configured",
          message: "Please configure your email settings before sending.",
        },
        { status: 400 }
      );
    }

    if (!settings.kindle_email) {
      return NextResponse.json(
        {
          error: "settings_not_configured",
          message: "Please complete your email settings before sending.",
        },
        { status: 400 }
      );
    }

    // Fetch all queued articles
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (articlesError) {
      return NextResponse.json(
        { error: "send_failed", message: "Failed to load articles." },
        { status: 500 }
      );
    }

    if (!articles || articles.length === 0) {
      return NextResponse.json(
        { error: "no_articles", message: "No articles in queue." },
        { status: 400 }
      );
    }

    // Filter to only articles with extracted content
    const sendableArticles = articles.filter(
      (a) => a.content && a.content.trim().length > 0
    );
    const skippedCount = articles.length - sendableArticles.length;

    if (sendableArticles.length === 0) {
      return NextResponse.json(
        {
          error: "no_content",
          message: "None of the queued articles have extracted content. Try removing and re-adding them.",
        },
        { status: 400 }
      );
    }

    articleCount = sendableArticles.length;

    // Get next issue number for this user
    const { data: lastSend } = await supabase
      .from("send_history")
      .select("issue_number")
      .eq("user_id", user.id)
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
    } catch (epubError) {
      const message =
        epubError instanceof Error
          ? epubError.message
          : "Unknown EPUB generation error";

      await supabase.from("send_history").insert({
        user_id: user.id,
        article_count: articleCount,
        status: "failed",
        error_message: `EPUB generation failed: ${message}`,
      });

      return NextResponse.json(
        { error: "send_failed", message: `EPUB generation failed: ${message}` },
        { status: 500 }
      );
    }

    // Send email via Amazon SES
    try {
      await sendToKindle({
        to: settings.kindle_email,
        subject: "Articles",
        epubBuffer,
        epubFilename,
      });
    } catch (emailError) {
      const message =
        emailError instanceof Error
          ? emailError.message
          : "Unknown email error";

      await supabase.from("send_history").insert({
        user_id: user.id,
        article_count: articleCount,
        status: "failed",
        error_message: `Email sending failed: ${message}`,
      });

      return NextResponse.json(
        { error: "send_failed", message: `Email sending failed: ${message}` },
        { status: 500 }
      );
    }

    // Success — update articles and create history record
    const now = new Date().toISOString();

    await supabase
      .from("articles")
      .update({ status: "sent", sent_at: now })
      .in(
        "id",
        sendableArticles.map((a) => a.id)
      );

    await supabase.from("send_history").insert({
      user_id: user.id,
      article_count: articleCount,
      issue_number: issueNumber,
      status: "success",
      articles_data: sendableArticles.map((a) => ({ title: a.title || null, url: a.url })),
    });

    return NextResponse.json({
      success: true,
      articleCount,
      skippedCount,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    if (supabase && userId) {
      await supabase.from("send_history").insert({
        user_id: userId,
        article_count: articleCount,
        status: "failed",
        error_message: message,
      });
    }

    return NextResponse.json(
      { error: "send_failed", message },
      { status: 500 }
    );
  }
}
