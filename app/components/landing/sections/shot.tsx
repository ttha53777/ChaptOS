import type { ReactNode } from "react";

/** Title bar of a fake product window. */
export function ShotBar({ path }: { path: ReactNode }) {
  return (
    <div className="shot__bar">
      <i className="tl" />
      <i className="tl" />
      <i className="tl" />
      <span className="shot__path mono">{path}</span>
    </div>
  );
}

/** Breadcrumb separator inside a <ShotBar path={…} />. */
export function Sep() {
  return <span className="sep">/</span>;
}
