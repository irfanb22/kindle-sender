"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&display=swap');
      `}</style>

      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
        style={{ background: '#0a0a0a' }}>

        {/* Subtle ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #22c55e 0%, transparent 70%)' }} />

        {/* Faint grid texture */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(#ededed 1px, transparent 1px), linear-gradient(90deg, #ededed 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
          }} />

        <div className="relative z-10 w-full max-w-md">

          {/* Logo & Title */}
          <div className="text-center mb-12" style={{ animation: 'fadeUp 0.8s ease both' }}>

            {/* Book icon — minimal open book shape */}
            <div className="inline-flex items-center justify-center w-16 h-16 mb-8 rounded-2xl border"
              style={{
                borderColor: '#262626',
                background: 'linear-gradient(135deg, #141414 0%, #1a1a1a 100%)',
                boxShadow: '0 0 0 1px rgba(34,197,94,0.06), 0 8px 32px rgba(0,0,0,0.4)',
              }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 6C14 6 10.5 4 6 4C4.5 4 3.5 4.3 3 4.5V22.5C3.5 22.3 4.5 22 6 22C10.5 22 14 24 14 24" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
                <path d="M14 6C14 6 17.5 4 22 4C23.5 4 24.5 4.3 25 4.5V22.5C24.5 22.3 23.5 22 22 22C17.5 22 14 24 14 24" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                <path d="M14 6V24" stroke="#22c55e" strokeWidth="1" opacity="0.3"/>
              </svg>
            </div>

            <h1 className="text-4xl tracking-tight mb-3"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                color: '#ededed',
                letterSpacing: '-0.02em',
              }}>
              q2kindle
            </h1>

            <p className="text-base leading-relaxed"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: '#888888',
                fontWeight: 400,
              }}>
              Send articles to your Kindle, from anywhere
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border p-8"
            style={{
              borderColor: '#262626',
              background: '#141414',
              boxShadow: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 16px 64px rgba(0,0,0,0.5)',
              animation: 'fadeUp 0.8s ease 0.15s both',
            }}>

            {!sent ? (
              <form onSubmit={handleSubmit}>
                <label className="block text-xs uppercase tracking-widest mb-3"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: '#888888',
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                  }}>
                  Email address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full rounded-xl border px-4 py-3.5 text-base outline-none transition-all duration-200"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    background: '#0a0a0a',
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

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full mt-5 rounded-xl px-4 py-3.5 text-base font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    background: loading ? '#16a34a' : '#22c55e',
                    color: '#0a0a0a',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(34,197,94,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.background = '#16a34a';
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) e.currentTarget.style.background = '#22c55e';
                  }}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Sending link…
                    </span>
                  ) : (
                    "Send Magic Link"
                  )}
                </button>
              </form>
            ) : (
              /* Success state */
              <div className="text-center py-4" style={{ animation: 'fadeUp 0.5s ease both' }}>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                <h2 className="text-xl mb-2"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#ededed' }}>
                  Check your email
                </h2>
                <p className="text-sm leading-relaxed mb-5"
                  style={{ fontFamily: "'DM Sans', sans-serif", color: '#888888' }}>
                  We sent a magic link to<br/>
                  <span style={{ color: '#ededed' }}>{email}</span>
                </p>

                <button
                  onClick={() => { setSent(false); setEmail(""); }}
                  className="text-sm transition-colors duration-200 cursor-pointer"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: '#888888',
                    background: 'none',
                    border: 'none',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ededed'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#888888'}
                >
                  Use a different email →
                </button>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <p className="text-center mt-8 text-xs"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: '#555555',
              animation: 'fadeUp 0.8s ease 0.3s both',
            }}>
            No password needed — we&apos;ll email you a sign-in link
          </p>
        </div>
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
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
