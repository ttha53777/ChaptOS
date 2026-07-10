"use client";

/**
 * Step 5 — SIGN IN + BUILD. Auth at the last responsible moment: the whole
 * interview ran signed-out; "Continue with Google" flushes the draft to
 * localStorage and OAuths with intent=create, the callback returns to
 * /create?resume=1, and this step auto-fires the real POST /api/orgs. An
 * already-signed-in visitor (founding an additional org) skips the OAuth and
 * builds directly.
 *
 * The checklist mirrors provisionOrg's transaction steps; the animation is
 * theater but the FINAL tick and the navigation gate on the real response.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { draftToCreateOrgInput } from "@/lib/onboarding/draft";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/supabase/oauth";
import { ORG_SLUG_HEADER } from "@/app/lib/api";
import { clearStoredDraft, DISPLAY_HOST, draftSlug } from "./flow-state";
import { OrgMark } from "./OrgMark";

const TICK_MS = 460;

type Phase =
  | { kind: "signin"; notice?: string }
  | { kind: "building" }
  | { kind: "error"; title: string; message: string; canRetry: boolean };

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function BuildStep({
  draft,
  autoBuild,
  onSlugTaken,
  onBackToBlueprint,
  onBackToName,
}: {
  draft: Draft;
  /** True when we just returned from OAuth (?resume=1) — fire immediately. */
  autoBuild: boolean;
  onSlugTaken: (message: string) => void;
  onBackToBlueprint: () => void;
  onBackToName: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "signin" });
  const [signedInUser, setSignedInUser] = useState<{ name: string | null } | null>(null);
  const [lines, setLines] = useState<{ text: string; show: boolean; done: boolean }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);
  const name = draft.name.trim();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Detect an existing session (the OrgSwitcher "found another org" path, or
  // the post-OAuth resume): those visitors build directly, no Google button.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return;
        const meta = (data.user.user_metadata ?? {}) as { full_name?: string };
        const fallback = meta.full_name || data.user.email?.split("@")[0] || null;
        setSignedInUser({ name: fallback });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const build = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase({ kind: "building" });

    // The session's name is the founderName fallback when the interview's
    // "what should everyone call you?" was skipped.
    let fallbackName: string | undefined;
    try {
      const { data } = await createClient().auth.getUser();
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
      fallbackName = meta.full_name || data.user?.email?.split("@")[0] || undefined;
    } catch {
      // fall through — the mapper has a final fallback
    }

    const input = draftToCreateOrgInput(draft, fallbackName);
    const seatLine = draft.seats
      .map((s, i) => `${s.title}${i === 0 ? " (you)" : ""}`)
      .join(", ");
    const allLines = [
      `reserving ${DISPLAY_HOST}/${input.slug}`,
      "creating your workspace + config",
      `seeding roles — ${seatLine}`,
      "linking you as founder — full authority",
      "opening your workspace",
    ];
    setLines(allLines.map(text => ({ text, show: false, done: false })));

    // Animate the first four lines on a timer; the last tick is the real one.
    allLines.slice(0, -1).forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setLines(ls => ls.map((l, j) => (j === i ? { ...l, show: true } : l))), 300 + i * TICK_MS),
      );
      timers.current.push(
        setTimeout(() => setLines(ls => ls.map((l, j) => (j === i ? { ...l, done: true } : l))), 620 + i * TICK_MS),
      );
    });
    const minTheater = new Promise(resolve => timers.current.push(setTimeout(resolve, 300 + (allLines.length - 1) * TICK_MS)));

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      await minTheater;

      if (res.status === 201 || (res.status === 200 && data?.ok)) {
        const slug = typeof data?.slug === "string" && data.slug ? data.slug : null;
        const isRecovery = res.status === 200;

        // Logo AFTER the org exists; soft-fail (Settings can set it later).
        // Skipped on recovery — that org was set up on a prior attempt.
        if (slug && draft.logoDataUrl && !isRecovery) {
          try {
            const blob = await (await fetch(draft.logoDataUrl)).blob();
            const fd = new FormData();
            fd.append("file", new File([blob], "logo", { type: blob.type }));
            await fetch("/api/orgs/logo", { method: "POST", headers: { [ORG_SLUG_HEADER]: slug }, body: fd });
          } catch {
            // org exists; logo is a Settings concern now
          }
        }

        setLines(ls => ls.map((l, j) => (j === ls.length - 1 ? { ...l, show: true, done: true } : { ...l, show: true, done: true })));
        clearStoredDraft();
        timers.current.push(
          setTimeout(() => {
            window.location.assign(slug ? `/${slug}?toast=welcome` : "/");
          }, 700),
        );
        return;
      }

      started.current = false;
      if (res.status === 409) {
        onSlugTaken(`${DISPLAY_HOST}/${input.slug} was claimed while you were signing in — pick another.`);
        return;
      }
      if (res.status === 401) {
        setPhase({ kind: "signin", notice: "Your sign-in didn't stick — try again." });
        return;
      }
      if (res.status === 429) {
        setPhase({
          kind: "error",
          title: "That's the daily limit",
          message: "You've hit the limit of new organizations for today. Your blueprint is saved — come back tomorrow and it'll build in one tap.",
          canRetry: false,
        });
        return;
      }
      setPhase({
        kind: "error",
        title: "Couldn't create it",
        message: typeof data?.error === "string" ? data.error : "Something went wrong on our side. Your blueprint is saved — try again.",
        canRetry: true,
      });
    } catch {
      started.current = false;
      await minTheater;
      setPhase({
        kind: "error",
        title: "Couldn't reach the server",
        message: "Check your connection and try again — your blueprint is saved.",
        canRetry: true,
      });
    }
  }, [draft, onSlugTaken]);

  // Post-OAuth resume: the callback landed us here with a restored draft.
  useEffect(() => {
    if (autoBuild && name) void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild]);

  async function startGoogle() {
    // The write-through persistence has already saved the draft; OAuth
    // navigates away and /create?resume=1 restores it.
    const err = await signInWithGoogle({ intent: "create" });
    if (err) setPhase({ kind: "signin", notice: err });
  }

  if (!name) {
    return (
      <div className="bld">
        <div className="signin">
          <OrgMark name="" logoUrl={draft.logoDataUrl} />
          <h2>First, what&rsquo;s it called?</h2>
          <p>Give your organization a name and a quick interview, and the blueprint builds itself.</p>
          <button className="cta" style={{ marginTop: 0 }} onClick={onBackToName}>
            Start with the name<span>→</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bld">
      {phase.kind === "signin" && (
        <div className="signin">
          <OrgMark name={draft.name} logoUrl={draft.logoDataUrl} />
          <h2>
            {signedInUser ? (
              <>Ready to create {name}</>
            ) : (
              <>Sign in to create {name}</>
            )}
          </h2>
          <p>Your blueprint is saved — this just makes it yours.</p>
          {signedInUser ? (
            <button className="cta" style={{ marginTop: 0, width: "100%", justifyContent: "center" }} onClick={() => void build()}>
              Build {name}<span>→</span>
            </button>
          ) : (
            <button className="gbtn" onClick={() => void startGoogle()}>
              <GoogleIcon />
              Continue with Google
            </button>
          )}
          {phase.notice && <p className="fine" style={{ color: "var(--rose)" }}>{phase.notice}</p>}
          <p className="fine">One account · one chapter to start · switch orgs anytime</p>
          <button className="back-link" onClick={onBackToBlueprint}>
            ← Back to the blueprint
          </button>
        </div>
      )}

      {phase.kind === "building" && (
        <div className="building">
          <OrgMark name={draft.name} logoUrl={draft.logoDataUrl} className="bld-glyph" />
          <div className="bld-lines">
            {lines.map((l, i) => (
              <div key={i} className={`bld-line${l.show ? " show" : ""}${l.done ? " done" : ""}`}>
                <span className="tick">✓</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="building" style={{ display: "block" }}>
          <div className="bld-err">
            <b>{phase.title}</b>
            {phase.message}
            <div>
              {phase.canRetry && (
                <button className="cta" onClick={() => void build()}>
                  Try again<span>→</span>
                </button>
              )}
              <button className="cta" style={{ background: "transparent", color: "var(--ink-72)", border: "1px solid var(--line)" }} onClick={onBackToBlueprint}>
                Back to the blueprint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
