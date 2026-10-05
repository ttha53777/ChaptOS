"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { Modal, FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../../components/dashboard/styles";
import { MemberSpotlight } from "../../components/members/MemberSpotlight";
import { JoinRequestsPanel } from "../../components/dashboard/JoinRequestsPanel";
import { TxForm } from "../../components/treasury/TxForm";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { useThresholds } from "../../hooks/useThresholds";
import { useOrgPath } from "../../hooks/useOrgPath";
import {
  Brother,
  BrotherStatus,
  Transaction,
  getBrotherStatus,
  roleTitle,
  avg,
  fmt$,
  fmtDate,
} from "../../data";
import { apiErrorMessage, requestJson } from "../../lib/api";
import { type SeatWall } from "../../lib/seat-wall";
import { useIsOrgAdmin } from "../../hooks/useIsOrgAdmin";
import { useTrackedMetrics } from "../../hooks/useTrackedMetrics";
import { PaperIcon, PaperTile, type PaperIconName } from "../../components/paper/PaperIcon";
import { InviteLinkSheet, InviteLinkChip, useActiveInvites } from "../../components/members/InviteLinkSheet";
import { todayStr } from "../../lib/dates";
import "../../components/dashboard/dashboard-ledger.css";
import "../../components/dashboard/brotherhood-ledger.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// Minimal service-event shape for the member card's "Log service hours" picker.
type ServiceEventOption = { id: number; title: string; date: string };
/** Shape of GET /api/brothers/ghost-accounts (lib/services/brother-service). */
type GhostAccount = { brotherId: number; name: string; email: string | null; joinedAt: string };

// Warm "Chapter Ledger" KPI cell. There's no per-KPI drawer on this page: a click
// re-sorts or filters the roster below to the people behind the number.
// `note` carries the optional gold "needs attention" subline; `icon`/`color` are
// the Paper aesthetic's glyph and its ink.
function Measure({ label, prefix, value, unit, note, noteTone, icon, color, onClick }: {
  label: string; prefix?: string; value: string; unit?: string; note: string; noteTone?: "warn" | "ok";
  icon?: PaperIconName; color?: string; onClick?: () => void;
}) {
  return (
    <div
      className="measure"
      style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
      {...(onClick && {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } },
      })}
    >
      <p className="k">{icon && <PaperIcon name={icon} className="pp-only" />}{label}</p>
      <p className="v">{prefix && <small>{prefix}</small>}{value}{unit && <small>{unit}</small>}</p>
      <p className={`note${noteTone ? ` ${noteTone}` : ""}`}>{note}</p>
    </div>
  );
}

// Status pill in the warm pane — mirrors RosterTable's STATUS_TAG so rows match
// the `.dash` palette (the member card uses its own standing tones).
const STATUS_TAG: Record<BrotherStatus, { cls: string; label: string }> = {
  "Good":    { cls: "st-good",  label: "GOOD" },
  "Watch":   { cls: "st-watch", label: "WATCH" },
  "At Risk": { cls: "st-risk",  label: "AT RISK" },
};

type SortKey = "attendance" | "gpa" | "serviceHours" | "duesOwed" | "name";

