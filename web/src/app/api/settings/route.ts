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
        "kindle_email, sender_email, smtp_password, auto_send_threshold, schedule_day, schedule_time"
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

    // Mask the SMTP password — never send the actual value to the client
    return NextResponse.json({
      settings: {
        ...data,
        smtp_password: data.smtp_password ? "••••••••" : null,
      },
    });
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
    const { kindle_email, sender_email, smtp_password, auto_send_threshold, schedule_day, schedule_time } = body;

    if (!kindle_email || !sender_email || !smtp_password) {
      return NextResponse.json(
        { error: "All three fields are required: Kindle email, Gmail address, and app password" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!sender_email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid Gmail address" },
        { status: 400 }
      );
    }

    if (!kindle_email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid Kindle email address" },
        { status: 400 }
      );
    }

    // Validate auto_send_threshold if provided
    if (auto_send_threshold !== undefined && auto_send_threshold !== null) {
      const threshold = Number(auto_send_threshold);
      if (isNaN(threshold) || threshold < 2 || threshold > 50) {
        return NextResponse.json(
          { error: "Auto-send threshold must be between 2 and 50" },
          { status: 400 }
        );
      }
    }

    // Validate schedule_day if provided
    const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    if (schedule_day && !validDays.includes(schedule_day)) {
      return NextResponse.json(
        { error: "Invalid schedule day" },
        { status: 400 }
      );
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
      sender_email,
      smtp_password,
      auto_send_threshold: auto_send_threshold || null,
      schedule_day: schedule_day || null,
      schedule_time: schedule_time || null,
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
