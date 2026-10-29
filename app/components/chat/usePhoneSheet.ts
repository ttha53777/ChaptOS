"use client";

// Ask Chapt on a phone. The spotlight's centered card (capped at 92vh) is fine
// with a pointer, but on a phone the keyboard covers the bottom of the layout
// viewport without shrinking it: the composer sat under the keyboard and Safari
// scrolled the whole page to reach it. On a phone the spotlight is instead a
// full-bleed sheet sized to the VISUAL viewport (what the keyboard leaves
// visible), so the composer always rides on top of the keyboard.
//
// Layout lives in chat-phone.css under the same breakpoint; this hook supplies
// the two things CSS can't know: the visual viewport's box, and whether a text
// field in the sheet is focused (the keyboard is up). Focus is the signal rather
// than a height delta because the root viewport sets
// interactive-widget=resizes-content, so on Android the layout viewport shrinks
// with the keyboard and there is no delta to measure.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** Same breakpoint as the mobile tab bar (mobile-shell.css). */
export const PHONE_QUERY = "(max-width: 767px)";

export function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(PHONE_QUERY).matches;
}

/** True for a field that raises the on-screen keyboard (a date input opens a picker instead). */
function raisesKeyboard(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !["date", "time", "checkbox", "radio", "button", "submit"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

export function usePhoneSheet(open: boolean, overlayRef: RefObject<HTMLDivElement | null>) {
  const [phone, setPhone] = useState(isPhoneViewport);
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const sync = () => setPhone(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!open || !phone || !el) return;

    // Size the sheet to the visual viewport. iOS also pans the layout viewport
    // when a fixed element's field is focused, so the top follows offsetTop.
    const vv = window.visualViewport;
    const syncBox = () => {
      if (!vv) return;
      el.style.setProperty("--cs-vvh", `${vv.height}px`);
      el.style.setProperty("--cs-vvt", `${vv.offsetTop}px`);
    };
    syncBox();
    vv?.addEventListener("resize", syncBox);
    vv?.addEventListener("scroll", syncBox);

    const syncKeyboard = () => setKeyboard(raisesKeyboard(document.activeElement) && el.contains(document.activeElement));
    // focusout fires before focus lands on the next field — read it a tick later
    // so moving between fields doesn't drop and raise the layout.
    const onFocusOut = () => setTimeout(syncKeyboard, 0);
    el.addEventListener("focusin", syncKeyboard);
    el.addEventListener("focusout", onFocusOut);
    syncKeyboard();

    // The page behind stays put: no rubber-banding the dashboard through the
    // scrim, and nothing for iOS to scroll when a field is focused.
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    document.documentElement.dataset.chatSheet = "";

    return () => {
      vv?.removeEventListener("resize", syncBox);
      vv?.removeEventListener("scroll", syncBox);
      el.removeEventListener("focusin", syncKeyboard);
      el.removeEventListener("focusout", onFocusOut);
      body.style.overflow = prevOverflow;
      delete document.documentElement.dataset.chatSheet;
      setKeyboard(false);
    };
  }, [open, phone, overlayRef]);

  return { phone, keyboard };
}

/**
 * Pull the sheet's header down to dismiss it. Moves the sheet with the finger
 * and closes past a threshold; anything less springs back. Buttons in the
 * header keep their taps.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLDivElement | null>, onClose: () => void, enabled: boolean) {
  const start = useRef<number | null>(null);
  const delta = useRef(0);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || (e.target as Element).closest("button")) return;
    start.current = e.clientY;
    delta.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetRef.current?.classList.add("dragging");
  }, [enabled, sheetRef]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current === null || !sheetRef.current) return;
    delta.current = Math.max(0, e.clientY - start.current);
    sheetRef.current.style.transform = `translateY(${delta.current}px)`;
  }, [sheetRef]);

  const onPointerEnd = useCallback(() => {
    if (start.current === null) return;
    start.current = null;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
    }
    if (delta.current > 110) onClose();
  }, [sheetRef, onClose]);

  return enabled
    ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd }
    : {};
}
