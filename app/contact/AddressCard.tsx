"use client";

import { useState } from "react";
import { Doodle, sx } from "../components/landing/Doodle";
import { SUPPORT_EMAIL, gmailCompose } from "@/lib/support";

/**
 * The calling card at the top of /contact: the address itself, before anything
 * else on the page. Someone who only wants to know where to write never has to
 * scroll, pick a reason or read a template.
 *
 * Client-only for the copy button. The address is in the server HTML as plain
 * text, and "Write in Gmail" is an ordinary link, so with JS off the card still
 * does everything except put the address on the clipboard.
 */
export function AddressCard() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused: select the address so Cmd/Ctrl+C is one keypress.
      const el = document.getElementById("ct-addr");
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  return (
    <div className="ct__cc">
      <span className="ct__tape" aria-hidden="true" />
      <span className="ct__tape ct__tape--b" aria-hidden="true" />

      <div className="ct__cck">
        <span className="ct__who">
          <span className="ct__av" aria-hidden="true">
            <Doodle id="envelope" size={17} viewBox="0 0 24 24" />
          </span>
          <span>
            <b>The ChaptOS team</b>
            <br />
            Reading the inbox
          </span>
        </span>
        <span className="ct__live">Read daily</span>
      </div>

      <button type="button" className="ct__addr" onClick={copy} title="Copy address">
        <span className="l">Email us at</span>
        <span className="v" id="ct-addr">{copied ? "Copied ✓" : SUPPORT_EMAIL}</span>
      </button>

      <div className="ct__ccact">
        <button
          type="button"
          className={`btn btn--sm btn--ghost${copied ? " is-ok" : ""}`}
          style={sx({ "--btn-shadow": "var(--butter)" })}
          onClick={copy}
        >
          <Doodle id={copied ? "check" : "copy"} size={16} viewBox="0 0 24 24" />
          {copied ? "Copied" : "Copy address"}
        </button>
        <a
          className="btn btn--sm"
          style={sx({ "--btn-shadow": "var(--sky)" })}
          href={gmailCompose("Hello", "")}
          target="_blank"
          rel="noreferrer noopener"
        >
          Write in Gmail
          <Doodle id="out" size={16} viewBox="0 0 24 24" />
        </a>
      </div>

      {/* The three things worth knowing before you write. */}
      <div className="ct__ccfoot">
        <div>
          <Doodle id="people" viewBox="0 0 24 24" />
          <span><b>A person</b>No bot, no macro.</span>
        </div>
        <div>
          <Doodle id="clock" viewBox="0 0 24 24" />
          <span><b>Within a day</b>Usually. Weekends slower.</span>
        </div>
        <div>
          <Doodle id="lock" viewBox="0 0 24 24" />
          <span><b>No passwords</b>We&apos;ll never ask for one.</span>
        </div>
      </div>
    </div>
  );
}
