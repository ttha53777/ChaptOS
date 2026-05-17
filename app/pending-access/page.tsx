"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PendingAccessPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong. Try again.");
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Network failure — still redirect
    }
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm px-8 py-10 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold text-white">Link your account</span>
          <span className="text-sm text-zinc-400">
            Enter your full name exactly as it appears in the chapter roster.
          </span>
        </div>

        <form onSubmit={handleClaim} className="flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            required
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {loading ? "Linking…" : "Link account"}
          </button>
        </form>

        <p className="text-xs text-zinc-500">
          If your name doesn't match or you share a name with another member, contact an officer to be linked manually.
        </p>

        <button
          onClick={handleSignOut}
          className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
