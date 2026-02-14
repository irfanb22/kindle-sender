import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import epubModule from "epub-gen-memory";

// epub-gen-memory's ESM default export is the module object, not the function.
// The actual generator function is at .default
const generateEpub = epubModule.default ?? epubModule;
import nodemailer from "nodemailer";

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

    // Load user's email settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("kindle_email, sender_email, smtp_password")
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

    if (!settings.kindle_email || !settings.sender_email || !settings.smtp_password) {
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

    // Generate EPUB
    const dateStr = new Date().toISOString().split("T")[0];

    const chapters = sendableArticles.map((article, i) => {
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

      // Ensure we have a proper Buffer
      if (Buffer.isBuffer(rawResult)) {
        epubBuffer = rawResult;
      } else if (rawResult instanceof Uint8Array) {
        epubBuffer = Buffer.from(rawResult);
      } else {
        throw new Error(`Unexpected epub result type: ${rawResult?.constructor?.name}`);
      }
    } catch (epubError) {
      const message =
        epubError instanceof Error
          ? epubError.message
          : "Unknown EPUB generation error";

      // Log failure to send_history
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

    // Send email via Gmail SMTP
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
      status: "success",
    });

    return NextResponse.json({
      success: true,
      articleCount,
      skippedCount,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    // Try to log failure if we have a supabase client and user
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
