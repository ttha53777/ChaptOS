import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";

export function formatKey(type: string) {
  return (INSTAGRAM_TYPES as readonly string[]).includes(type) ? type.toLowerCase() : "legacy";
}
export const FORMAT_HINTS: Record<string, string> = { Story: "24 hours, then gone", Reel: "Short video", Carousel: "Up to 10 photos" };

/** Decorative format illustration, not a preview of uploaded media. */
export function InstagramSnapshot({ type, developing = false, large = false }: { type: string; developing?: boolean; large?: boolean }) {
  const key = formatKey(type);
  return <span aria-hidden="true" className={`igp-snap ${key} igp-ty-${key}${developing ? " dev" : ""}${large ? " lg" : ""}`}>
    <span className="ph" />
    {key === "story" && <span className="bars"><i /><i /><i /></span>}
    {key === "reel" && <span className="play" />}
    {key === "carousel" && <span className="dots"><i /><i /><i /></span>}
  </span>;
}
