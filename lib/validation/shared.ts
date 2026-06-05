import { z } from "zod";

/**
 * A string that must parse as an http(s) URL. Pass a per-field `message` so
 * callers keep their own validation copy (e.g. "ctaUrl must be http(s)").
 */
export function httpsUrl(message: string) {
  return z.string().refine(
    s => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message },
  );
}
