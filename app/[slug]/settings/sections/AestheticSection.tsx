"use client";

import { useAppAesthetic } from "../../../hooks/useAppAesthetic";
import type { AppAesthetic } from "@/lib/aesthetic";

// Settings → Aesthetic. A per-device switch between the current Ledger look and
// Paper (_design/Dashboard Paper Mock.html). Applies instantly and is saved in
// this browser, like Light / Dark in the profile menu — nothing to save, so no
// dirty guard. The choice only stamps <html data-aesthetic>; the paper styles
// that key off it are still to be built.

const OPTIONS: { id: AppAesthetic; label: string; description: string }[] = [
  { id: "ledger", label: "Ledger", description: "The current look: serif headings on dusk or ivory." },
  { id: "paper", label: "Paper", description: "Cream paper, brown ink, pastel accents and hand-drawn touches." },
];

export function AestheticSection({ onStatus }: { onStatus: (msg: string) => void; onError: (msg: string) => void }) {
  const { aesthetic, setAesthetic } = useAppAesthetic();

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede">
        Choose how the app looks on this device. Light and Dark still apply on
        top of whichever you pick.
      </p>
      <div className="sc-card" role="radiogroup" aria-label="Aesthetic" style={{ padding: "8px 8px" }}>
        {OPTIONS.map((o) => (
          <label key={o.id} className="sc-check">
            <input
              type="radio"
              name="app-aesthetic"
              checked={aesthetic === o.id}
              disabled={aesthetic === null}
              onChange={() => {
                setAesthetic(o.id);
                onStatus(`Aesthetic set to ${o.label}.`);
              }}
            />
            <span aria-hidden className="sc-box">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="sc-check-key">{o.label}</div>
              <div className="sc-check-sub">{o.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
