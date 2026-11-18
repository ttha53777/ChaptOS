"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useChapter } from "../../context/ChapterContext";
import { FLS_BOOT } from "@/lib/first-load-splash";
import { SplashRun } from "./choreography";

/*
 * Whether the splash is up = whether html[data-fls] is set. The boot script sets
 * it during HTML parse; SplashRun clears it when the paper has lifted.
 *
 * getServerSnapshot is true so hydration keeps the server's markup. After
 * hydration React re-reads the real attribute: on a skipped hard load (org
 * switch) it's absent and the markup unmounts. On a client navigation there's no
 * hydration, the attribute is absent, and the markup never mounts at all.
 */
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getSnapshot = () => document.documentElement.hasAttribute("data-fls");
const getServerSnapshot = () => true;

/** One run per document. Module scope, so StrictMode's double effects and the
 *  layout re-rendering can't start a second one. */
let run: SplashRun | null = null;

/**
 * Emits the hard-load boot script, then drives beats 2 and 3 from
 * ChapterContext. It reads context; it never gates it.
 */
export function FirstLoadSplashDriver({ children }: { children: React.ReactNode }) {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { currentUser, hasLoaded, isLoading, loadError } = useChapter();
  const orgName = currentUser?.org?.name ?? null;
  const logoUrl = currentUser?.org?.logoUrl ?? null;

  // Start: the first effect after hydration. If /me is somehow already in, it
  // counts as cached (the draw is skipped and the tile turns at once).
  useEffect(() => {
    // The real attribute, not `show`: hydration's effects still see the server
    // snapshot (true) on a skipped load, before React re-renders without it.
    if (run || !getSnapshot()) return;
    const root = document.getElementById("fls");
    if (!root) return;
    run = new SplashRun(root, () => { run = null; listeners.forEach(fn => fn()); });
    if (orgName) run.session({ name: orgName, logoUrl }, true);
    // Mount-only: later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Beat 2: /api/auth/me resolved, so we know whose chapter this is.
  useEffect(() => {
    if (run && orgName) run.session({ name: orgName, logoUrl }, false);
  }, [orgName, logoUrl]);

  // Beat 3: the page's data is in (SplashRun also waits for beat 2 to finish).
  useEffect(() => {
    if (run && hasLoaded && orgName) run.loaded();
  }, [hasLoaded, orgName]);

  // Nobody to open: no session (isLoading drops without a user) or /me failed.
  useEffect(() => {
    if (run && !currentUser && (loadError || !isLoading)) run.fail();
  }, [currentUser, loadError, isLoading]);

  return (
    <>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: FLS_BOOT }}
      />
      {show ? children : null}
    </>
  );
}
