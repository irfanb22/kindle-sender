"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DOMPurify from "dompurify";
import type { Article } from "@/lib/types";
import KindleMockup from "./kindle-mockup";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span", "sub", "sup", "hr",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height",
  "class", "id", "target", "rel",
];

export default function ArticlePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function loadArticle() {
      const { data, error: fetchError } = await supabase
        .from("articles")
        .select("id, url, title, author, description, content, read_time_minutes, published_at, status, created_at, sent_at")
        .eq("id", id)
        .single();

      if (fetchError || !data) {
        setError("Article not found");
      } else {
        setArticle(data);
      }
      setLoading(false);
    }
    loadArticle();
  }, [id, supabase]);

  const sanitizedHtml = article?.content
    ? DOMPurify.sanitize(article.content, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
      })
    : null;

  function extractDomain(urlStr: string): string {
    try {
      return new URL(urlStr).hostname.replace("www.", "");
    } catch {
      return urlStr;
    }
  }

  return (
    <div style={{ animation: "fadeUp 0.6s ease both" }}>
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-2 mb-8 cursor-pointer transition-colors duration-150"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "0.875rem",
          color: "#888888",
          background: "none",
          border: "none",
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#ededed")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#888888")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to queue
      </button>

      {/* Error banner (network errors) */}
      {error && !loading && (
        <div className="flex flex-col items-center">
          <div
            style={{
              width: 420,
              height: 620,
              background: "#1a1a1a",
              borderRadius: 24,
              padding: "28px 24px 40px",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5), 0 12px 48px rgba(0,0,0,0.3)",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#f5f1e8",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 28px",
                textAlign: "center",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginBottom: 16, opacity: 0.4 }}
              >
                <circle cx="12" cy="12" r="10" stroke="#8a7e6b" strokeWidth="1.5" />
                <path
                  d="M12 8v4M12 16v.5"
                  stroke="#8a7e6b"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "0.95rem",
                  color: "#4a4437",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Article not found
              </p>
              <p
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "0.8rem",
                  color: "#8a7e6b",
                }}
              >
                This article may have been removed from your queue
              </p>
            </div>
            {/* Chin dot */}
            <div
              style={{
                position: "absolute",
                bottom: 14,
                left: "50%",
                transform: "translateX(-50%)",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#2a2a2a",
              }}
            />
          </div>
        </div>
      )}

      {/* Kindle mockup */}
      {!error && (
        <div className="flex flex-col items-center">
          <KindleMockup
            title={article?.title || extractDomain(article?.url || "")}
            author={article?.author || extractDomain(article?.url || "")}
            url={article?.url || ""}
            sanitizedHtml={sanitizedHtml}
            readTimeMinutes={article?.read_time_minutes ?? null}
            loading={loading}
          />
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
