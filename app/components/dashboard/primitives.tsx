import React, { useEffect } from "react";
import type { BrotherStatus, TaskStatus } from "../../data";
import { BROTHER_STYLES, TASK_STYLES } from "./styles";

export function StatusBadge({ status }: { status: BrotherStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${BROTHER_STYLES[status].badge}`}>
      {status}
    </span>
  );
}

export function TaskBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${TASK_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function Card({ children, className = "", id, onClick, style }: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div id={id} onClick={onClick} style={style} className={`card-premium rounded-2xl border border-white/[0.06] bg-[#141925] ${className}`}>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="card-premium-elevated relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#141925]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.08] hover:text-white transition-colors">
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[12px] font-medium text-slate-400">{children}</label>;
}
