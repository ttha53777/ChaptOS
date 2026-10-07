"use client";

/**
 * The live web-address check, shared by the name step's slugline and the
 * charter's Address field (which also gates Sign & build on it).
 *
 * Format rules are evaluated locally first — they're the same pure rules the
 * server applies (lib/slug-rules) — so an empty, reserved, over-long or
 * malformed slug gets an instant, offline-proof answer and never spends a
 * request. Only a format-passing slug asks the network the one thing it alone
 * knows: whether someone already took it.
 */

import { useEffect, useState } from "react";
import { validateSlugFormat, type SlugIssue } from "@/lib/slug-rules";

export type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  /** `label` is the badge inside the field; `message` the sentence under it. */
  | { kind: "bad"; label: string; message: string }
  | { kind: "taken"; suggestions: string[] };

const SLUG_ISSUE_LABEL: Record<SlugIssue, string> = {
  empty:        "Needed",
  "too-short":  "Too short",
  "too-long":   "Too long",
  "bad-format": "Not allowed",
  reserved:     "Reserved",
  profane:      "Not allowed",
};

/** A KNOWN-fatal answer — the org can't be created at this address. "checking"
    and "idle" (a network hiccup) are not: the POST re-checks, and blocking the
    button on a flaky probe would strand a founder with a perfectly good URL. */
export function slugBlocks(state: SlugState): boolean {
  return state.kind === "bad" || state.kind === "taken";
}

export function useSlugCheck(slug: string, enabled = true): SlugState {
  const [state, setState] = useState<SlugState>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) return;
    const local = validateSlugFormat(slug);
    if (!local.ok) {
      setState({
        kind: "bad",
        label: local.issue ? SLUG_ISSUE_LABEL[local.issue] : "Won’t work",
        // "empty" gets flow-specific copy: the founder was handed this address,
        // and if it came out empty their org name had nothing romanizable in it.
        message:
          local.issue === "empty"
            ? "We couldn’t build a web address out of your org’s name — type one here."
            : local.message ?? "That address won’t work.",
      });
      return;
    }
    setState({ kind: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/slug-check?slug=${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return setState({ kind: "idle" });
        const data = await res.json();
        if (data.ok) setState({ kind: "ok" });
        else if (data.reason === "taken") setState({ kind: "taken", suggestions: data.suggestions ?? [] });
        else setState({ kind: "bad", label: "Won’t work", message: data.message ?? "That address won’t work." });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "idle" });
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [slug, enabled]);

  return state;
}
