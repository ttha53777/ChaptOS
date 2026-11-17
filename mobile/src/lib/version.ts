/** Semver-ish compare for the update gate (mirrors lib/app-version.ts on the server;
 *  mobile/ can't import it). Pre-release / build suffixes are ignored. */
function parse(v: string): [number, number, number] | null {
  const m = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

export function isBelow(version: string, floor: string | null): boolean {
  if (!floor) return false;
  const a = parse(version), b = parse(floor);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  return false;
}