// Sortable table header cell (mono caps, violet active arrow).
function SortHead({ label, sortKey, activeKey, dir, onClick, numeric, className }: {
  label: string; sortKey: SortKey; activeKey: SortKey | null; dir: "asc" | "desc";
  onClick: (k: SortKey) => void; numeric?: boolean; className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`sortable${numeric ? " num" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onClick(sortKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}{active && <span className="arrow">{dir === "asc" ? " ↑" : " ↓"}</span>}
    </th>
  );
}

// There is no AddBrotherForm. Officers can no longer type a person onto the
// roster — a roster spot is created by approving a join request, which is what
// JoinRequestsPanel below does. The form that used to live here asked for a
// name, GPA and an opening dues balance, and produced a Brother with no account
// that nobody could ever sign in to.

export default function BrothersPage() {
  const { currentUser, brotherList, setBrotherList, isLoading, avatarRevision, can } = useChapter();
  const v = useVocab();
  const toast = useToast();
  const router = useRouter();
  const orgPath = useOrgPath();
  const isOrgAdmin = useIsOrgAdmin();
  const THRESHOLDS = useThresholds();
  // A metric the org switched off is a stored 0, not a measurement: no column,
  // no measure, and it never moves anyone's standing.
  const tracked = useTrackedMetrics();
  const canBrothers = can("MANAGE_BROTHERS");
  const canTreasury = can("MANAGE_TREASURY");
  // Invite links are gated on MANAGE_SETTINGS, not MANAGE_BROTHERS — roster CRUD
  // and settings authority are deliberately separate bits (lib/permissions.ts).
  const canSettings = can("MANAGE_SETTINGS");
  // Distinct from MANAGE_BROTHERS — gates the pending-excuse chip + member-card review.
  const canAttendance = can("MANAGE_ATTENDANCE");
  const customFieldDefs = useMemo(
    () => (currentUser?.org?.customMemberFields ?? []).filter(f => f.showOnRoster).sort((a, b) => a.rosterOrder - b.rosterOrder),
    [currentUser?.org?.customMemberFields],
  );
  const selfId = currentUser?.id ?? null;

  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [search,           setSearch]           = useState("");
  const [statusFilter,     setStatusFilter]     = useState<BrotherStatus | "All">("All");
  const [sortKey,          setSortKey]          = useState<SortKey | null>(null);
  const [sortDir,          setSortDir]          = useState<"asc" | "desc">("asc");
  const [selectedId,       setSelectedId]       = useState<number | null>(null);
  // "Record Payment" modal — opened from the Pay button on a roster row or the
  // member card. Holds the target brother; the amount entered is deducted
  // from their outstanding dues.
  const [payTarget,        setPayTarget]        = useState<Brother | null>(null);
  const [payAmountStr,     setPayAmountStr]     = useState("");
  const [duesTx,           setDuesTx]           = useState<{ brother: Brother; amount: number } | null>(null);
  // Pending-excuse counts keyed by brotherId — drives the roster review chip.
  // Loaded once for MANAGE_ATTENDANCE holders; missing key = 0 (no chip).
  const [pendingCounts,    setPendingCounts]    = useState<Record<number, number>>({});
  const [pageError,        setPageError]        = useState<string | null>(null);
  // The org has outgrown its plan. Kept separate from pageError because it isn't
  // a failure to retry — it's a state with one specific way out.
  const [seatWall,         setSeatWall]         = useState<SeatWall | null>(null);
  const [deleteError,      setDeleteError]      = useState<string | null>(null);
  // "Log service hours" modal (opened from the member card's Service popover).
  const [logHoursFor,     setLogHoursFor]     = useState<Brother | null>(null);
  const [logHoursEvents,  setLogHoursEvents]  = useState<ServiceEventOption[]>([]);
  const [logHoursEventId, setLogHoursEventId] = useState<number | null>(null);
  const [logHoursStr,     setLogHoursStr]     = useState("");
  const [logHoursBusy,    setLogHoursBusy]    = useState(false);
  // Members with access to this org who can't appear on its roster — see the
  // effect below.
  const [ghostAccounts,   setGhostAccounts]   = useState<GhostAccount[]>([]);
  const [inviteOpen,      setInviteOpen]      = useState(false);
  const rosterRef = React.useRef<HTMLElement | null>(null);

  // ?section=invitations is read on mount by the settings page, which opens the
  // Membership group and scrolls to the invitations block.
  const goToInvites = useCallback(() => {
    router.push(`${orgPath("/settings")}?section=invitations`);
  }, [router, orgPath]);

  // Pull the roster again after an approval. A full refetch rather than pushing
  // the returned row in by hand: approval creates a Membership plus (optionally)
  // a BrotherRole, and roleTitle() renders the relational roles — so a locally
  // synthesized row would show the right name under the wrong title until the
  // next navigation.
  const reloadRoster = useCallback(async () => {
    try {
      setBrotherList(await requestJson<Brother[]>("/api/brothers"));
    } catch {
      // The approval itself succeeded; a stale list corrects on next load.
    }
  }, [setBrotherList]);

  function openLogServiceHours(b: Brother) {
    setLogHoursFor(b);
    setLogHoursStr("");
    setLogHoursEventId(null);
    requestJson<ServiceEventOption[]>("/api/service-events")
      .then(events => {
        const sorted = [...events].sort((a, z) => z.date.localeCompare(a.date));
        setLogHoursEvents(sorted);
        setLogHoursEventId(sorted[0]?.id ?? null);
      })
      .catch(() => toast.error("Could not load service events."));
  }

  // Load pending-excuse counts for the review chip (MANAGE_ATTENDANCE only).
  useEffect(() => {
    if (!canAttendance) { setPendingCounts({}); return; }
    requestJson<Record<number, number>>("/api/excuses/pending-counts")
      .then(setPendingCounts)
      .catch(() => {});
  }, [canAttendance]);

  // Legacy `isGhost` accounts: people who can read this org but never appear in
  // the table below. An admin needs to know these exist at all.
  //
  // This used to fetch a second group as well — members who had joined by invite
  // and held only a Membership, with no roster row. That group is gone: a
  // Membership IS the roster row now, so joining puts you on the roster.
  // Silent on failure: it's an explanatory callout, not roster data.
  useEffect(() => {
    if (!canBrothers) { setGhostAccounts([]); return; }
    requestJson<GhostAccount[]>("/api/brothers/ghost-accounts")
      .then(setGhostAccounts)
      .catch(() => {});
  }, [canBrothers]);

  // After a member-card approve/reject, drop the acted-on member's chip (floor 0) and
  // patch attendance on approval (mirrors the Timeline review queue).
  const handleExcuseDecided = useCallback(
    (brotherId: number, _action: "approve" | "reject", attendance: number | null) => {
      setPendingCounts(prev => {
        const next = Math.max(0, (prev[brotherId] ?? 0) - 1);
        return { ...prev, [brotherId]: next };
      });
      if (attendance !== null) {
        setBrotherList(prev => prev.map(b => b.id === brotherId ? { ...b, attendance } : b));
      }
    },
    [setBrotherList],
  );

  async function submitLogServiceHours() {
    if (!logHoursFor || logHoursEventId == null) return;
    const hours = Math.max(0, parseFloat(logHoursStr) || 0);
    const b = logHoursFor;
    setLogHoursBusy(true);
    try {
      await requestJson(`/api/service-events/${logHoursEventId}/participation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ brotherId: b.id, hours }] }),
      });
      // serviceHours is recomputed server-side from participations; pull fresh totals.
      const fresh = await requestJson<Brother[]>("/api/brothers");
      setBrotherList(fresh);
      toast.success("Service hours logged.");
      setLogHoursFor(null);
    } catch {
      toast.error("Could not log service hours.");
    } finally {
      setLogHoursBusy(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!brotherList.length) return null;
    const attRisk  = brotherList.filter(b => getBrotherStatus(b, THRESHOLDS, tracked) === "At Risk").length;
    const watching = brotherList.filter(b => getBrotherStatus(b, THRESHOLDS, tracked) === "Watch").length;
    const duesTotal = brotherList.reduce((s, b) => s + b.duesOwed, 0);
    const svcMet   = brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length;
    return { avgAtt: avg(brotherList.map(b => b.attendance)), avgGpa: avg(brotherList.map(b => b.gpa)), attRisk, watching, duesTotal, svcMet, total: brotherList.length };
  }, [brotherList, THRESHOLDS, tracked]);

  const statusCounts = useMemo(() => {
    const counts = { All: brotherList.length, Good: 0, Watch: 0, "At Risk": 0 };
    brotherList.forEach(b => { counts[getBrotherStatus(b, THRESHOLDS, tracked)]++; });
    return counts;
  }, [brotherList, THRESHOLDS, tracked]);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      const matchQ = !q || b.name.toLowerCase().includes(q) || roleTitle(b).toLowerCase().includes(q);
      const matchS = statusFilter === "All" || getBrotherStatus(b, THRESHOLDS, tracked) === statusFilter;
      return matchQ && matchS;
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir, THRESHOLDS, tracked]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  // Opens the Record Payment modal pre-filled with the full outstanding balance.
  const payDues = useCallback((b: Brother) => {
    setPayTarget(b);
    setPayAmountStr(b.duesOwed > 0 ? String(b.duesOwed) : "");
  }, []);

  // "Record Payment" now hands off to the pre-filled transaction form — the treasurer
  // confirms the ledger entry and posts it there. It is posting that transaction (below)
  // which mints the income row and decrements the balance together (createTransaction).
  const submitPayment = useCallback(() => {
    if (!payTarget) return;
    const amount = Math.max(0, parseFloat(payAmountStr) || 0);
    if (amount === 0) return;
    setDuesTx({ brother: payTarget, amount });
    setPayTarget(null);
    setPayAmountStr("");
  }, [payTarget, payAmountStr]);

  // Post the dues payment through the ordinary transaction endpoint. The server moves
  // both books in one DB transaction, so on success we refetch brothers to show the
  // lowered balance; overpayment/a lost race arrives as a 409 whose message names the
  // real balance.
  const recordDuesTx = useCallback(async (
    data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt" | "calendarEvents"> & { calendarEventIds: number[]; brotherId?: number },
  ) => {
    const b = duesTx?.brother;
    setDuesTx(null);
    setPageError(null);
    try {
      await requestJson<Transaction>("/api/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const fresh = await requestJson<Brother[]>("/api/brothers");
      setBrotherList(fresh);
      if (b) toast.success(`Recorded ${fmt$(data.amount)} from ${b.name}.`);
    } catch (e) {
      setPageError(apiErrorMessage(e, "Dues payment failed. Nothing was recorded."));
    }
  }, [duesTx, setBrotherList, toast]);

  const deleteBrother = useCallback(async (b: Brother) => {
    setBrotherList(prev => prev.filter(x => x.id !== b.id));
    setSelectedId(null);
    setDeleteError(null);
    try {
      await requestJson<void>(`/api/brothers/${b.id}`, { method: "DELETE" });
    } catch (err) {
      setBrotherList(prev => [...prev, b]);
      // Show the server's reason. deleteBrother refuses for exactly two stated
      // reasons (last admin, platform-admin grant) and both arrive as readable
      // ConflictError text; anything else falls back. This used to sniff for
      // "attendance records", a string the server never sent — members with
      // attendance were undeletable, but the message shown was always the
      // generic one. They're deletable now, so the branch is gone entirely.
      setDeleteError(apiErrorMessage(err, "Failed to remove brother."));
    }
  }, [setBrotherList]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = [
      ["Name", "Role", "Attendance %", "GPA", "Service Hours", "Dues Owed", "Status"],
      ...filtered.map(b => [
        b.name,
        roleTitle(b),
        String(b.attendance),
        b.gpa.toFixed(2),
        String(b.serviceHours),
        b.duesOwed.toFixed(2),
        getBrotherStatus(b, THRESHOLDS, tracked),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brotherhood-roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Status filter is driven by BOTH the segmented "Standing" bar and the chips.
  const statusChips: Array<{ label: string; value: BrotherStatus | "All"; count: number }> = [
    { label: "All",     value: "All",     count: statusCounts.All },
    { label: "Good",    value: "Good",    count: statusCounts.Good },
    { label: "Watch",   value: "Watch",   count: statusCounts.Watch },
    { label: "At Risk", value: "At Risk", count: statusCounts["At Risk"] },
  ];
  const segments: Array<{ value: BrotherStatus; cls: string; dotCls: string; label: string; count: number }> = [
    { value: "Good",    cls: "s-good",  dotCls: "bg-sage", label: "Good",    count: statusCounts.Good },
    { value: "Watch",   cls: "s-watch", dotCls: "bg-gold", label: "Watch",   count: statusCounts.Watch },
    { value: "At Risk", cls: "s-risk",  dotCls: "bg-rose", label: "At risk", count: statusCounts["At Risk"] },
  ];
  const toggleStatus = (s: BrotherStatus) => setStatusFilter(statusFilter === s ? "All" : s);
  const colCount = 2 + [tracked.attendance, tracked.gpa, tracked.serviceHours, tracked.duesOwed].filter(Boolean).length + customFieldDefs.length;

  // Live "needs attention" sentence for the editorial header.
  const duesOwingCount = tracked.duesOwed ? brotherList.filter(b => b.duesOwed > 0).length : 0;
  const belowAttend    = tracked.attendance ? brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch).length : 0;

  // Day one: the founder is pinned to the roster at creation, so "nobody yet" is
  // a one-row roster, not an empty one. Standing for one person says nothing;
  // Paper shows how joining works there instead.
  const dayOne = !isLoading && brotherList.length <= 1;
  const dayOneInvites = useActiveInvites(canSettings && dayOne);
  const seats = currentUser?.org?.seats ?? null;
  const seatsLeft = seats ? Math.max(0, seats.capacity - seats.used) : null;
  const memberPlural = v("Member", true).toLowerCase();

  // A measure points at the people behind it: the money owed sorts largest-first,
  // the averages sort worst-first, good standing filters. Then bring the roster up.
  const focusRoster = (k: "attendance" | "gpa" | "serviceHours" | "duesOwed" | "good") => {
    if (k === "good") setStatusFilter("Good");
    else { setSortKey(k); setSortDir(k === "duesOwed" ? "desc" : "asc"); }
    rosterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const askWhoIsSlipping = () => {
    window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: `Which ${memberPlural} are slipping, and why?` } }));
  };
  const todayChip = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Brotherhood" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar (mobile/tablet only — hidden at lg+ where the sidebar is
            static and the Export/New actions live in the editorial header below). ── */}
        <header className="toolbar-frosted dash-toolbar relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="tb-title text-[14px] font-semibold leading-tight text-[color:var(--ink)]">{v("Member", true)}</p>
            <p className="tb-org hidden text-[11px] leading-tight text-[color:var(--muted)] sm:block">{currentUser?.org?.name ?? "ChaptOS"} · {v("Member")} Roster</p>
          </div>
          {/* Mobile-only quick actions; the desktop Export/New live in the editorial header below. */}
          <div className="tb-actions flex shrink-0 items-center gap-2 lg:hidden">
            <button
              onClick={handleExport}
              title="Export CSV"
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(var(--ink-rgb),0.12)] bg-[rgba(var(--ink-rgb),0.04)] text-[color:var(--muted)] transition-all hover:border-[rgba(var(--ink-rgb),0.24)] hover:bg-[rgba(var(--ink-rgb),0.08)] hover:text-[color:var(--ink)]"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {canSettings && (
              <button
                onClick={() => setInviteOpen(true)}
                title="Invite with a link"
                className="tb-btn flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-[rgba(var(--ink-rgb),0.04)] px-3.5 text-[12px] font-semibold text-[color:var(--vio)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white"
              >
                <svg className="h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Invite</span>
              </button>
            )}
          </div>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          {/* Warm editorial pane, scoped under `.dash` (dashboard-ledger.css +
              brotherhood-ledger.css). Sidebar, toolbar, drawers and modals are
              outside this wrapper and keep their own styling. */}
          <div className="dash" data-dashboard-theme="dusk">

            {/* ── Error bands ── */}
            {seatWall && (
              <div className="seat-wall" role="status">
                <div className="sw-copy">
                  <p className="sw-head">{seatWall.message}</p>
                  <p className="sw-sub">
                    Nobody was removed and nothing stopped working — this only blocks adding
                    someone new.{" "}
                    {isOrgAdmin
                      ? seatWall.action === "quote"
                        ? "Past this size we price per organization, which takes a short conversation."
                        : seatWall.action === "upgrade" ? "Choose a larger plan to approve more members." : "Choose a plan or set up automatic billing to continue."
                      : "An org admin can clear this from Settings → Billing."}
                  </p>
                </div>
                <div className="sw-act">
                  {isOrgAdmin && (
                    <button className={btnDuskActionCls} onClick={() => router.push(orgPath("/billing"))}>
                      {seatWall.action === "quote" ? "Request a quote" : "Set up billing"}
                    </button>
                  )}
                  <button className="sw-dismiss" onClick={() => setSeatWall(null)}>Dismiss</button>
                </div>
              </div>
            )}
            {pageError && (
              <div className="page-err">
                <p>{pageError}</p>
                <button onClick={() => setPageError(null)}>Dismiss</button>
              </div>
            )}
            {deleteError && (
              <div className="page-err warn">
                <p>{deleteError}</p>
                <button onClick={() => setDeleteError(null)}>Dismiss</button>
              </div>
            )}

            {/* ── People waiting to be let in ──
                Above the header on purpose: it is the only thing on this page
                that someone outside the org is blocked on, and it renders
                nothing at all when the queue is empty. */}
            {canBrothers && (
              <JoinRequestsPanel
                memberWord={v("Member").toLowerCase()}
                maxRank={currentUser?.maxRank ?? 0}
                onApproved={() => { void reloadRoster(); }}
                onSeatWall={setSeatWall}
                onError={setPageError}
                onStatus={(m) => toast.success(m)}
              />
            )}

            {/* ── Editorial header ── */}
            <div className="pagehead">
              <div>
                <p className="kicker"><span className="today pp-only">{todayChip}</span>{currentUser?.org?.name ?? "ChaptOS"} &ensp;·&ensp; {v("Member")} Roster</p>
                <h1>The <em>{v("Member", true)}<span className="pp-only">.</span></em></h1>
                {dayOne && (
                  <p className="summary pp-only">
                    It&rsquo;s just you so far. Share an invite link &mdash; people sign in with Google,
                    ask to join, and you approve them right here.
                  </p>
                )}
                {kpis && (
                  <p className={`summary${dayOne ? " lg-only" : ""}`}>
                    {kpis.total} {v("Member", true).toLowerCase()} active.{" "}
                    <b>{statusCounts["At Risk"]} at risk</b> and <b>{statusCounts.Watch} on watch</b>
                    {(duesOwingCount > 0 || belowAttend > 0) && <>
                      {" "}— {duesOwingCount > 0 && <>{duesOwingCount} owe {fmt$(kpis.duesTotal)} in {v("Dues").toLowerCase()}</>}
                      {duesOwingCount > 0 && belowAttend > 0 && " and "}
                      {belowAttend > 0 && <>{belowAttend} sit below the {THRESHOLDS.attendanceWatch}% attendance line</>}
                    </>}.
                  </p>
                )}
              </div>
              <div className="head-actions">
                <button className="btn bh-export" onClick={handleExport} title="Export CSV">
                  <svg className="lg-only" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <PaperIcon name="out" className="pp-only" />
                  Export
                </button>
                {/* The roster is where anyone goes to think about adding people,
                    but inviting used to live only in Settings → Membership with
                    nothing here pointing at it. */}
                {canSettings && (
                  <button className="btn primary" onClick={() => setInviteOpen(true)} title="Invite with a link">
                    <svg className="lg-only" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5L21 3m0 0h-5.25M21 3v5.25M10 5H6a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3v-4" /></svg>
                    <PaperIcon name="envelope" className="pp-only" />
                    <span className="lg-only">Invite {v("Member", true)}</span>
                    <span className="pp-only">Invite {memberPlural}</span>
                  </button>
                )}
                <button className="askbar pp-only" onClick={askWhoIsSlipping}>
                  <PaperIcon name="spark" />Ask who&rsquo;s slipping<kbd>⌘K</kbd>
                </button>
              </div>
            </div>

            {/* ── Ledger strip ── */}
            {isLoading ? (
              <div className="ledger-skel" style={{ marginTop: 22 }}>{[...Array(5)].map((_, i) => <i key={i} />)}</div>
            ) : kpis && (
              <section className="ledger" style={{ marginTop: 22 }}>
                {tracked.attendance && <Measure
                  label="Attendance" value={kpis.avgAtt.toFixed(1)} unit="%"
                  note={belowAttend > 0 ? `${belowAttend} below ${THRESHOLDS.attendanceWatch}%` : "all on track"}
                  noteTone={belowAttend > 0 ? "warn" : "ok"}
                  icon="check" color="var(--pp-mint-ink)" onClick={() => focusRoster("attendance")}
                />}
                {tracked.gpa && <Measure
                  label={`${v("Meetings")} GPA`} value={kpis.avgGpa.toFixed(2)}
                  note={`${brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch).length} below ${THRESHOLDS.gpaWatch.toFixed(1)}`}
                  icon="star" color="var(--pp-lilac-ink)" onClick={() => focusRoster("gpa")}
                />}
                {tracked.duesOwed && <Measure
                  label={`${v("Dues")} outstanding`} prefix="$" value={kpis.duesTotal.toLocaleString()}
                  note={duesOwingCount > 0 ? `${duesOwingCount} ${memberPlural} owe` : "all paid up"}
                  noteTone={duesOwingCount > 0 ? "warn" : "ok"}
                  icon="wallet" color="var(--pp-butter-ink)" onClick={() => focusRoster("duesOwed")}
                />}
                {tracked.serviceHours && <Measure
                  label={`${v("Service")} hours`} value={String(brotherList.reduce((s, b) => s + b.serviceHours, 0))} unit="h"
                  note={`${kpis.svcMet} of ${kpis.total} on track`}
                  icon="heart" color="var(--pp-sky-ink)" onClick={() => focusRoster("serviceHours")}
                />}
                <Measure
                  label="In good standing" value={String(statusCounts.Good)} unit={` / ${kpis.total}`}
                  note={`${Math.round((statusCounts.Good / Math.max(1, kpis.total)) * 100)}% of ${memberPlural}`}
                  noteTone="ok"
                  icon="people" color="var(--pp-mint-ink)" onClick={() => focusRoster("good")}
                />
              </section>
            )}

            {/* ── Standing — interactive segmented bar ── */}
            {dayOne && (
              <section className="bh-inv pp-only" aria-label="How joining works">
                <div>
                  <p className="bh-eyebrow">How joining works</p>
                  <h2>Joining is reviewed &mdash; a link isn&rsquo;t access.</h2>
                  <p>
                    Anyone with the link can ask. Their request waits here until you approve
                    it, and you can hand them a role as you do.
                  </p>
                  {canSettings && (dayOneInvites.links[0] ? (
                    <InviteLinkChip
                      link={dayOneInvites.links[0]}
                      onCopied={() => toast.success("Invite link copied")}
                      onError={setPageError}
                    />
                  ) : dayOneInvites.loaded && (
                    <button type="button" className="bh-btn" onClick={() => setInviteOpen(true)}>
                      <PaperIcon name="link" />Get an invite link
                    </button>
                  ))}
                </div>
                <ol className="bh-steps">
                  <li><span><b>Share the link</b><span>Drop it in the group chat or the recruitment email.</span></span></li>
                  <li><span><b>They sign in with Google</b><span>&hellip;and ask to join. Nothing is created yet.</span></span></li>
                  <li><span><b>You approve them here</b><span>One tap puts them on the roster &mdash; with a role if they hold one.</span></span></li>
                </ol>
              </section>
            )}

            {!isLoading && kpis && (
              <section className={`dist${dayOne ? " lg-only" : ""}`}>
                <div className="dist-head">
                  <h2>Standing</h2>
                  <span className="hint lg-only">Click a band to filter</span>
                  <span className="hint pp-only">
                    Click a band or a face &mdash;{" "}
                    {[
                      tracked.attendance && `attendance under ${THRESHOLDS.attendanceWatch}%`,
                      tracked.gpa && `GPA under ${THRESHOLDS.gpaWatch.toFixed(2)}`,
                      tracked.duesOwed && `${v("Dues").toLowerCase()} owed`,
                      tracked.serviceHours && `${v("Service").toLowerCase()} under ${THRESHOLDS.serviceHoursGoal}h`,
                    ].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " or $1")}{" "}
                    puts someone on watch.
                  </span>
                </div>
                <div className="bh-seg">
                  {segments.filter(s => s.count > 0).map(s => (
                    <button
                      key={s.value}
                      className={`${s.cls}${statusFilter !== "All" && statusFilter !== s.value ? " dim" : ""}`}
                      style={{ flex: s.count }}
                      onClick={() => toggleStatus(s.value)}
                      title={`${s.label} · ${s.count} — click to filter`}
                      aria-label={`Filter ${s.label}`}
                    >
                      <span className="pp-only">{s.count > 2 ? s.count : ""}</span>
                    </button>
                  ))}
                </div>
                <div className="seg-legend">
                  {segments.map(s => (
                    <button
                      key={s.value}
                      className={statusFilter === s.value ? "active" : undefined}
                      onClick={() => toggleStatus(s.value)}
                    >
                      <span className={`dot ${s.dotCls}`} />
                      <span className="lbl">{s.label}</span>
                      <span className="ct">{s.count}</span>
                    </button>
                  ))}
                </div>
                {/* Paper's class photo: every face, ringed by standing. A face opens
                    that member's card; a band/legend filter dims everyone else. */}
                <div className="bh-photo pp-only" aria-label={`Every ${v("Member").toLowerCase()}, ringed by standing`}>
                  {brotherList.map(b => {
                    const st = getBrotherStatus(b, THRESHOLDS, tracked);
                    const ring = st === "Good" ? "ph-good" : st === "Watch" ? "ph-watch" : "ph-risk";
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`${ring}${b.id === selfId ? " you" : ""}${statusFilter !== "All" && statusFilter !== st ? " dim" : ""}`}
                        title={`${b.name} · ${STATUS_TAG[st].label.toLowerCase()}`}
                        aria-label={`Open ${b.name}`}
                        onClick={() => setSelectedId(b.id)}
                      >
                        <BrotherAvatar
                          brother={b}
                          selfId={selfId}
                          selfAvatarUrl={currentUser?.avatarUrl}
                          avatarRevision={avatarRevision}
                          size="xs"
                          ringClassName="bg-[var(--vio-bg)] text-[var(--vio)] text-[10px]"
                        />
                      </button>
                    );
                  })}
                  <p className="cap">Everyone at a glance &mdash; {brotherList.length} {brotherList.length === 1 ? "face" : "faces"}, one ring each.</p>
                </div>
              </section>
            )}

            {/* ── Hidden legacy accounts ──
                `isGhost` rows: full member-level read access, filtered out of every
                listing, count and attendance roll. They were provisioned by a claim-
                flow backdoor that no longer exists, so this list can only shrink —
                but anyone still on it can read this org's data, and before this
                callout nothing in the product said so. Surfaced with the email
                attached because revoking one is a support request, not a button:
                they have no roster row for the table's remove action to target. */}
            {ghostAccounts.length > 0 && (
              <div className="page-note" style={{ marginTop: 14 }}>
                <p>
                  <b>
                    {ghostAccounts.length} hidden {ghostAccounts.length === 1 ? "account has" : "accounts have"} read access
                  </b>{" "}
                  to this organization without appearing on the roster. These are
                  legacy observer accounts; nothing can create new ones. They can
                  see member names, GPA, dues and attendance figures. If you
                  don&rsquo;t recognise one, contact support to have it removed.
                </p>
                <p className="who">
                  {ghostAccounts.map(m => m.email ?? m.name).join(", ")}
                </p>
              </div>
            )}

            {/* ── Roster ── */}
            <section ref={rosterRef} className="card roster" style={{ marginTop: 14 }} aria-label="Roster">
              <div className="card-h">
                <PaperTile icon="people" tone="sky" />
                <h2>Roster <span className="count-chip" style={{ color: "var(--muted)", background: "var(--card-2)" }}>{filtered.length} shown</span></h2>
                <div className="roster-tools">
                  <div className="filters">
                    {statusChips.map(chip => (
                      <button
                        key={chip.value}
                        className={statusFilter === chip.value ? "on" : undefined}
                        onClick={() => setStatusFilter(chip.value)}
                      >
                        {chip.label} {chip.count}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or role…" />
                  </div>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{v("Member")}</th>
                      {tracked.attendance   && <SortHead label="Attendance" sortKey="attendance"   activeKey={sortKey} dir={sortDir} onClick={toggleSort} className="c-att" />}
                      {tracked.gpa          && <SortHead label="GPA"        sortKey="gpa"          activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric className="c-gpa" />}
                      {tracked.serviceHours && <SortHead label={v("Service")} sortKey="serviceHours" activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric className="c-svc" />}
                      {tracked.duesOwed     && <SortHead label={v("Dues")}  sortKey="duesOwed"     activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric className="c-dues" />}
                      <th className="num">Status</th>
                      {customFieldDefs.map(f => (
                        <th key={f.id} className="num c-cf">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      [...Array(6)].map((_, i) => (
                        <tr key={i}><td colSpan={colCount} style={{ padding: 0 }}><div className="row-skel" /></td></tr>
                      ))
                    ) : brotherList.length === 0 ? (
                      /* A brand-new org used to be told its members didn't
                         "match your filters" — the one moment the page should be
                         handing over a way to get people in. */
                      <tr className="empty-row">
                        <td colSpan={colCount}>
                          <div className="roster-empty">
                            <div className="t">No one&rsquo;s on the roster yet</div>
                            <div className="h">
                              Share an invite link. {v("Member", true)} sign in with Google,
                              ask to join, and you approve them from here.
                            </div>
                            <div className="a">
                              {canSettings && (
                                <button className="btn primary" onClick={goToInvites}>
                                  Invite your {v("Member", true).toLowerCase()}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr className="empty-row"><td colSpan={colCount}>No {v("Member", true).toLowerCase()} match your filters.</td></tr>
                    ) : (
                      filtered.map(b => {
                        const status = getBrotherStatus(b, THRESHOLDS, tracked);
                        const tag = STATUS_TAG[status];
                        const attCls = b.attendance >= THRESHOLDS.attendanceWatch ? "sage" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "gold" : "rose";
                        const attBar = b.attendance >= THRESHOLDS.attendanceWatch ? "bg-sage" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "bg-gold" : "bg-rose";
                        const gpaCls = b.gpa < THRESHOLDS.gpaAtRisk ? "rose" : b.gpa < THRESHOLDS.gpaWatch ? "gold" : "";
                        const svcCls = b.serviceHours < THRESHOLDS.serviceHoursGoal ? "gold" : "muted";
                        return (
                          <tr
                            key={b.id}
                            data-st={tag.cls}
                            className={selectedId === b.id ? "sel" : undefined}
                            onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                          >
                            <td>
                              <div className="b-name">
                                <BrotherAvatar
                                  brother={b}
                                  selfId={selfId}
                                  selfAvatarUrl={currentUser?.avatarUrl}
                                  avatarRevision={avatarRevision}
                                  size="xs"
                                  ringClassName="bg-[var(--vio-bg)] text-[var(--vio)] text-[10px]"
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div className="nm">
                                    {b.name}
                                    {canAttendance && (pendingCounts[b.id] ?? 0) > 0 && (
                                      <span className="excuse-chip" title={`${pendingCounts[b.id]} pending excuse ${pendingCounts[b.id] === 1 ? "review" : "reviews"}`}>
                                        <PaperIcon name="clip" className="pp-only" />{pendingCounts[b.id]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="rl">{roleTitle(b)}</div>
                                </div>
                              </div>
                            </td>
                            {tracked.attendance && <td className="c-att">
                              <div className="attb">
                                <span className="track"><i className={attBar} style={{ width: `${clamp(b.attendance, 0, 100)}%` }} /></span>
                                <span className={attCls}>{b.attendance}%</span>
                              </div>
                            </td>}
                            {tracked.gpa && <td className="num c-gpa"><span className={`mono ${gpaCls}`}>{b.gpa.toFixed(2)}</span></td>}
                            {tracked.serviceHours && <td className="num c-svc"><span className={`mono ${svcCls}`}>{b.serviceHours}h</span></td>}
                            {tracked.duesOwed && <td className="num c-dues">
                              {b.duesOwed > 0 ? (
                                <>
                                  <span className="mono gold">{fmt$(b.duesOwed)}</span>
                                  {canTreasury && (
                                    <button type="button" className="row-act pay-act" onClick={e => { e.stopPropagation(); payDues(b); }}>Pay</button>
                                  )}
                                </>
                              ) : (
                                <span className="mono muted">—</span>
                              )}
                            </td>}
                            <td className="num"><span className={`status-tag ${tag.cls}`}>{tag.label}</span></td>
                            {customFieldDefs.map(f => (
                              <td key={f.id} className="num c-cf"><span className="mono muted">{b.customFields?.[f.id] != null ? String(b.customFields[f.id]) : "—"}</span></td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {!isLoading && filtered.length > 0 && (
                <div className="table-foot">
                  {filtered.length} of {brotherList.length} {v("Member", true).toLowerCase()} · {statusCounts.Good} good · {statusCounts.Watch} watch · {statusCounts["At Risk"]} at risk &ensp;—&ensp; click a row for profile, {v("Dues").toLowerCase()} &amp; {v("Service").toLowerCase()} log
                </div>
              )}
            </section>

          </div>
        </main>
      </div>

      {inviteOpen && (
        <InviteLinkSheet
          memberWord={memberPlural}
          seatsLeft={seatsLeft}
          onClose={() => { setInviteOpen(false); if (dayOne) void dayOneInvites.reload(); }}
          onCopied={() => toast.success("Invite link copied")}
          onOpenSettings={() => { setInviteOpen(false); goToInvites(); }}
        />
      )}

      {/* ── Member card. Writes go straight to the API and patch brotherList;
          ←/→ follow the table's current filter + sort. ── */}
      <MemberSpotlight
        brotherId={selectedId}
        order={filtered.map(b => b.id)}
        onNavigate={setSelectedId}
        onClose={() => setSelectedId(null)}
        onPayDues={payDues}
        onLogServiceHours={openLogServiceHours}
        onDelete={deleteBrother}
        onExcuseDecided={handleExcuseDecided}
      />

      {/* ── Log Service Hours Modal ── */}
      {logHoursFor && (
        <Modal title="Log Service Hours" tone="dusk" onClose={() => !logHoursBusy && setLogHoursFor(null)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[color:var(--muted)]">
              Logging hours for <span className="font-semibold text-[color:var(--ink)]">{logHoursFor.name}</span> against a service event.
            </p>
            <div>
              <FieldLabel tone="dusk">Service Event</FieldLabel>
              {logHoursEvents.length === 0 ? (
                <p className="mt-1 text-[12px] text-[color:var(--faint)]">No service events yet. Create one on the Service page first.</p>
              ) : (
                <select
                  className={inputDuskCls}
                  value={logHoursEventId ?? ""}
                  onChange={e => setLogHoursEventId(e.target.value ? Number(e.target.value) : null)}
                >
                  {logHoursEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title} · {fmtDate(ev.date)}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <FieldLabel tone="dusk">Hours</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                className={inputDuskCls}
                value={logHoursStr}
                placeholder="0"
                autoFocus
                onChange={e => setLogHoursStr(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && logHoursEventId != null && logHoursStr !== "") submitLogServiceHours(); }}
              />
              <p className="mt-1.5 text-[11px] text-[color:var(--faint)]">
                Sets {logHoursFor.name.split(" ")[0]}&apos;s hours for this event. Their total recomputes from all logged events.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogHoursFor(null)}
                disabled={logHoursBusy}
                className={btnDuskGhostCls}
              >
                Cancel
              </button>
              <button
                onClick={submitLogServiceHours}
                disabled={logHoursBusy || logHoursEventId == null || logHoursStr === ""}
                className={btnDuskActionCls}
              >
                {logHoursBusy ? "Saving…" : "Log Hours"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Record Payment Modal ── */}
      {payTarget && (
        <Modal title="Record Payment" tone="dusk" onClose={() => setPayTarget(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-[color:var(--muted)] mb-3">
                {payTarget.name} currently owes{" "}
                <span className="font-semibold text-[color:var(--gold)]">{fmt$(payTarget.duesOwed)}</span>
              </p>
              <FieldLabel tone="dusk">Amount Paid ($)</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputDuskCls}
                value={payAmountStr}
                onChange={e => setPayAmountStr(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submitPayment(); }}
              />
              {parseFloat(payAmountStr) > 0 && (
                <p className="mt-1.5 text-[11px] text-[color:var(--muted)]">
                  Opens the transaction form pre-filled — review and post it to record
                  the payment.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayTarget(null)} className={btnDuskGhostCls}>
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={!(parseFloat(payAmountStr) > 0)}
                className={btnDuskActionCls}
              >
                Continue
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Record Dues Payment (pre-filled transaction form) ── */}
      {duesTx && (
        <Modal title="Record Dues Payment" tone="dusk" onClose={() => setDuesTx(null)}>
          <TxForm
            tone="dusk"
            duesFor={{ id: duesTx.brother.id, name: duesTx.brother.name }}
            initial={{
              type:        "income",
              category:    "Dues",
              amount:      duesTx.amount,
              date:        todayStr(),
              description: `Dues payment — ${duesTx.brother.name}`,
            }}
            onSubmit={recordDuesTx}
            onCancel={() => setDuesTx(null)}
          />
        </Modal>
      )}
    </div>
  );
}
