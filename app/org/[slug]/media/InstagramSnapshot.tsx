import { formatKey } from "@/lib/media/calendar";
export { formatKey, FORMAT_HINTS } from "@/lib/media/calendar";

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
