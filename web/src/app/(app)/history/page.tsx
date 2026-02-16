"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SendHistory } from "@/lib/types";

export default function HistoryPage() {
  const [history, setHistory] = useState<SendHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    async function loadHistory() {
      const supabase = supabaseRef.current;
      const { data } = await supabase
        .from("send_history")
        .select("id, article_count, issue_number, status, error_message, sent_at")
        .order("sent_at", { ascending: false })
        .limit(10);

      if (data) setHistory(data);
      setLoading(false);
    }

    loadHistory();
  }, []);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    if (diffHours < 168) {
      // within 7 days
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
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
          Send History
        </h1>
        <p
          className="text-sm"
          style={{ fontFamily: "'DM Sans', sans-serif", color: "#888888" }}
        >
          Your recent sends to Kindle
        </p>
      </div>

      {loading ? (
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
      ) : history.length === 0 ? (
        <div
          className="text-center py-20"
          style={{ animation: "fadeUp 0.6s ease 0.1s both" }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
            style={{
              background: "rgba(136,136,136,0.08)",
              border: "1px solid rgba(136,136,136,0.1)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#555555"
                strokeWidth="1.5"
              />
              <path
                d="M12 7v5l3 3"
                stroke="#555555"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p
            className="text-sm mb-1"
            style={{ fontFamily: "'DM Sans', sans-serif", color: "#888888" }}
          >
            No sends yet
          </p>
          <p
            className="text-xs"
            style={{ fontFamily: "'DM Sans', sans-serif", color: "#555555" }}
          >
            Your send history will appear here
          </p>
        </div>
      ) : (
        <div
          className="space-y-2"
          style={{ animation: "fadeUp 0.6s ease 0.1s both" }}
        >
          {history.map((entry) => {
            const isSuccess = entry.status === "success";

            return (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border px-5 py-4 transition-colors duration-150"
                style={{
                  borderColor: "#1a1a1a",
                  background: "#141414",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#1a1a1a")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#141414")
                }
              >
                <div className="flex items-center gap-4">
                  {/* Status icon */}
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                    style={{
                      background: isSuccess
                        ? "rgba(34,197,94,0.1)"
                        : "rgba(239,68,68,0.1)",
                      border: `1px solid ${isSuccess ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                    }}
                  >
                    {isSuccess ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M4 8.5l3 3 5-6"
                          stroke="#22c55e"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M5 5l6 6M11 5l-6 6"
                          stroke="#ef4444"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Details */}
                  <div>
                    <p
                      className="text-sm"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        color: "#ededed",
                        fontWeight: 500,
                      }}
                    >
                      {entry.issue_number
                        ? `Issue #${entry.issue_number} — `
                        : ""}
                      {entry.article_count} article
                      {entry.article_count !== 1 ? "s" : ""} sent
                    </p>
                    {entry.error_message && (
                      <p
                        className="text-xs mt-0.5 max-w-md truncate"
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          color: "#ef4444",
                        }}
                      >
                        {entry.error_message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <span
                  className="text-xs shrink-0"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#555555",
                  }}
                >
                  {formatDate(entry.sent_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}

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
