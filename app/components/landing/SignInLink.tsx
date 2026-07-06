"use client";

import { signInWithGoogle } from "@/lib/supabase/oauth";
import { useState, type ReactNode, type MouseEvent } from "react";

// "Sign in" on the landing page goes STRAIGHT to Google — no intermediate
// /login screen. We still render a real <a href="/login"> so the control
// degrades gracefully: no-JS visitors, middle-clicks, and cmd/ctrl-clicks all
// fall through to the full login page. Only a plain left-click is intercepted
// to kick off OAuth in place.
//
// The /login page stays the canonical fallback (and still serves the founder
// "create a chapter" flow), so we lose nothing by short-circuiting the common
// returning-member path.
export function SignInLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [signingIn, setSigningIn] = useState(false);

  async function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modified clicks (new tab/window) and non-primary
    // buttons — those should open /login normally.
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    if (signingIn) return;
    setSigningIn(true);
    const err = await signInWithGoogle({});
    // On success the browser is already navigating to Google; we only land here
    // if the kickoff failed, in which case fall back to the login page so the
    // user still has a way in (and sees the error surface there).
    if (err) {
      window.location.href = "/login?error=auth";
    }
  }

  return (
    <a
      href="/login"
      className={className}
      onClick={handleClick}
      aria-busy={signingIn || undefined}
    >
      {children}
    </a>
  );
}
