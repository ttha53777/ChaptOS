"use client";

/**
 * Step 1 — NAME. The serif name input with the live slugline, the mark
 * (gradient monogram or uploaded crest), and Continue. Copy is v3's.
 */

import { useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { DISPLAY_HOST, draftSlug } from "./flow-state";
import { OrgMark } from "./OrgMark";
import type { FlowAction } from "./flow-state";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function NameStep({
  draft,
  dispatch,
  onContinue,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  onContinue: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const named = !!draft.name.trim();

  function pickLogo(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image (PNG, JPG, SVG, WEBP, GIF).");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Image must be under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError(null);
      dispatch({ type: "setLogo", dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="ask">
      <p className="kicker">Create your organization · no account needed yet</p>
      <h1 className="q-serif">
        {/* {" "} guards: the vendored Next compiler drops bare spaces after JSX expressions */}
        Let&rsquo;s set up your <em>chapter</em>{" "}— what&rsquo;s it called?
      </h1>
      <input
        className="name-input"
        placeholder="Kappa Sigma"
        autoComplete="off"
        spellCheck={false}
        value={draft.name}
        onChange={e => dispatch({ type: "setName", name: e.target.value })}
        onKeyDown={e => {
          if (e.key === "Enter" && named) onContinue();
        }}
        aria-label="Organization name"
        autoFocus
      />
      <div className="slugline" style={{ opacity: named ? 1 : 0 }}>
        {DISPLAY_HOST}/<b>{draftSlug(draft) || " "}</b> — reserved while you set up
      </div>
      <div className="idrow">
        <button
          type="button"
          className="mark-btn"
          title="Upload an icon"
          onClick={() => fileRef.current?.click()}
        >
          <OrgMark name={draft.name} logoUrl={draft.logoDataUrl} />
          <span className="mark-edit">{draft.logoDataUrl ? "change" : "upload"}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            pickLogo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="idnote">
          {logoError ? (
            <span className="err">{logoError}</span>
          ) : (
            <>
              <b>Your mark.</b> We generate one from your letters — or{" "}
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                {draft.logoDataUrl ? "replace it" : "upload your crest now"}
              </button>
              . Change it anytime in Settings.
            </>
          )}
        </p>
      </div>
      <button className="cta" onClick={onContinue} disabled={!named}>
        Continue<span>→</span>
      </button>
    </div>
  );
}
