"use client";

import { useEffect } from "react";

// This boundary replaces the entire document, so it can't rely on app
// stylesheets or the dash-scoped tokens loading. The dusk palette is inlined
// here verbatim (--paper #0f0d0a / --card #161310 / --ink #ece7dd /
// --vio #a78bfa / --rose #d98ba3) with Georgia / ui-monospace fallbacks in
// case the next/font variables haven't been injected on <html>.
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

  const serif = "var(--font-fraunces), Georgia, serif";
  const mono = "var(--font-geist-mono), ui-monospace, Menlo, monospace";

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f0d0a",
            padding: "4rem 1.5rem",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "28rem",
              borderRadius: "1rem",
              border: "1px solid rgba(236,231,221,.09)",
              background: "#161310",
              padding: "2.25rem",
              textAlign: "center",
              boxShadow:
                "0 1px 0 rgba(0,0,0,.4), 0 16px 40px -24px rgba(0,0,0,.7)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: mono,
                fontSize: "10.5px",
                fontWeight: 500,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: "#d98ba3",
              }}
            >
              Unexpected error
            </p>
            <div
              style={{
                margin: "1.25rem auto 1.5rem",
                display: "flex",
                height: "3rem",
                width: "3rem",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "9999px",
                border: "1px solid rgba(217,139,163,.10)",
                background: "rgba(217,139,163,.10)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d98ba3"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: serif,
                fontSize: "22px",
                fontWeight: 400,
                letterSpacing: "-.01em",
                color: "#ece7dd",
                margin: 0,
              }}
            >
              Something went{" "}
              <em style={{ fontStyle: "italic", color: "#a78bfa" }}>sideways</em>
            </h1>
            <p
              style={{
                margin: "0.75rem auto 0",
                maxWidth: "19rem",
                fontSize: "13.5px",
                lineHeight: 1.6,
                color: "#c9c2b4",
              }}
            >
              The app hit an unexpected error and couldn&apos;t recover. Try
              reloading — if it keeps happening, reach out to an officer.
            </p>
            {error.digest && (
              <p
                style={{
                  marginTop: "1rem",
                  fontFamily: mono,
                  fontSize: "10px",
                  letterSpacing: ".08em",
                  color: "#6b6354",
                }}
              >
                REF · {error.digest}
              </p>
            )}
            <div
              style={{
                marginTop: "1.75rem",
                display: "flex",
                justifyContent: "center",
                gap: "0.625rem",
              }}
            >
              <button
                onClick={reset}
                style={{
                  borderRadius: "0.5rem",
                  background: "#7c3aed",
                  border: "none",
                  padding: "0.5rem 1rem",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(236,231,221,.09)",
                  background: "#1b1813",
                  padding: "0.5rem 1rem",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#c9c2b4",
                  cursor: "pointer",
                }}
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
