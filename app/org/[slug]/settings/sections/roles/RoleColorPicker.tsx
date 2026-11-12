"use client";

import React, { useEffect, useState } from "react";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { SWATCHES, swatchName } from "./role-copy";

const HEX6 = /^[0-9a-f]{6}$/i;
const HEX3 = /^[0-9a-f]{3}$/i;

/**
 * Ten named swatches, then a rainbow dot that opens the native picker and a hex
 * field. All three write the same `#RRGGBB` the API validates.
 */
export function RoleColorPicker({ color, touched, readOnly, onChange }: {
  color: string;
  /** False while a persisted role still has no color (shows as neutral). */
  touched: boolean;
  readOnly?: boolean;
  onChange: (hex: string) => void;
}) {
  const preset = touched ? swatchName(color) : null;
  const custom = touched && !preset;
  const [hex, setHex] = useState(color.slice(1).toUpperCase());
  const [editingHex, setEditingHex] = useState(false);
  // Follow outside changes (swatch, picker, template) unless the field is mid-edit.
  useEffect(() => { if (!editingHex) setHex(color.slice(1).toUpperCase()); }, [color, editingHex]);

  const hexBad = hex.length > 0 && !HEX6.test(hex) && !HEX3.test(hex);

  function onSwatchKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + SWATCHES.length) % SWATCHES.length;
    onChange(SWATCHES[n].hex);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  }

  return (
    <div>
      <div className="rs-sws" role="radiogroup" aria-label="Role color">
        <span className="rs-sw-list">
          {SWATCHES.map((s, i) => {
            const on = touched && s.hex.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={s.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={s.name}
                tabIndex={on || (!preset && i === 0) ? 0 : -1}
                disabled={readOnly}
                className="rs-sw"
                style={{ "--c": s.hex } as React.CSSProperties}
                onClick={() => onChange(s.hex)}
                onKeyDown={e => onSwatchKey(e, i)}
              />
            );
          })}
        </span>
        <span className="rs-sw-div" aria-hidden="true" />
        <label className={`rs-sw rs-sw-custom${custom ? " on" : ""}`} title="Pick any color" style={{ "--picked": color } as React.CSSProperties}>
          <input
            type="color"
            value={color.toLowerCase()}
            disabled={readOnly}
            aria-label="Pick any color"
            onChange={e => onChange(e.target.value.toUpperCase())}
          />
          <span className="rs-plus" aria-hidden="true"><PaperIcon name="plus" /></span>
        </label>
        <label className={`rs-hex${hexBad ? " bad" : ""}`} style={{ "--rc": color } as React.CSSProperties}>
          <i aria-hidden="true" />
          <span aria-hidden="true">#</span>
          <input
            className="edt-bare"
            value={hex}
            maxLength={6}
            spellCheck={false}
            autoComplete="off"
            disabled={readOnly}
            aria-label="Hex color code"
            aria-invalid={hexBad}
            onFocus={() => setEditingHex(true)}
            onBlur={() => setEditingHex(false)}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9a-f]/gi, "").toUpperCase();
              setHex(v);
              if (HEX6.test(v)) onChange(`#${v}`);
              else if (HEX3.test(v)) onChange(`#${[...v].map(c => c + c).join("")}`);
            }}
          />
        </label>
      </div>
      <p className="rs-sw-name">
        {!touched ? "No color yet. The role shows as neutral grey until you pick one." : preset ?? `Custom · ${color.toUpperCase()}`}
      </p>
    </div>
  );
}
