"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error boundary caught:", error);
  }, [error]);

  return (
    <div
      className="flex min-h-full flex-1 items-center justify-center px-6 py-16"
      style={{
        background: "#0f0d0a",
        fontFamily:
          "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-9 text-center"
        style={{
          background: "#161310",
          border: "1px solid rgba(236,231,221,.09)",
          boxShadow:
            "0 1px 0 rgba(0,0,0,.4), 0 16px 40px -24px rgba(0,0,0,.7)",
        }}
      >
        <p
          className="text-[10.5px] font-medium uppercase"
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
            letterSpacing: ".18em",
            color: "#d98ba3",
          }}
        >
          Unexpected error
        </p>
        <div
          className="mx-auto mb-6 mt-5 flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            border: "1px solid rgba(217,139,163,.10)",
            background: "rgba(217,139,163,.10)",
          }}
        >
          <svg
            className="h-[22px] w-[22px]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
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
          className="text-[22px]"
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontWeight: 400,
            letterSpacing: "-.01em",
            color: "#ece7dd",
          }}
        >
          Something went{" "}
          <em style={{ fontStyle: "italic", color: "#a78bfa" }}>sideways</em>
        </h1>
        <p
          className="mx-auto mt-3 max-w-[19rem] text-[13.5px] leading-relaxed"
          style={{ color: "#c9c2b4" }}
        >
          This page hit an unexpected error. Your data is safe — try again, and
          if it keeps happening, reach out to an officer.
        </p>
        {error.digest && (
          <p
            className="mt-4 text-[10px]"
            style={{
              fontFamily:
                "var(--font-geist-mono), ui-monospace, Menlo, monospace",
              letterSpacing: ".08em",
              color: "#6b6354",
            }}
          >
            REF · {error.digest}
          </p>
        )}
        <div className="mt-7 flex justify-center gap-2.5">
          <button
            onClick={reset}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
            style={{ background: "#7c3aed", color: "#fff" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#a78bfa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#7c3aed";
            }}
          >
            Try again
          </button>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
            style={{
              border: "1px solid rgba(236,231,221,.09)",
              background: "#1b1813",
              color: "#c9c2b4",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#a78bfa";
              e.currentTarget.style.color = "#ece7dd";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(236,231,221,.09)";
              e.currentTarget.style.color = "#c9c2b4";
            }}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
