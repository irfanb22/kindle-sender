"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

function getTimezoneList(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    // Fallback for older browsers
    return [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Berlin",
      "Europe/Paris",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
      "UTC",
    ];
  }
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function formatTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    const offset = offsetPart?.value || "";
    // Turn "America/New_York" into "New York"
    const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
    return `${city} (${offset})`;
  } catch {
    return tz;
  }
}

export default function SettingsPage() {
  // Email config
  const [kindleEmail, setKindleEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  // Delivery schedule
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState("");
  const [timezone, setTimezone] = useState("");
  const [minArticleCount, setMinArticleCount] = useState("");

  // EPUB formatting
  const [epubFont, setEpubFont] = useState("bookerly");
  const [epubIncludeImages, setEpubIncludeImages] = useState(true);
  const [epubShowAuthor, setEpubShowAuthor] = useState(true);
  const [epubShowReadTime, setEpubShowReadTime] = useState(true);
  const [epubShowPublishedDate, setEpubShowPublishedDate] = useState(true);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());
  const timezones = useRef(getTimezoneList());

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();

        if (data.settings) {
          setKindleEmail(data.settings.kindle_email || "");
          setSenderEmail(data.settings.sender_email || "");
          setHasExistingPassword(!!data.settings.smtp_password);
          setScheduleDays(data.settings.schedule_days || []);
          setScheduleTime(data.settings.schedule_time || "");
          setTimezone(data.settings.timezone || getLocalTimezone());
          setMinArticleCount(
            data.settings.min_article_count
              ? String(data.settings.min_article_count)
              : ""
          );
          setEpubFont(data.settings.epub_font || "bookerly");
          setEpubIncludeImages(data.settings.epub_include_images ?? true);
          setEpubShowAuthor(data.settings.epub_show_author ?? true);
          setEpubShowReadTime(data.settings.epub_show_read_time ?? true);
          setEpubShowPublishedDate(data.settings.epub_show_published_date ?? true);
        } else {
          // No settings yet — auto-detect timezone
          setTimezone(getLocalTimezone());
        }
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  function toggleDay(day: string) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!kindleEmail.trim() || !senderEmail.trim()) {
      setError("Kindle email and Gmail address are required");
      return;
    }

    if (!smtpPassword && !hasExistingPassword) {
      setError("Gmail app password is required");
      return;
    }

    // Validate min article count if set
    if (minArticleCount) {
      const n = Number(minArticleCount);
      if (isNaN(n) || n < 1 || n > 50) {
        setError("Minimum article count must be between 1 and 50");
        return;
      }
    }

    setSaving(true);

    try {
      const body: Record<string, string | number | boolean | string[] | null> = {
        kindle_email: kindleEmail.trim(),
        sender_email: senderEmail.trim(),
        min_article_count: minArticleCount ? Number(minArticleCount) : null,
        schedule_days: scheduleDays.length > 0 ? scheduleDays : null,
        schedule_time: scheduleTime || null,
        timezone: timezone || null,
        epub_font: epubFont,
        epub_include_images: epubIncludeImages,
        epub_show_author: epubShowAuthor,
        epub_show_read_time: epubShowReadTime,
        epub_show_published_date: epubShowPublishedDate,
      };

      // Only send password if the user entered a new one
      if (smtpPassword) {
        body.smtp_password = smtpPassword;
      } else if (hasExistingPassword) {
        // No new password — update everything except smtp_password via Supabase directly
        const supabase = supabaseRef.current;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Not authenticated");
          setSaving(false);
          return;
        }

        const { error: updateError } = await supabase
          .from("settings")
          .update({
            kindle_email: body.kindle_email,
            sender_email: body.sender_email,
            min_article_count: body.min_article_count,
            schedule_days: body.schedule_days,
            schedule_time: body.schedule_time,
            timezone: body.timezone,
            epub_font: body.epub_font,
            epub_include_images: body.epub_include_images,
            epub_show_author: body.epub_show_author,
            epub_show_read_time: body.epub_show_read_time,
            epub_show_published_date: body.epub_show_published_date,
          })
          .eq("user_id", user.id);

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }

        setSuccess("Settings saved");
        setSaving(false);
        setTimeout(() => setSuccess(null), 5000);
        return;
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save settings");
        setSaving(false);
        return;
      }

      setSuccess("Settings saved");
      setHasExistingPassword(true);
      setSmtpPassword("");
      setSaving(false);
      setTimeout(() => setSuccess(null), 5000);
    } catch {
      setError("Failed to save settings");
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/send/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "settings_not_configured") {
          setError("Please save your email settings first");
        } else {
          setError(data.message || "Test email failed");
        }
        setTesting(false);
        return;
      }

      setSuccess("Test EPUB sent — check your Kindle in a few minutes");
      setTesting(false);
      setTimeout(() => setSuccess(null), 8000);
    } catch {
      setError("Failed to send test email");
      setTesting(false);
    }
  }

  const inputStyle = {
    fontFamily: "'DM Sans', sans-serif",
    background: "#0a0a0a",
    borderColor: "#262626",
    color: "#ededed",
  };

  function handleFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = "#22c55e";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.1)";
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = "#262626";
    e.currentTarget.style.boxShadow = "none";
  }

  if (loading) {
    return (
      <div style={{ animation: "fadeUp 0.6s ease both" }}>
        <div className="mb-8">
          <h1
            className="text-3xl mb-1"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              color: "#ededed",
              letterSpacing: "-0.02em",
            }}
          >
            Settings
          </h1>
          <p
            className="text-sm"
            style={{ fontFamily: "'DM Sans', sans-serif", color: "#888888" }}
          >
            Configure your Kindle email and delivery preferences
          </p>
        </div>
        <div className="flex items-center justify-center py-20">
          <svg
            className="animate-spin h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="#888888"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="#888888"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  const hasSchedule = scheduleDays.length > 0;

  return (
    <div style={{ animation: "fadeUp 0.6s ease both" }}>
      <div className="mb-8">
        <h1
          className="text-3xl mb-1"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            color: "#ededed",
            letterSpacing: "-0.02em",
          }}
        >
          Settings
        </h1>
        <p
          className="text-sm"
          style={{ fontFamily: "'DM Sans', sans-serif", color: "#888888" }}
        >
          Configure your Kindle email and delivery preferences
        </p>
      </div>

      <form onSubmit={handleSave}>
        {/* Email Configuration */}
        <div
          className="rounded-xl border p-6 mb-4"
          style={{
            background: "#141414",
            borderColor: "#262626",
            animation: "fadeUp 0.6s ease 0.1s both",
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.15)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect
                  x="2"
                  y="4"
                  width="20"
                  height="16"
                  rx="2"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                />
                <path
                  d="M2 7l10 7 10-7"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-base"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  color: "#ededed",
                }}
              >
                Email Configuration
              </h2>
              <p
                className="text-xs"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#666666",
                }}
              >
                Required to send articles to your Kindle
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Kindle Email
              </label>
              <input
                type="email"
                value={kindleEmail}
                onChange={(e) => {
                  setKindleEmail(e.target.value);
                  setError(null);
                }}
                placeholder="yourname@kindle.com"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Found in Amazon → Manage Content &amp; Devices → Preferences →
                Personal Document Settings
              </p>
            </div>

            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Gmail Address
              </label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => {
                  setSenderEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@gmail.com"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Must be added to your Amazon approved sender list
              </p>
            </div>

            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Gmail App Password
              </label>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => {
                  setSmtpPassword(e.target.value);
                  setError(null);
                }}
                placeholder={
                  hasExistingPassword
                    ? "••••••••••••••••"
                    : "16-character app password"
                }
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Not your Gmail password.{" "}
                <a
                  href="https://support.google.com/accounts/answer/185833"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#22c55e" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#16a34a")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "#22c55e")
                  }
                >
                  How to create an app password →
                </a>
              </p>
            </div>
          </div>

          {/* Test email button */}
          <div
            className="mt-5 pt-5"
            style={{ borderTop: "1px solid #1e1e1e" }}
          >
            <button
              type="button"
              disabled={testing || !hasExistingPassword}
              onClick={handleTestEmail}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: "#888888",
                background: "transparent",
                border: "1px solid #262626",
              }}
              onMouseEnter={(e) => {
                if (!testing && hasExistingPassword) {
                  e.currentTarget.style.borderColor = "#404040";
                  e.currentTarget.style.color = "#ededed";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#262626";
                e.currentTarget.style.color = "#888888";
              }}
            >
              {testing ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Sending test…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12h14M12 5l7 7-7 7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Send test EPUB to Kindle
                </>
              )}
            </button>
            {!hasExistingPassword && (
              <p
                className="text-xs mt-2"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Save your email settings first to enable testing
              </p>
            )}
          </div>
        </div>

        {/* Automatic Delivery */}
        <div
          className="rounded-xl border p-6 mb-4"
          style={{
            background: "#141414",
            borderColor: "#262626",
            animation: "fadeUp 0.6s ease 0.15s both",
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                background: "rgba(136,136,136,0.08)",
                border: "1px solid rgba(136,136,136,0.1)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="#888888"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 7v5l3 3"
                  stroke="#888888"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-base"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  color: "#ededed",
                }}
              >
                Automatic Delivery
              </h2>
              <p
                className="text-xs"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#666666",
                }}
              >
                Schedule when queued articles are automatically sent to your Kindle
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Day picker */}
            <div>
              <label
                className="block text-xs mb-2.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Delivery days
              </label>
              <div className="flex gap-2">
                {DAY_OPTIONS.map((day) => {
                  const isSelected = scheduleDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className="flex-1 rounded-lg py-2 text-xs font-medium transition-all duration-200 cursor-pointer"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        background: isSelected
                          ? "rgba(34,197,94,0.15)"
                          : "#0a0a0a",
                        border: isSelected
                          ? "1px solid rgba(34,197,94,0.4)"
                          : "1px solid #262626",
                        color: isSelected ? "#22c55e" : "#888888",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#404040";
                          e.currentTarget.style.color = "#ededed";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#262626";
                          e.currentTarget.style.color = "#888888";
                        }
                      }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                {hasSchedule
                  ? `Delivery on ${scheduleDays.length} day${scheduleDays.length !== 1 ? "s" : ""} per week`
                  : "Select days to enable automatic delivery"}
              </p>
            </div>

            {/* Time + Timezone row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  className="block text-xs mb-1.5"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#888888",
                  }}
                >
                  Delivery time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => {
                    setScheduleTime(e.target.value);
                    setError(null);
                  }}
                  disabled={!hasSchedule}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <div className="flex-1">
                <label
                  className="block text-xs mb-1.5"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#888888",
                  }}
                >
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setError(null);
                  }}
                  disabled={!hasSchedule}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 appearance-none disabled:opacity-40 disabled:cursor-not-allowed"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                >
                  {timezones.current.map((tz) => (
                    <option key={tz} value={tz}>
                      {formatTimezoneLabel(tz)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Minimum articles */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Minimum articles to send
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={minArticleCount}
                onChange={(e) => {
                  setMinArticleCount(e.target.value);
                  setError(null);
                }}
                disabled={!hasSchedule}
                placeholder="1"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                {hasSchedule
                  ? "Skips delivery if your queue has fewer articles than this"
                  : "Select delivery days first to configure"}
              </p>
            </div>
          </div>
        </div>

        {/* EPUB Formatting */}
        <div
          className="rounded-xl border p-6 mb-4"
          style={{
            background: "#141414",
            borderColor: "#262626",
            animation: "fadeUp 0.6s ease 0.2s both",
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.15)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 19.5A2.5 2.5 0 016.5 17H20"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-base"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  color: "#ededed",
                }}
              >
                EPUB Formatting
              </h2>
              <p
                className="text-xs"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#666666",
                }}
              >
                Customize how articles appear on your Kindle
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Font selection */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Body font
              </label>
              <select
                value={epubFont}
                onChange={(e) => {
                  setEpubFont(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 appearance-none"
                style={inputStyle}
                onFocus={handleFocus}
                onBlur={handleBlur}
              >
                <option value="bookerly">Bookerly (Kindle default)</option>
                <option value="georgia">Georgia</option>
                <option value="palatino">Palatino</option>
                <option value="helvetica">Helvetica</option>
              </select>
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Font used for article body text in the EPUB
              </p>
            </div>

            {/* Include images toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label
                  className="block text-xs"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#888888",
                  }}
                >
                  Include images
                </label>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#555555",
                  }}
                >
                  When off, images are stripped from articles
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={epubIncludeImages}
                onClick={() => setEpubIncludeImages(!epubIncludeImages)}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200"
                style={{
                  background: epubIncludeImages
                    ? "rgba(34,197,94,0.4)"
                    : "#262626",
                  border: epubIncludeImages
                    ? "1px solid rgba(34,197,94,0.5)"
                    : "1px solid #404040",
                }}
              >
                <span
                  className="inline-block h-5 w-5 rounded-full transition-transform duration-200"
                  style={{
                    background: epubIncludeImages ? "#22c55e" : "#666666",
                    transform: epubIncludeImages
                      ? "translateX(20px)"
                      : "translateX(0px)",
                    marginTop: "0.5px",
                  }}
                />
              </button>
            </div>

            {/* Article metadata toggles */}
            <div>
              <label
                className="block text-xs mb-2.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Show in article headers
              </label>
              <div className="flex gap-2">
                {([
                  { label: "Author", value: epubShowAuthor, setter: setEpubShowAuthor },
                  { label: "Read time", value: epubShowReadTime, setter: setEpubShowReadTime },
                  { label: "Published date", value: epubShowPublishedDate, setter: setEpubShowPublishedDate },
                ] as const).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => item.setter(!item.value)}
                    className="flex-1 rounded-lg py-2 text-xs font-medium transition-all duration-200 cursor-pointer"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      background: item.value
                        ? "rgba(34,197,94,0.15)"
                        : "#0a0a0a",
                      border: item.value
                        ? "1px solid rgba(34,197,94,0.4)"
                        : "1px solid #262626",
                      color: item.value ? "#22c55e" : "#888888",
                    }}
                    onMouseEnter={(e) => {
                      if (!item.value) {
                        e.currentTarget.style.borderColor = "#404040";
                        e.currentTarget.style.color = "#ededed";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!item.value) {
                        e.currentTarget.style.borderColor = "#262626";
                        e.currentTarget.style.color = "#888888";
                      }
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                Metadata shown below each article title in the EPUB
              </p>
            </div>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2.5"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="mt-0.5 shrink-0"
            >
              <circle
                cx="8"
                cy="8"
                r="7"
                stroke="#ef4444"
                strokeWidth="1.5"
                opacity="0.7"
              />
              <path
                d="M8 5v3.5M8 10.5v.5"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span
              className="text-sm"
              style={{ color: "#ef4444", fontFamily: "'DM Sans', sans-serif" }}
            >
              {error}
            </span>
          </div>
        )}

        {success && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.15)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0"
            >
              <circle
                cx="8"
                cy="8"
                r="7"
                stroke="#22c55e"
                strokeWidth="1.5"
              />
              <path
                d="M5.5 8l2 2 3-4"
                stroke="#22c55e"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="text-sm"
              style={{ color: "#22c55e", fontFamily: "'DM Sans', sans-serif" }}
            >
              {success}
            </span>
          </div>
        )}

        {/* Save button */}
        <div
          className="flex justify-end"
          style={{ animation: "fadeUp 0.6s ease 0.25s both" }}
        >
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl px-6 py-3 text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: saving ? "#16a34a" : "#22c55e",
              color: "#0a0a0a",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(34,197,94,0.3)",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "#16a34a";
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = "#22c55e";
            }}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Saving…
              </span>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </form>

      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
