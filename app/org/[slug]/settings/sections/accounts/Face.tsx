import React from "react";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";

const TINTS = ["var(--pp-peach)", "var(--pp-sky)", "var(--pp-mint)", "var(--pp-butter)", "var(--pp-lilac)", "var(--pp-rose)"];
const tintFor = (name: string) => TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

/** A member's photo or pastel initials, with a key badge for admins. */
export function Face({ name, src, admin, size = 40 }: { name: string; src: string | null; admin?: boolean; size?: number }) {
  return (
    <span className="ac-av" style={{ "--a": tintFor(name), "--sz": `${size}px` } as React.CSSProperties} aria-hidden="true">
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" referrerPolicy="no-referrer" />
        : initials(name)}
      {admin && <span className="ac-key"><PaperIcon name="key" className="ac-ic" /></span>}
    </span>
  );
}
