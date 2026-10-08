"use client";

import { useEffect } from "react";
import "./error.css";

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
    <div className="app-err flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="app-err-card w-full max-w-md rounded-2xl p-9 text-center">
        <p className="app-err-kicker text-[10.5px] font-medium uppercase">
          Unexpected error
        </p>
        <div className="app-err-seal mx-auto mb-6 mt-5 flex h-12 w-12 items-center justify-center rounded-full">
          <svg
            className="h-[22px] w-[22px]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.6}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="app-err-title text-[22px]">
          Something went <em>sideways</em>
        </h1>
        <p className="app-err-lede mx-auto mt-3 max-w-[19rem] text-[13.5px] leading-relaxed">
          This page hit an unexpected error. Your data is safe — try again, and
          if it keeps happening, reach out to an officer.
        </p>
        {error.digest && (
          <p className="app-err-ref mt-4 text-[10px]">REF · {error.digest}</p>
        )}
        <div className="mt-7 flex justify-center gap-2.5">
          <button
            onClick={reset}
            className="app-err-retry rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="app-err-home rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
