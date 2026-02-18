"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Queue", icon: "queue" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? "#22c55e" : "#888888";
  const weight = active ? "2" : "1.5";

  switch (icon) {
    case "queue":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke={color} strokeWidth={weight} strokeLinecap="round"/>
          <rect x="9" y="3" width="6" height="4" rx="1" stroke={color} strokeWidth={weight}/>
          <path d="M9 12h6M9 16h4" stroke={color} strokeWidth={weight} strokeLinecap="round"/>
        </svg>
      );
    case "history":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={weight}/>
          <path d="M12 7v5l3 3" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "settings":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke={color} strokeWidth={weight}/>
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke={color} strokeWidth={weight} strokeLinecap="round"/>
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&display=swap');
      `}</style>

      <div className="min-h-screen" style={{ background: '#0a0a0a' }}>

        {/* Top navigation bar */}
        <header className="border-b" style={{ borderColor: '#1a1a1a', background: '#0a0a0a' }}>
          <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">

            {/* Left: logo + nav */}
            <div className="flex items-center gap-8">
              <span
                className="text-lg cursor-pointer"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#ededed', letterSpacing: '-0.01em' }}
                onClick={() => router.push("/dashboard")}
              >
                q2kindle
              </span>

              <nav className="flex items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const active = item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                  return (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 500,
                        color: active ? '#ededed' : '#888888',
                        background: active ? '#1a1a1a' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.color = '#ededed';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.color = '#888888';
                      }}
                    >
                      <NavIcon icon={item.icon} active={active} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: user + sign out */}
            <div className="flex items-center gap-4">
              {userEmail && (
                <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: '#555555' }}>
                  {userEmail}
                </span>
              )}
              <button
                onClick={handleSignOut}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors duration-150 cursor-pointer"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: '#888888',
                  borderColor: '#262626',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ededed';
                  e.currentTarget.style.borderColor = '#404040';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888888';
                  e.currentTarget.style.borderColor = '#262626';
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className={`${pathname.startsWith('/article/') ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-6 py-10`}>
          {children}
        </main>
      </div>
    </>
  );
}
