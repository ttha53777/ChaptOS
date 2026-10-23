"use client";

import { useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { PaperIcon } from "../../components/paper/PaperIcon";
import "./fundraisers-paper.css";

/** Sidebar + mobile bar + the scoped paper page every Fundraisers route renders inside. */
export function FundraiserShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return <div className="flex h-dvh overflow-hidden bg-[color:var(--paper)]">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Fundraisers" onNavClick={() => {}} />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="fz-scope fz-mobilebar">
        <button className="fz-iconbtn" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><PaperIcon name="menu" /></button>
        <b>Fundraisers</b>
      </header>
      <main className="fz-main flex-1 overflow-y-auto"><div className="fz-scope fz-page">{children}</div></main>
    </div>
  </div>;
}
