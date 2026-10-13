// Small shared pieces of demo chrome.
export function WindowBar({ path }: { path: string }) {
  return <div className="bld-bar" aria-hidden><i /><i /><i /><span>{path}</span></div>;
}

export const Spark = () => (
  <svg className="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
  </svg>
);
