import React from "react";

/** A role as every surface draws it: tinted pill, color dot, name. */
export function RoleChip({ name, color, live, ghost }: { name: string; color: string | null; live?: boolean; ghost?: boolean }) {
  return (
    <span
      className={`rs-chip${live ? " live" : ""}${ghost ? " ghost" : ""}`}
      style={{ "--rc": color ?? "#94A3B8" } as React.CSSProperties}
    >
      <span>{name}</span>
    </span>
  );
}
