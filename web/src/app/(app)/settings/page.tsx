"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const DAYS = [
  { value: "", label: "None" },
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
] as const;

export default function SettingsPage() {
  // Email config
  const [kindleEmail, setKindleEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [hasExistingPassword, setHasExistingPassword] = useState(false);

  // Auto-send
  const [autoSendThreshold, setAutoSendThreshold] = useState("");
  const [scheduleDay, setScheduleDay] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();

        if (data.settings) {
          setKindleEmail(data.settings.kindle_email || "");
          setSenderEmail(data.settings.sender_email || "");
          setHasExistingPassword(!!data.settings.smtp_password);
          setAutoSendThreshold(
            data.settings.auto_send_threshold
              ? String(data.settings.auto_send_threshold)
              : ""
          );
          setScheduleDay(data.settings.schedule_day || "");
          setScheduleTime(data.settings.schedule_time || "");
        }
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

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

    // Validate threshold if set
    if (autoSendThreshold) {
      const n = Number(autoSendThreshold);
      if (isNaN(n) || n < 2 || n > 50) {
        setError("Auto-send threshold must be between 2 and 50");
        return;
      }
    }

    setSaving(true);

    try {
      const body: Record<string, string | number | null> = {
        kindle_email: kindleEmail.trim(),
        sender_email: senderEmail.trim(),
        auto_send_threshold: autoSendThreshold ? Number(autoSendThreshold) : null,
        schedule_day: scheduleDay || null,
        schedule_time: scheduleTime || null,
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
            auto_send_threshold: body.auto_send_threshold,
            schedule_day: body.schedule_day,
            schedule_time: body.schedule_time,
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
            Configure your Kindle email and sending preferences
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
          Configure your Kindle email and sending preferences
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

        {/* Auto-Send Preferences */}
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
                Auto-Send
              </h2>
              <p
                className="text-xs"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#666666",
                }}
              >
                Automatically send when your queue reaches a threshold or on a
                schedule
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Threshold */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Auto-send after N articles
              </label>
              <input
                type="number"
                min="2"
                max="50"
                value={autoSendThreshold}
                onChange={(e) => {
                  setAutoSendThreshold(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 5 (leave empty to disable)"
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
                When your queue reaches this number, a 30-second countdown
                starts before sending
              </p>
            </div>

            {/* Divider */}
            <div
              className="flex items-center gap-3"
              style={{ color: "#555555" }}
            >
              <div
                className="flex-1 h-px"
                style={{ background: "#1e1e1e" }}
              />
              <span
                className="text-xs"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                or
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: "#1e1e1e" }}
              />
            </div>

            {/* Schedule */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#888888",
                }}
              >
                Weekly schedule
              </label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <select
                    value={scheduleDay}
                    onChange={(e) => {
                      setScheduleDay(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 appearance-none"
                    style={inputStyle}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  >
                    {DAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => {
                      setScheduleTime(e.target.value);
                      setError(null);
                    }}
                    disabled={!scheduleDay}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={inputStyle}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </div>
              <p
                className="text-xs mt-1.5"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#555555",
                }}
              >
                {scheduleDay
                  ? "Queued articles will be sent automatically on this day and time"
                  : "Select a day to enable weekly scheduled sending"}
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
          style={{ animation: "fadeUp 0.6s ease 0.2s both" }}
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
