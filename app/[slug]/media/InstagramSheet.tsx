"use client";
import { useEffect, useRef } from "react";
import { PaperIcon, type PaperIconName } from "../../components/paper/PaperIcon";

/** The mock's composer sheet (.cm): tilted icon tile, "Instagram" kicker, title,
 *  then whatever body + footer the caller renders. A modal <dialog>, so focus,
 *  Escape and the backdrop come from the platform. */
export function InstagramSheet({ title, icon, dismissable = true, closeButton = true, onClose, children }: {
  title: string; icon: PaperIconName; dismissable?: boolean; closeButton?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    // showModal() focuses the first focusable (the close button); the mock focuses its [autofocus].
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="igp-scope igp-sheet" aria-labelledby="igp-sheet-title"
    onCancel={e => { e.preventDefault(); if (dismissable) onClose(); }}
    onClick={e => {
      if (e.target !== e.currentTarget || !dismissable) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }}>
    <div className="igp-sheet-h">
      <span className="tile"><PaperIcon name={icon} /></span>
      <div><p>Instagram</p><h3 id="igp-sheet-title">{title}</h3></div>
      {closeButton && <button type="button" className="igp-iconbtn" aria-label="Close" disabled={!dismissable} onClick={onClose}><PaperIcon name="plus" className="pp-ic igp-close" /></button>}
    </div>
    {children}
  </dialog>;
}
