import { FILENAME_MAX_CHARS } from "./limits";

/**
 * The uploaded name as display text only: basename, no control or bidi-override
 * characters, at most 120 chars. Never used as a path or storage key.
 */
export function displayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\p{Cc}​-‏‪-‮⁦-⁩﻿]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Untitled";
  return [...clean].slice(0, FILENAME_MAX_CHARS).join("");
}

/** The name without its extension, for a CSV's single sheet. */
export function stem(name: string): string {
  return name.replace(/\.[^.]{1,5}$/, "") || name;
}
