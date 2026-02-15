import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const epubModule = require("epub-gen-memory");
const generateEpub = epubModule.default ?? epubModule;
import nodemailer from "nodemailer";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Load user's email settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("kindle_email, sender_email, smtp_password")
      .eq("user_id", user.id)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "settings_not_configured", message: "Please configure your email settings first." },
        { status: 400 }
      );
    }

    if (!settings.kindle_email || !settings.sender_email || !settings.smtp_password) {
      return NextResponse.json(
        { error: "settings_not_configured", message: "Please complete your email settings first." },
        { status: 400 }
      );
    }

    // Generate a small test EPUB
    const dateStr = new Date().toISOString().split("T")[0];
    const testContent = `
      <h2>Test Delivery Successful</h2>
      <p>This is a test email from Kindle Sender. If you're reading this on your Kindle, your email configuration is working correctly.</p>
      <p><strong>Sent:</strong> ${new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</p>
      <p><strong>From:</strong> ${settings.sender_email}</p>
      <p><strong>To:</strong> ${settings.kindle_email}</p>
      <p style="color: #666; margin-top: 2em; font-size: 0.9em;">You can delete this document from your Kindle library.</p>
    `;

    let epubBuffer: Buffer;
    try {
      const rawResult = await generateEpub(
        {
          title: `Kindle Sender - Test (${dateStr})`,
          author: "Kindle Sender",
          css: `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; margin: 1em; color: #1a1a1a; }
h2 { font-size: 1.2em; margin: 0 0 0.8em; }
p { margin: 0 0 0.75em; text-indent: 0; }`,
          ignoreFailedDownloads: true,
          verbose: false,
        },
        [
          {
            title: "Test Delivery",
            content: testContent,
            filename: "test.xhtml",
          },
        ]
      );

      if (Buffer.isBuffer(rawResult)) {
        epubBuffer = rawResult;
      } else if (rawResult instanceof Uint8Array) {
        epubBuffer = Buffer.from(rawResult);
      } else {
        throw new Error(`Unexpected epub result type: ${rawResult?.constructor?.name}`);
      }
    } catch (epubError) {
      const message = epubError instanceof Error ? epubError.message : "Unknown error";
      return NextResponse.json(
        { error: "test_failed", message: `EPUB generation failed: ${message}` },
        { status: 500 }
      );
    }

    // Send the test email
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
        subject: "Kindle Sender - Test",
        html: "<div></div>",
        attachments: [
          {
            filename: `KindleSender-Test-${dateStr}.epub`,
            content: epubBuffer,
            contentType: "application/epub+zip",
          },
        ],
      });
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : "Unknown error";
      return NextResponse.json(
        { error: "test_failed", message: `Email sending failed: ${message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: "test_failed", message },
      { status: 500 }
    );
  }
}
