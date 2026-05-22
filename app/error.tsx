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
    <div className="flex min-h-full flex-1 items-center justify-center bg-[#07090f] px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.07] bg-[#10121a] p-8 text-center shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10">
          <svg className="h-6 w-6 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-[16px] font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          This page hit an unexpected error. Your data is safe — try again, and if it keeps happening, contact an officer.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-slate-600">Ref: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-2.5">
          <button
            onClick={reset}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:border-white/[0.16] hover:text-white"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
