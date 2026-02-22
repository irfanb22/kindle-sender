import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

    const { data, error } = await supabase
      .from("settings")
      .select(
        "kindle_email, min_article_count, schedule_days, schedule_time, timezone, epub_font, epub_include_images, epub_show_author, epub_show_read_time, epub_show_published_date"
      )
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (not an error — user just hasn't configured settings)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { kindle_email, min_article_count, schedule_days, schedule_time, timezone, epub_font, epub_include_images, epub_show_author, epub_show_read_time, epub_show_published_date } = body;

    if (!kindle_email) {
      return NextResponse.json(
        { error: "Kindle email is required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!kindle_email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid Kindle email address" },
        { status: 400 }
      );
    }

    // Validate min_article_count if provided
    if (min_article_count !== undefined && min_article_count !== null) {
      const count = Number(min_article_count);
      if (isNaN(count) || count < 1 || count > 50) {
        return NextResponse.json(
          { error: "Minimum article count must be between 1 and 50" },
          { status: 400 }
        );
      }
    }

    // Validate epub_font if provided
    const validFonts = ["bookerly", "georgia", "palatino", "helvetica"];
    if (epub_font && !validFonts.includes(epub_font)) {
      return NextResponse.json(
        { error: "Invalid font choice" },
        { status: 400 }
      );
    }

    // Validate schedule_days if provided
    const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    if (schedule_days && Array.isArray(schedule_days)) {
      for (const day of schedule_days) {
        if (!validDays.includes(day)) {
          return NextResponse.json(
            { error: `Invalid schedule day: ${day}` },
            { status: 400 }
          );
        }
      }
    }

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

    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      kindle_email,
      min_article_count: min_article_count || null,
      schedule_days: schedule_days && schedule_days.length > 0 ? schedule_days : null,
      schedule_time: schedule_time || null,
      timezone: timezone || null,
      epub_font: epub_font || "bookerly",
      epub_include_images: epub_include_images ?? true,
      epub_show_author: epub_show_author ?? true,
      epub_show_read_time: epub_show_read_time ?? true,
      epub_show_published_date: epub_show_published_date ?? true,
    };

    const { error } = await supabase.from("settings").upsert(upsertData);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
