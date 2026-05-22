"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#07090f", padding: "4rem 1.5rem" }}>
          <div style={{ width: "100%", maxWidth: "28rem", borderRadius: "1rem", border: "1px solid rgba(255,255,255,0.07)", background: "#10121a", padding: "2rem", textAlign: "center", boxShadow: "0 8px 30px -12px rgba(0,0,0,0.8)" }}>
            <div style={{ margin: "0 auto 1.25rem", display: "flex", height: "3rem", width: "3rem", alignItems: "center", justifyContent: "center", borderRadius: "9999px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.1)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>Something went wrong</h1>
            <p style={{ marginTop: "0.5rem", fontSize: "13px", lineHeight: 1.6, color: "#94a3b8" }}>
              The app hit an unexpected error and couldn&apos;t recover. Try reloading — if it keeps happening, contact an officer.
            </p>
            {error.digest && (
              <p style={{ marginTop: "0.75rem", fontFamily: "monospace", fontSize: "10px", color: "#475569" }}>Ref: {error.digest}</p>
            )}
            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center", gap: "0.625rem" }}>
              <button
                onClick={reset}
                style={{ borderRadius: "0.5rem", background: "#4f46e5", border: "none", padding: "0.5rem 1rem", fontSize: "13px", fontWeight: 600, color: "#fff", cursor: "pointer" }}
              >
                Try again
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                style={{ borderRadius: "0.5rem", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", padding: "0.5rem 1rem", fontSize: "13px", fontWeight: 500, color: "#cbd5e1", cursor: "pointer" }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
