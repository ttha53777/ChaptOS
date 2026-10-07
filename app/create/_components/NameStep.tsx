"use client";

/**
 * Step 1 — NAME. One big dashed-underline input; the first keystroke slides the
 * charter in beside it. Below: the web address it will live at, and the mark
 * (drawn from the letters, or an uploaded crest).
 */

import { useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { DISPLAY_HOST, draftSlug, type FlowAction } from "./flow-state";
import { Mark } from "./Mark";
import { Ic } from "./paper";
import type { CreateSession } from "./useSession";
import { useSlugCheck } from "./useSlugCheck";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function NameStep({
  draft,
  dispatch,
  session,
  onContinue,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  session: CreateSession | null;
  onContinue: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const named = !!draft.name.trim();
  const slug = draftSlug(draft);
  const check = useSlugCheck(slug, named);

  function pickLogo(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLogoError("That isn’t an image — try a PNG, JPG or SVG.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("That image is over 2 MB — try a smaller one.");
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError(null);
      dispatch({ type: "setLogo", dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="ask">
      <p className="kick">
        Create your organization{" "}
        <span className="chip">{session ? `signed in as ${session.name}` : "no account needed yet"}</span>
      </p>
      <h1 className="q">
        Let’s set up your <span className="hi">chapter</span>{" "}— what’s it called?
      </h1>
      <input
        className="namein"
        placeholder="Oozma Kappa"
        autoComplete="off"
        spellCheck={false}
        aria-label="Organization name"
        autoFocus
        maxLength={120}
        value={draft.name}
        onChange={e => dispatch({ type: "setName", name: e.target.value })}
        onKeyDown={e => {
          if (e.key === "Enter" && named) onContinue();
        }}
      />
      <p className="slugline" aria-live="polite">
        {!named ? (
          " "
        ) : !slug ? (
          "We’ll need a web address for this one — you’ll pick it on the charter."
        ) : (
          <>
            {DISPLAY_HOST}/<b>{slug}</b>{" "}
            {check.kind === "ok" && (
              <span className="res">
                <Ic name="check" />
                available
              </span>
            )}
            {(check.kind === "taken" || check.kind === "bad") && (
              <span className="warn">· {check.kind === "taken" ? "taken" : check.label.toLowerCase()} — you’ll pick another on the charter</span>
            )}
          </>
        )}
      </p>

      <div className="idrow">
        <button type="button" className="markbtn" title="Upload an icon" onClick={() => fileRef.current?.click()}>
          <Mark name={draft.name} logoUrl={draft.logoDataUrl} />
          <span className="ed">{draft.logoDataUrl ? "change" : "upload"}</span>
        </button>
        <p>
          <b>Your mark.</b> We draw one from your letters — or{" "}
          <button type="button" className="linkbtn" onClick={() => fileRef.current?.click()}>
            {draft.logoDataUrl ? "replace it" : "upload your crest now"}
          </button>
          {draft.logoDataUrl && (
            <>
              {" "}·{" "}
              <button type="button" className="linkbtn" onClick={() => dispatch({ type: "setLogo", dataUrl: undefined })}>
                use the letters
              </button>
            </>
          )}
          . Change it any time in Settings.
          {logoError && <span className="err">{logoError}</span>}
        </p>
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
      </div>

      {session && session.orgs.length > 0 && (
        <p className="second">
          <span className="avatar" style={{ ["--av" as string]: "var(--peach)" }}>
            {session.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            You’re already in <b>{session.orgs[0]!.name}</b>
            {session.orgs.length > 1 ? ` and ${session.orgs.length - 1} more` : ""}. This makes a second, separate org — switch
            between them from the sidebar.
          </span>
        </p>
      )}

      <div className="foot">
        <button type="button" className="btn btn--lg" disabled={!named} onClick={onContinue}>
          Continue
          <Ic name="arrow-r" />
        </button>
        <span className="note">
          or press <kbd>Enter</kbd>
        </span>
      </div>
    </div>
  );
}
