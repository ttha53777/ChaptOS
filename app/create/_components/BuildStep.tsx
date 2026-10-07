"use client";

/**
 * Step 6 — SIGN IN + BUILD. Auth at the last responsible moment: the whole
 * interview ran signed-out. The ticket's "Continue with Google" leaves the draft
 * in localStorage and OAuths with intent=create; the callback returns to
 * /create?resume=1 and this step fires the real POST /api/orgs on its own. An
 * already-signed-in founder (a second org) gets a Build button instead.
 *
 * The checklist mirrors provisionOrg's transaction; its ticking is theater, but
 * the final line, the "Chartered" stamp and the navigation all wait on the real
 * response. The founder then lands on /<slug>/onboarding — the day-one welcome.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { draftToCreateOrgInput } from "@/lib/onboarding/draft";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/supabase/oauth";
import { BILLING_BANDS, formatPrice } from "@/lib/billing/tiers";
import { APP_AESTHETIC_STORAGE_KEY } from "@/lib/aesthetic";
import { ORG_SLUG_HEADER } from "@/app/lib/api";
import { validateSlugFormat } from "@/lib/slug-rules";
import { Charter } from "./Charter";
import { DISPLAY_HOST, clearStoredDraft } from "./flow-state";
import { Mark } from "./Mark";
import { Ic, initials, orgName } from "./paper";
import type { CreateSession } from "./useSession";

const FREE_BAND = BILLING_BANDS[0]!;
const FIRST_PAID = BILLING_BANDS.find(b => (b.priceCents ?? 0) > 0) ?? BILLING_BANDS[1]!;

const TICK_MS = 520;
const STAMP_HOLD_MS = 1500;

const KIND_NOUN: Record<string, string> = {
  fraternity: "chapter", sorority: "chapter", club: "club", team: "team",
  service: "org", honor: "society", arts: "company", other: "org",
};

type Phase =
  | { kind: "signin"; notice?: string }
  | { kind: "building" }
  | { kind: "error"; title: string; message: string; canRetry: boolean };

type Line = { text: string; show: boolean; done: boolean; fail?: boolean };

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export function BuildStep({
  draft,
  session,
  autoBuild,
  onSignOut,
  onSlugRejected,
  onBackToCharter,
}: {
  draft: Draft;
  session: CreateSession | null;
  /** True when we just returned from OAuth (?resume=1) — fire immediately. */
  autoBuild: boolean;
  onSignOut: () => void;
  /** Back to the charter's Address field, with the reason. Covers every way the
      slug can be unusable — taken during sign-in, malformed, reserved, empty. */
  onSlugRejected: (message: string) => void;
  onBackToCharter: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "signin" });
  const [lines, setLines] = useState<Line[]>([]);
  const [stamp, setStamp] = useState(false);
  const [googling, setGoogling] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);
  const name = orgName(draft);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const build = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];

    // The Google name stands in when "who am I talking to?" was answered with
    // "use my Google name". Read it here rather than from `session`: the
    // ?resume=1 leg fires before that hook has resolved.
    let fallbackName = session?.name;
    if (!fallbackName) {
      try {
        const { data } = await createClient().auth.getUser();
        const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
        fallbackName = meta.full_name || data.user?.email?.split("@")[0] || undefined;
      } catch {
        // the mapper has a final fallback
      }
    }
    const input = draftToCreateOrgInput(draft, fallbackName);

    // Last line of defence, and the only one the ?resume=1 leg ever meets: that
    // leg fires from here without rendering the charter, so its disabled button
    // never had a chance to stop an unusable address. Same pure rules the server
    // uses, so this fails here, where the founder can fix it.
    const slugCheck = validateSlugFormat(input.slug);
    if (!slugCheck.ok) {
      started.current = false;
      onSlugRejected(
        slugCheck.issue === "empty" || slugCheck.issue === "too-short"
          ? "Your org needs a web address before it can be built — type one here."
          : slugCheck.message ?? "That web address won’t work — pick another.",
      );
      return;
    }

    setPhase({ kind: "building" });
    setStamp(false);
    const seatLine = draft.seats.map((s, i) => `${s.title}${i === 0 ? " (you)" : ""}`).join(", ");
    const all = [
      `reserving ${DISPLAY_HOST}/${input.slug}`,
      "creating your workspace + config",
      `starting ${draft.term?.label ?? "your first term"} — active`,
      `seeding roles — ${seatLine}`,
      "linking you as founder — full authority",
      "opening your workspace",
    ];
    setLines(all.map(text => ({ text, show: false, done: false })));
    const mark = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    all.slice(0, -1).forEach((_, i) => {
      timers.current.push(setTimeout(() => mark(i, { show: true }), 250 + i * TICK_MS));
      timers.current.push(setTimeout(() => mark(i, { done: true }), 560 + i * TICK_MS));
    });
    timers.current.push(setTimeout(() => mark(all.length - 1, { show: true }), 250 + (all.length - 1) * TICK_MS));
    const theater = new Promise(resolve => timers.current.push(setTimeout(resolve, 560 + (all.length - 1) * TICK_MS)));

    const fail = (at: number) => setLines(ls => ls.map((l, j) => (j === at ? { ...l, show: true, done: false, fail: true } : j > at ? { ...l, show: false } : l)));

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      await theater;

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
            // the org exists; the logo is a Settings concern now
          }
        }

        setLines(ls => ls.map(l => ({ ...l, show: true, done: true })));
        setStamp(true);
        clearStoredDraft();
        // They chartered it on paper, so the workspace opens on paper — unless
        // this device already chose a look (Settings → Aesthetic).
        try {
          if (!window.localStorage.getItem(APP_AESTHETIC_STORAGE_KEY)) {
            window.localStorage.setItem(APP_AESTHETIC_STORAGE_KEY, "paper");
          }
        } catch {
          // storage unavailable — the app falls back to its default look
        }
        timers.current.push(
          setTimeout(() => window.location.assign(slug ? `/${slug}/onboarding` : "/"), STAMP_HOLD_MS),
        );
        return;
      }

      started.current = false;
      if (res.status === 409) {
        fail(0);
        timers.current.push(
          setTimeout(() => onSlugRejected(`${DISPLAY_HOST}/${input.slug} was claimed while you were signing in — pick another and we’ll pick up right where you were.`), 900),
        );
        return;
      }
      // A 400 is the payload failing the API's schema; retrying never changes
      // that, so go back to the sheet that can be edited, naming the field when
      // the schema says which.
      if (res.status === 400) {
        const issues = Array.isArray(data?.details) ? (data.details as { path?: unknown[] }[]) : [];
        const onSlug = issues.some(i => Array.isArray(i.path) && i.path[0] === "slug");
        onSlugRejected(
          onSlug
            ? `${DISPLAY_HOST}/${input.slug} isn’t a usable web address — pick another.`
            : "Something on the charter didn’t pass our checks — have a look and try again.",
        );
        return;
      }
      if (res.status === 401) {
        setPhase({ kind: "signin", notice: "Your sign-in didn’t stick — try again." });
        return;
      }
      fail(3);
      if (res.status === 429) {
        setPhase({
          kind: "error",
          title: "That’s the daily limit",
          message: "You’ve hit the limit of new organizations for today. Your charter is saved — come back tomorrow and it builds in one tap.",
          canRetry: false,
        });
        return;
      }
      setPhase({
        kind: "error",
        title: "Couldn’t open the doors",
        message:
          typeof data?.error === "string"
            ? `${data.error} Your charter is saved — nothing was half-built.`
            : "Something went wrong on our side. Your charter is saved — nothing was half-built.",
        canRetry: true,
      });
    } catch {
      started.current = false;
      await theater;
      fail(0);
      setPhase({
        kind: "error",
        title: "Couldn’t reach the server",
        message: "Check your connection and try again — your charter is saved.",
        canRetry: true,
      });
    }
  }, [draft, session?.name, onSlugRejected]);

  // Post-OAuth resume: the callback landed us here with a restored draft.
  useEffect(() => {
    if (autoBuild && draft.name.trim()) void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild]);

  async function startGoogle() {
    // Write-through persistence already saved the draft; OAuth navigates away
    // and /create?resume=1 restores it.
    setGoogling(true);
    const err = await signInWithGoogle({ intent: "create" });
    if (err) {
      setGoogling(false);
      setPhase({ kind: "signin", notice: err });
    }
  }

  if (phase.kind === "signin") {
    const signed = !!session;
    return (
      <div className="signwrap">
        <div className="ticket">
          <div className="tk-top">
            <Mark name={draft.name} logoUrl={draft.logoDataUrl} />
            <p className="ch-k">Charter · ready to file</p>
            <h2>{signed ? `Ready to build ${name}` : `Sign in to create ${name}`}</h2>
            <p>{signed ? "Everything on the charter becomes real in a few seconds." : "Your charter is saved — this just makes it yours."}</p>
          </div>
          <div className="perf" />
          <div className="tk-b">
            {signed ? (
              <>
                <div className="who">
                  <span className="avatar" style={{ ["--av" as string]: "var(--peach)" }}>
                    {initials(session.name)}
                  </span>
                  <span>
                    <b>{session.name}</b>
                    {session.email && <small>{session.email}</small>}
                  </span>
                  <button type="button" className="sw3" onClick={onSignOut}>
                    Not you?
                  </button>
                </div>
                <button type="button" className="btn btn--lg wide" onClick={() => void build()}>
                  Build {name}
                  <Ic name="arrow-r" />
                </button>
              </>
            ) : (
              <button type="button" className="gbtn" disabled={googling} onClick={() => void startGoogle()}>
                {googling ? <span className="spin" aria-hidden="true" /> : <GoogleLogo />}
                {googling ? "Opening Google…" : "Continue with Google"}
              </button>
            )}
            {phase.notice && <p className="fine err">{phase.notice}</p>}
            <p className="fine">
              One account · one {KIND_NOUN[draft.kind ?? "other"]} to start · switch orgs any time
            </p>
            {/* Money, said once, before they commit — not a paywall. A new org is
                one person, so it's free at this moment; the point is that nobody
                meets the price for the first time at the seat wall. */}
            <div className="price">
              <div>
                <b>Free</b>while there are {FREE_BAND.upTo} or fewer of you
              </div>
              <div>
                <b>{formatPrice(FIRST_PAID.priceCents)}/mo</b>from {FIRST_PAID.from} to {FIRST_PAID.upTo} · no card today ·{" "}
                <a href="/pricing" target="_blank" rel="noreferrer">
                  pricing
                </a>
              </div>
            </div>
            <button type="button" className="tk-back" onClick={onBackToCharter}>
              <Ic name="chev-l" />
              Back to the charter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bld">
      <div className="ask">
        <p className="kick">Filing the charter</p>
        <h1 className="q">
          Building <span className="hi">{name}</span>…
        </h1>
        <div className="lines" aria-live="polite">
          {lines.map((l, i) => (
            <div key={i} className={`ln2${l.show ? " show" : ""}${l.done ? " done" : ""}${l.fail ? " fail" : ""}`}>
              <span className="tk">
                <Ic name={l.fail ? "x" : "check"} />
              </span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        {phase.kind === "error" && (
          <div className="oops" role="alert">
            <b>{phase.title}</b>
            <p>{phase.message}</p>
            <div className="row2">
              {phase.canRetry && (
                <button type="button" className="btn" onClick={() => void build()}>
                  Try again
                  <Ic name="refresh" />
                </button>
              )}
              <button type="button" className="btn btn--soft" onClick={onBackToCharter}>
                Back to the charter
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="slot">
        <Charter draft={draft} showTypes filed={stamp} stamp={stamp ? "slam" : null} founderFallback={session?.name} />
      </div>
    </div>
  );
}
