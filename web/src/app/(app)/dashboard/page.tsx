"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Article } from "@/lib/types";

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<{ count: number; skipped: number } | null>(null);

  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchArticles = useCallback(async () => {
    const { data } = await supabase
      .from("articles")
      .select("id, url, title, author, description, content, read_time_minutes, status, created_at, sent_at")
      .eq("status", "queued")
      .order("created_at", { ascending: false });

    if (data) setArticles(data);
    setFetching(false);
  }, [supabase]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    // Basic URL validation
    const normalizedUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setLoading(true);
    setError(null);
    setUrl("");

    try {
      const res = await fetch("/api/articles/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add article");
        setLoading(false);
        return;
      }

      const article = data.article as Article;

      // Add article to list immediately
      setArticles((prev) => [article, ...prev]);
      setLoading(false);

      // If extraction hasn't completed yet (no content), poll for updates
      if (!article.content) {
        setExtractingIds((prev) => new Set(prev).add(article.id));
        pollForExtraction(article.id);
      }
    } catch {
      setError("Failed to add article. Please try again.");
      setLoading(false);
    }
  }

  async function pollForExtraction(articleId: string) {
    // Poll every 2 seconds for up to 30 seconds
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { data } = await supabase
        .from("articles")
        .select("id, url, title, author, description, content, read_time_minutes, status, created_at, sent_at")
        .eq("id", articleId)
        .single();

      if (data?.content) {
        // Extraction complete — update the article in the list
        setArticles((prev) =>
          prev.map((a) => (a.id === articleId ? data : a))
        );
        setExtractingIds((prev) => {
          const next = new Set(prev);
          next.delete(articleId);
          return next;
        });
        return;
      }
    }

    // Timeout — remove from extracting set (will show warning badge)
    setExtractingIds((prev) => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });
  }

  async function handleRemove(id: string) {
    await supabase.from("articles").delete().eq("id", id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setExtractingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    setSendSuccess(null);

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "settings_not_configured") {
          router.push("/settings");
          return;
        }
        setError(data.message || "Failed to send");
        setSending(false);
        return;
      }

      setSendSuccess({ count: data.articleCount, skipped: data.skippedCount || 0 });
      setArticles([]);
      setSending(false);
      setTimeout(() => setSendSuccess(null), 5000);
    } catch {
      setError("Failed to send. Please try again.");
      setSending(false);
    }
  }

  function extractDomain(urlStr: string): string {
    try {
      return new URL(urlStr).hostname.replace("www.", "");
    } catch {
      return urlStr;
    }
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const queueCount = articles.length;

  return (
    <div style={{ animation: 'fadeUp 0.6s ease both' }}>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl mb-1"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#ededed', letterSpacing: '-0.02em' }}>
          Reading Queue
        </h1>
        <p className="text-sm"
          style={{ fontFamily: "'DM Sans', sans-serif", color: '#888888' }}>
          {queueCount === 0
            ? "Add articles to send to your Kindle"
            : `${queueCount} article${queueCount !== 1 ? "s" : ""} queued`}
        </p>
      </div>

      {/* URL input */}
      <form onSubmit={handleAddUrl} className="mb-10">
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            placeholder="Paste an article URL…"
            className="flex-1 rounded-xl border px-4 py-3 text-base outline-none transition-all duration-200"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: '#141414',
              borderColor: '#262626',
              color: '#ededed',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#22c55e';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#262626';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-xl px-5 py-3 text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              background: loading ? '#16a34a' : '#22c55e',
              color: '#0a0a0a',
              boxShadow: '0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(34,197,94,0.3)',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#16a34a'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#22c55e'; }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Adding…
              </span>
            ) : (
              "Add"
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" opacity="0.7"/>
              <path d="M8 5v3.5M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-sm" style={{ color: '#ef4444', fontFamily: "'DM Sans', sans-serif" }}>
              {error}
            </span>
          </div>
        )}
      </form>

      {/* Article queue */}
      {fetching ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="#888888" strokeWidth="3"/>
            <path className="opacity-75" fill="#888888" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20" style={{ animation: 'fadeUp 0.6s ease 0.1s both' }}>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
            style={{ background: 'rgba(136,136,136,0.08)', border: '1px solid rgba(136,136,136,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#555555" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-sm mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: '#888888' }}>
            Your queue is empty
          </p>
          <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: '#555555' }}>
            Paste an article URL above to get started
          </p>
        </div>
      ) : (
        <div>
          <div className="space-y-2" style={{ animation: 'fadeUp 0.6s ease 0.1s both' }}>
            {articles.map((article) => {
              const isExtracting = extractingIds.has(article.id);
              const hasFailed = !isExtracting && !article.content;
              const authorDisplay = article.author || extractDomain(article.url);

              return (
                <div
                  key={article.id}
                  className="flex items-center justify-between rounded-xl border px-5 py-4 transition-colors duration-150"
                  style={{
                    borderColor: '#1a1a1a',
                    background: '#141414',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#141414'}
                >
                  <div className="min-w-0 flex-1 mr-4">
                    {/* Title */}
                    {isExtracting ? (
                      <div className="shimmer rounded" style={{ height: '16px', width: '60%', marginBottom: '8px' }} />
                    ) : (
                      <p className="text-sm truncate"
                        style={{ fontFamily: "'DM Sans', sans-serif", color: '#ededed', fontWeight: 500 }}>
                        {article.title || extractDomain(article.url)}
                      </p>
                    )}

                    {/* Author + Read time */}
                    {isExtracting ? (
                      <div className="shimmer rounded" style={{ height: '12px', width: '35%', marginTop: '4px' }} />
                    ) : (
                      <p className="text-xs mt-1 flex items-center gap-1.5"
                        style={{ fontFamily: "'DM Sans', sans-serif", color: '#888888' }}>
                        <span className="truncate">{authorDisplay}</span>
                        {article.read_time_minutes && (
                          <>
                            <span style={{ color: '#555555' }}>·</span>
                            <span className="shrink-0 inline-flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6.5" stroke="#888888" strokeWidth="1"/>
                                <path d="M8 5v3.5l2.5 1.5" stroke="#888888" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {article.read_time_minutes} min
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    {/* Warning for failed extraction */}
                    {hasFailed && (
                      <p className="text-xs mt-1 flex items-center gap-1"
                        style={{ fontFamily: "'DM Sans', sans-serif", color: '#f59e0b' }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M8 1.5L1 14h14L8 1.5z" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"/>
                          <path d="M8 6.5v3M8 11.5v.5" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                        Content could not be extracted
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {!isExtracting && (
                      <button
                        onClick={() => router.push(`/article/${article.id}`)}
                        className="p-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
                        style={{ color: '#888888' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#22c55e';
                          e.currentTarget.style.background = 'rgba(34,197,94,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888888';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title="Preview article"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      </button>
                    )}
                    <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: '#555555' }}>
                      {timeAgo(article.created_at)}
                    </span>
                    <button
                      onClick={() => handleRemove(article.id)}
                      className="p-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
                      style={{ color: '#555555' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#555555';
                        e.currentTarget.style.background = 'transparent';
                      }}
                      title="Remove from queue"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Send button */}
          <div className="mt-8 flex flex-col items-end gap-3" style={{ animation: 'fadeUp 0.6s ease 0.2s both' }}>
            <button
              disabled={sending || extractingIds.size > 0}
              className="rounded-xl px-6 py-3 text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                background: sending ? '#16a34a' : '#22c55e',
                color: '#0a0a0a',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(34,197,94,0.3)',
              }}
              onMouseEnter={(e) => { if (!sending) e.currentTarget.style.background = '#16a34a'; }}
              onMouseLeave={(e) => { if (!sending) e.currentTarget.style.background = '#22c55e'; }}
              onClick={handleSend}
            >
              {sending ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending…
                </span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Send {queueCount} to Kindle
                </>
              )}
            </button>

            {sendSuccess && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="7" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M5.5 8l2 2 3-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-sm" style={{ color: '#22c55e', fontFamily: "'DM Sans', sans-serif" }}>
                  {sendSuccess.count} article{sendSuccess.count !== 1 ? "s" : ""} sent to Kindle!
                  {sendSuccess.skipped > 0 && (
                    <span style={{ color: '#888888' }}>
                      {" "}({sendSuccess.skipped} skipped — no content)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        .shimmer {
          background: linear-gradient(90deg, #1a1a1a 25%, #262626 50%, #1a1a1a 75%);
          background-size: 400px 100%;
          animation: shimmer 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
