"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { inputDuskCls, btnDuskPrimaryCls } from "../../components/dashboard/styles";
import { CalendarEventForm, type CalendarDraft, type CategoryOption } from "../../components/timeline/CalendarEventForm";
import { ProgrammingBoard } from "../../components/programming/ProgrammingBoard";
import { CardStars } from "../../components/programming/ProgrammingCard";
import { ProgrammingCalendarView } from "../../components/programming/ProgrammingCalendarView";
import { ProgrammingDetailPanel } from "../../components/programming/ProgrammingDetailPanel";
import type { RoleOption } from "../../components/programming/OwnerPicker";
import { EventFixStep } from "../../components/programming/EventFixStep";
import { EventWrapUp } from "../../components/programming/EventWrapUp";
import { EventsHelp } from "../../components/programming/EventsHelp";
import { NewIdeaComposer } from "../../components/programming/NewIdeaComposer";
import { makeTypeVisuals, typeVisual } from "../../components/programming/typeColor";
import { TimelineStrip } from "../../components/programming/TimelineStrip";
import { UndatedRail } from "../../components/programming/UndatedRail";
import { OnDeckHero } from "../../components/programming/OnDeckHero";
import { attnReason, briefingDigest, whenLabel } from "../../components/programming/eventsCopy";
import { ProgrammingTable } from "../../components/programming/ProgrammingTable";
import { LedgerStrip, Measure } from "../../components/dashboard/ledger/LedgerStrip";
import type { CalEventType, ProgrammingTask, TaskStatus } from "../../data";
import { fmt$, fmtDate } from "../../data";
import type { Doc } from "../docs/lib";
import { useChapter } from "../../context/ChapterContext";
import { requestJson } from "../../lib/api";
import { useActiveSemester } from "../../hooks/useActiveSemester";
import { useSemesterErrorHandler } from "../../hooks/useSemesterErrorHandler";
import { todayStr } from "../../lib/dates";
import { isEventTypeVisibleInPicker } from "@/lib/event-types";
import {
  eventsNeedingAttention,
  eventsTermStats,
  isProgrammingManagedType,
  nextOnDeckEvent,
  missingFor,
  canEnter,
  needsConfirmFirst,
} from "@/lib/programming";
import { STAGES } from "@/lib/state/programming-stage";
import type { ProgrammingStage } from "@/lib/state/programming-stage";
import "./events-ledger.css";
import "../../components/dashboard/dashboard-ledger.css";

type View = "board" | "calendar" | "table";

type ApiPatch = Record<string, unknown>;

type FormInput = {
  title: string; dueDate: string | null; location: string | null; time?: string | null;
  collab?: string | null; category: string; status: TaskStatus; mandatory: boolean;
  description: string | null;
};

/** Map the shared CalendarEventForm draft to the programming API input shape. */
function draftToFormInput(draft: CalendarDraft): FormInput {
  return {
    title:     draft.title,
    dueDate:   draft.date || null,
    location:  draft.location ?? null,
    time:      draft.time ?? null,
    collab:    draft.collab?.trim() || null,
    category:  draft.category,
    status:    "Upcoming",
    mandatory: draft.mandatory,
    description: draft.description ?? null,
  };
}

export default function ProgrammingPage() {
  // brotherList is in ALWAYS_SECTIONS, so the roster the owner picker needs is
  // already loaded for every page — no extra fetch.
  const { currentUser, can, setProgrammingTaskList, brotherList } = useChapter();
  const canManage = can("MANAGE_EVENTS");
  const activeSemester = useActiveSemester();
  const handleSemesterError = useSemesterErrorHandler();
  const searchParams = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [events, setEvents] = useState<ProgrammingTask[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  // Errors go to the app-wide toast stack rather than a page-local banner, so a
  // failure here reads the same as a failure anywhere else in the app.
  const toast = useToast();
  const showError = toast.error;
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  // Category-slug filter; "All" is the sentinel. Chips are derived per-org below.
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [eventTypes, setEventTypes] = useState<CalEventType[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isClosingDrawer, setIsClosingDrawer] = useState(false);
  const [modal, setModal] = useState<"add" | "idea" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ProgrammingTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgrammingTask | null>(null);
  // The blocked-move step: which event, and the lane it was aimed at.
  const [fixTarget, setFixTarget] = useState<{ event: ProgrammingTask; stage: ProgrammingStage } | null>(null);
  // The Confirmed → Done wrap-up.
  const [wrapTarget, setWrapTarget] = useState<ProgrammingTask | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Animate the inspector drawer out before unmounting.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDrawer = useCallback(() => {
    setIsClosingDrawer(true);
    closeTimerRef.current = setTimeout(() => { setSelectedId(null); setIsClosingDrawer(false); }, 280);
  }, []);

  // "?" opens the help overlay from anywhere on the page. Bails on form controls
  // (a literal "?" typed into search must reach the input) and on modifier
  // chords, which belong to the browser.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      setHelpOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Escape key closes the inspector (or modals — Modal component handles its own Escape).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId !== null && modal === null) closeDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, modal, closeDrawer]);

  // Click-outside closes the inspector on desktop (mobile uses the backdrop).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || isClosingDrawer) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeDrawer();
      }
    }
    // Use pointerdown so it fires before any click handlers on the board.
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedId, isClosingDrawer, closeDrawer]);

  useEffect(() => {
    requestJson<ProgrammingTask[]>("/api/programming")
      .then(data => {
        setEvents(data);
        setProgrammingTaskList(data);
      })
      .catch(() => showError("Could not load programming events."))
      .finally(() => setLoading(false));
  }, [setProgrammingTaskList]);

  // Keep a ref to the latest events so syncEvents can compute the next list
  // without nesting setProgrammingTaskList inside setEvents' updater (calling
  // another component's setter from within an updater triggers React's
  // "update a component while rendering a different component" warning, since
  // updaters run during render).
  const eventsRef = useRef<ProgrammingTask[]>(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Resources docs, used to resolve a doc attachment's URL so the table's
  // paperclip can open the doc directly.
  useEffect(() => {
    requestJson<Doc[]>("/api/docs").then(setDocs).catch(() => setDocs([]));
  }, []);

  // The org's event types drive the form's category options and the filter
  // chips — no fixed subset anymore (social/fundy/program are LPE customs).
  useEffect(() => {
    requestJson<CalEventType[]>("/api/calendar/event-types")
      .then(setEventTypes)
      .catch(() => {});
  }, []);

  // Roles, for the owner picker's Role tab. Fetched here rather than through
  // ChapterContext because SECTIONS_BY_PAGE.events is deliberately empty — this
  // page is its own fetcher — and putting roles in ALWAYS_SECTIONS would make
  // every other page pay for a list only this one reads. GET /api/roles carries
  // no permission gate, so a plain member sees the same options an officer does.
  useEffect(() => {
    requestJson<RoleOption[]>("/api/roles").then(setRoles).catch(() => setRoles([]));
  }, []);

  const enabledWorkflows = useMemo(
    () => currentUser?.org?.enabledWorkflows ?? [],
    [currentUser?.org?.enabledWorkflows],
  );
  // Programming-managed types (creatable minus chapter) the org can pick when
  // creating: also workflow-gated + non-hidden, mirroring the timeline picker.
  const programmingFormOptions = useMemo<CategoryOption[]>(
    () => eventTypes
      .filter(t => isProgrammingManagedType(t) && isEventTypeVisibleInPicker(t, enabledWorkflows))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(t => ({ slug: t.slug, label: t.label, color: t.colorDark ?? t.color, mandatoryDefault: t.mandatoryDefault })),
    [eventTypes, enabledWorkflows],
  );
  // slug → colour/glyph for every type the org defines. Built once here and
  // passed down, replacing four label-keyed lookup tables that rendered any
  // renamed or org-defined type grey.
  const typeVisuals = useMemo(() => makeTypeVisuals(eventTypes), [eventTypes]);

  // Filter chips include workflow-off types too — their events still list.
  const typeFilters = useMemo(
    () => eventTypes
      .filter(t => isProgrammingManagedType(t) && !t.hidden)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    [eventTypes],
  );
  // When editing, keep the event's own category selectable even if its type is
  // now hidden or workflow-off (so its chip still shows).
  const editCategoryOptions = useMemo<CategoryOption[]>(() => {
    if (!editTarget || programmingFormOptions.some(o => o.slug === editTarget.category)) return programmingFormOptions;
    const t = eventTypes.find(t => t.slug === editTarget.category);
    return t
      ? [...programmingFormOptions, { slug: t.slug, label: t.label, color: t.colorDark ?? t.color, mandatoryDefault: t.mandatoryDefault }]
      : programmingFormOptions;
  }, [programmingFormOptions, editTarget, eventTypes]);

  const syncEvents = useCallback((updater: (prev: ProgrammingTask[]) => ProgrammingTask[]) => {
    const next = updater(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
    setProgrammingTaskList(next);
  }, [setProgrammingTaskList]);

  const reload = useCallback(() => {
    requestJson<ProgrammingTask[]>("/api/programming").then(data => {
      setEvents(data);
      setProgrammingTaskList(data);
    }).catch(() => {});
  }, [setProgrammingTaskList]);

  const patchEvent = useCallback(async (id: number, patch: ApiPatch) => {
    syncEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } as ProgrammingTask : e));
    // Read-only DTO fields the server RESOLVES rather than accepts: `owner` is a
    // person-or-role object built from the FK pair (set it with ownerBrotherId /
    // ownerRoleId), `ownerNote` is retired migration data, and `type` is the
    // category's display label. PATCHing any of them would 400 on the schema.
    const { owner: _owner, ownerNote: _ownerNote, type: _type, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    try {
      const saved = await requestJson<ProgrammingTask>(`/api/programming/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      syncEvents(prev => prev.map(e => e.id === id ? saved : e));
    } catch (err) {
      handleSemesterError(err, showError, "Could not save changes.");
      reload();
    }
  }, [syncEvents, reload, handleSemesterError, showError]);

  /**
   * Write a stage change, no questions asked.
   *
   * Split out from moveStage so the fix-step and wrap-up modals — which have
   * ALREADY collected what their gate wanted — can complete the move without
   * being intercepted by the same check a second time.
   */
  const commitStage = useCallback(async (id: number, stage: ProgrammingStage): Promise<boolean> => {
    const target = events.find(e => e.id === id);
    if (!target) return false;
    const prevStage = target.stage;
    syncEvents(prev => prev.map(e => e.id === id ? { ...e, stage } : e));
    try {
      const saved = await requestJson<ProgrammingTask>(`/api/programming/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      syncEvents(prev => prev.map(e => e.id === id ? saved : e));
      return true;
    } catch (err) {
      syncEvents(prev => prev.map(e => e.id === id ? { ...e, stage: prevStage } : e));
      // Promotion runs the semester guard server-side: route to setup when no
      // semester is active, surface the out-of-range message otherwise.
      handleSemesterError(err, showError, "Could not move event.");
      return false;
    }
  }, [events, syncEvents, handleSemesterError, showError]);

  /**
   * Move an event to a new stage, enforcing the same gates the server does.
   *
   * Backward moves are always free — parking something is never a mistake the
   * product should argue with. Forward moves either succeed, or open the one
   * step that unblocks them; a bare rejection is never the answer.
   *
   * Returns false when the move was intercepted rather than performed.
   */
  const moveStage = useCallback(async (id: number, stage: ProgrammingStage): Promise<boolean> => {
    const target = events.find(e => e.id === id);
    if (!target) return false;

    const forward = STAGES.indexOf(stage) > STAGES.indexOf(target.stage);

    // Done is the one gate that isn't about fields: an event the chapter never
    // saw cannot be "over". Offer the missing step instead of just refusing.
    if (needsConfirmFirst(target, stage)) {
      toast.info(`“${target.title}” hasn’t been confirmed — the chapter has to have seen it before it can be wrapped.`, {
        action: { label: "Confirm it", onClick: () => { void moveStageRef.current?.(id, "confirmed"); } },
      });
      return false;
    }

    // A blocked forward move opens the step that fixes it, carrying the event
    // and the lane it was aimed at.
    if (forward && !canEnter(target, stage)) {
      setFixTarget({ event: target, stage });
      return false;
    }

    // Done is the only forward move that asks a NEW question rather than
    // collecting a missing one. Nothing is required, but this is the moment
    // anybody still remembers how it went.
    if (stage === "done" && forward) {
      setWrapTarget(target);
      return false;
    }

    return commitStage(id, stage);
  }, [events, commitStage, toast]);

  // The "Confirm it" toast button re-enters moveStage, so it needs a stable
  // handle on the latest closure rather than the one captured when it rendered.
  const moveStageRef = useRef<typeof moveStage | null>(null);
  useEffect(() => { moveStageRef.current = moveStage; }, [moveStage]);

  /**
   * A calendar drop sets the date. It NEVER promotes.
   *
   * Auto-publishing on a drop would put the event in front of the whole chapter
   * as a side effect of a drag aimed at a calendar square, so when the new date
   * happens to complete the Confirmed set we OFFER the promotion instead.
   *
   * A published event is a separate case: `dueDate` is frozen while it's on
   * everyone's timeline, so the only working path is demote-then-set, which is
   * offered as one button rather than performed silently.
   */
  const setDateByDrop = useCallback(async (id: number, date: string) => {
    const target = events.find(e => e.id === id);
    if (!target) return;

    if (target.stage === "confirmed" || target.stage === "done") {
      toast.info(
        `“${target.title}” is on the chapter's timeline for ${target.dueDate ?? "a set date"}. Moving it takes that back first.`,
        {
          action: {
            label: "Move to Planning",
            onClick: () => {
              void (async () => {
                // Sequential: the demote deletes the CalendarEvent, and the
                // date write is only legal once it's gone.
                if (await commitStage(id, "planning")) await patchEvent(id, { dueDate: date });
              })();
            },
          },
        },
      );
      return;
    }

    await patchEvent(id, { dueDate: date });

    // Would this date have been the last thing it needed?
    const candidate = { ...target, dueDate: date };
    if (target.stage === "planning" && canEnter(candidate, "confirmed")) {
      toast.success(`“${target.title}” is penciled in for ${fmtDate(date)}.`, {
        action: { label: "Confirm it", onClick: () => { void moveStageRef.current?.(id, "confirmed"); } },
      });
      return;
    }
    const miss = missingFor(candidate, "confirmed").map(f => f.label.toLowerCase()).join(" + ");
    toast.success(
      miss
        ? `“${target.title}” is penciled in for ${fmtDate(date)} — still needs ${miss}.`
        : `“${target.title}” is penciled in for ${fmtDate(date)}.`,
    );
  }, [events, patchEvent, commitStage, toast]);

  const filtered = useMemo(() => {
    let list = [...events];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (e.collab ?? "").toLowerCase().includes(q),
      );
    }
    if (typeFilter !== "All") list = list.filter(e => e.category === typeFilter);
    return list;
  }, [events, search, typeFilter]);

  // Names the filters actually in force, so the empty result is attributable to
  // something the reader can then clear.
  const noMatchBits = useMemo(() => {
    const bits: string[] = [];
    if (typeFilter !== "All") {
      bits.push(typeFilters.find(t => t.slug === typeFilter)?.label ?? typeFilter);
    }
    if (search.trim()) bits.push(`“${search.trim()}”`);
    return bits.length ? bits.join(" + ") : "this filter";
  }, [typeFilter, typeFilters, search]);

  const selected = events.find(e => e.id === selectedId) ?? null;

  // ── Derived: on-deck hero, glance stats, attention rail, recent recap ──
  const today = todayStr();
  const onDeck = useMemo(() => nextOnDeckEvent(events, today), [events, today]);
  const stats = useMemo(() => eventsTermStats(events, today), [events, today]);
  const attention = useMemo(() => eventsNeedingAttention(events, today).slice(0, 4), [events, today]);
  const recap = useMemo(
    () =>
      events
        .filter(e => e.stage === "done")
        .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""))
        .slice(0, 3),
    [events],
  );

  const orgName = currentUser?.org?.name ?? "ChaptOS";
  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  async function handleAdd(draft: CalendarDraft) {
    const input = draftToFormInput(draft);
    try {
      const created = await requestJson<ProgrammingTask>("/api/programming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      syncEvents(prev => [...prev, created]);
      setSelectedId(created.id);
      setModal(null);
    } catch (err) {
      handleSemesterError(err, showError, "Could not create event.");
    }
  }

  /** The two-field path. Everything else an event can carry is left unset — the
   *  server starts every new task in `idea` regardless, so this needs no stage. */
  async function handleAddIdea({ title, category }: { title: string; category: string }) {
    try {
      const created = await requestJson<ProgrammingTask>("/api/programming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          dueDate: null,
          location: null,
          time: null,
          collab: null,
          status: "Upcoming" as TaskStatus,
          mandatory: false,
          description: null,
        }),
      });
      syncEvents(prev => [...prev, created]);
      setSelectedId(created.id);
      setModal(null);
      toast.success(`“${created.title}” is on the board as an idea.`);
    } catch (err) {
      handleSemesterError(err, showError, "Could not add the idea.");
    }
  }

  async function handleEdit(draft: CalendarDraft) {
    if (!editTarget) return;
    const input = draftToFormInput(draft);
    // `status` is owned by the inspector (Upcoming/Due Soon/Urgent); the unified form
    // doesn't edit it, so don't PATCH it here and clobber an inspector-set value.
    await patchEvent(editTarget.id, {
      title: input.title,
      dueDate: input.dueDate,
      location: input.location,
      time: input.time,
      collab: input.collab,
      category: input.category,
      mandatory: input.mandatory,
      description: input.description,
    });
    setModal(null);
    setEditTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    syncEvents(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await requestJson<void>(`/api/programming/${id}`, { method: "DELETE" });
    } catch {
      showError("Could not delete event.");
      reload();
    }
  }

  function openEdit(e: ProgrammingTask) {
    setEditTarget(e);
    setModal("edit");
  }

  // Open a card in the inspector (toggles closed if it's already the selected one).
  const selectCard = useCallback((id: number) => {
    if (id === selectedId) { closeDrawer(); return; }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsClosingDrawer(false);
    setSelectedId(id);
  }, [selectedId, closeDrawer]);

  // Deep-link: ?open=<id> (e.g. from the Timeline's "Open in Programming" link) opens
  // that event's inspector once the list has loaded. Fires once per id so it doesn't
  // fight the user manually closing the drawer.
  const openedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || loading || openedDeepLinkRef.current === openId) return;
    if (events.some(e => e.id === Number(openId))) {
      openedDeepLinkRef.current = openId;
      selectCard(Number(openId));
    }
  }, [searchParams, loading, events, selectCard]);

  const railOpen = selected || isClosingDrawer;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Programming" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Slim toolbar (mobile hamburger + breadcrumb) ── */}
        <header className="toolbar-frosted dash-toolbar ev-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ev-crumb truncate">Events</span>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-events" data-dashboard-theme="dusk">

            {/* ── Briefing ── */}
            <section className="briefing" aria-label="Events">
              <div>
                <p className="kicker">
                  <span className="today">{dateLabel}</span>
                  &ensp;·&ensp;Events&ensp;·&ensp;{orgName}
                </p>
                <h1 className="greeting">The <em>programme</em>.</h1>
                <div className="digest">
                  <span className="ai-chip">AI</span>
                  {loading
                    ? <p className="digest-loading">Reading the slate…</p>
                    : <p>{briefingDigest(onDeck, attention, today)}</p>}
                </div>
              </div>
              <div className="ev-briefing-actions">
                <button
                  className="ev-help-btn"
                  onClick={() => setHelpOpen(true)}
                  aria-label="How this board works"
                  title="How this board works  (?)"
                >
                  ?
                </button>
                {canManage && (
                  <>
                    {/* The cheap way in. Sits before "New event" because holding a
                        thought should cost less than scheduling one. */}
                    <button className="ev-add ghost" onClick={() => setModal("idea")}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      New idea
                    </button>
                    <button className="ev-add" onClick={() => setModal("add")}>
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      New event
                    </button>
                  </>
                )}
              </div>
            </section>

            {loading ? (
              <>
                <div className="ev-skel glance" />
                <div className="ev-sec" style={{ marginTop: 30 }}><h2>Pipeline</h2><span className="rule" /></div>
                <div className="ev-skel" />
              </>
            ) : (
              <>
                {/* ── Glance strip ── */}
                <LedgerStrip>
                  <Measure
                    label="On the slate"
                    // Live only. Done events are the term's history, not its
                    // slate, and by November they'd swamp the number.
                    value={String(stats.liveTotal)}
                    note={`${stats.byStage.idea} ideas · ${stats.byStage.planning} planning · ${stats.byStage.confirmed} confirmed`}
                  />
                  <Measure
                    label="Next 14 days"
                    value={String(stats.next14)}
                    unit={stats.next14 === 1 ? " event" : " events"}
                    note={stats.next14Unready > 0
                      ? `${stats.next14Unready} can't be confirmed yet`
                      : "all confirmed or ready to be"}
                    noteWarn={stats.next14Unready > 0}
                  />
                  <Measure
                    label="Avg success"
                    value={stats.avgSuccess != null ? stats.avgSuccess.toFixed(1) : "—"}
                    unit={stats.avgSuccess != null ? "/5" : undefined}
                    note={`across ${stats.doneCount} wrapped`}
                  />
                  {/* Replaced "Spent this term": spend is a treasury question
                      and the treasury page answers it properly. What this board
                      is for is noticing the ideas nobody has picked up — the
                      measure the owner gate exists to make visible. */}
                  <Measure
                    label="Unowned ideas"
                    value={String(stats.unownedIdeas)}
                    unit={` of ${stats.ideaCount}`}
                    note={stats.unownedIdeas > 0
                      ? "nobody's picked them up"
                      : stats.ideaCount > 0 ? "every idea has someone" : "no ideas yet"}
                    noteWarn={stats.unownedIdeas > 0}
                  />
                </LedgerStrip>

                <div className="ev-layout">
                  <div className="min-w-0">

                    {/* ── On-deck hero ── */}
                    {onDeck && <OnDeckHero event={onDeck} today={today} onOpen={() => selectCard(onDeck.id)} />}

                    {/* ── Pipeline ── */}
                    <div className="ev-sec">
                      <h2>Pipeline</h2>
                      <span className="rule" />
                      <div className="ev-views">
                        {(["board", "calendar", "table"] as View[]).map(v => (
                          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>
                        ))}
                      </div>
                    </div>

                    <div className="ev-filters">
                      <button className={`chip${typeFilter === "All" ? " on" : ""}`} onClick={() => setTypeFilter("All")}>
                        All
                      </button>
                      {typeFilters.map(t => (
                        <button key={t.slug} className={`chip${typeFilter === t.slug ? " on" : ""}`} onClick={() => setTypeFilter(t.slug)}>
                          {t.label}
                        </button>
                      ))}
                      <span className="grow" />
                      <span className="ev-search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                        <input
                          type="search"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search events…"
                        />
                      </span>
                    </div>

                    {events.length === 0 ? (
                      <div className="ev-empty">
                        <span className="ic">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        </span>
                        <div className="t">No events yet</div>
                        <div className="h">{canManage ? "Add your first event to start the programme." : "Nothing on the slate yet."}</div>
                      </div>
                    ) : filtered.length === 0 ? (
                      // Distinct from the empty state above: the slate isn't
                      // empty, the filters just don't match it. Without this the
                      // board renders four blank lanes and reads as data loss.
                      <div className="ev-nomatch">
                        <p className="nm-t">No events match.</p>
                        <p className="nm-s">
                          Nothing on the slate matches {noMatchBits}. All {events.length}{" "}
                          {events.length === 1 ? "event is" : "events are"} still there.
                        </p>
                        <button className="ev-btn-ghost" onClick={() => { setSearch(""); setTypeFilter("All"); }}>
                          Clear filters
                        </button>
                      </div>
                    ) : view === "board" ? (
                      <ProgrammingBoard
                        tasks={filtered}
                        visuals={typeVisuals}
                        selectedId={selectedId}
                        canManage={canManage}
                        variant="dusk"
                        onSelect={selectCard}
                        onMoveStage={moveStage}
                      />
                    ) : view === "calendar" ? (
                      <ProgrammingCalendarView
                        tasks={filtered}
                        visuals={typeVisuals}
                        selectedId={selectedId}
                        variant="dusk"
                        canManage={canManage}
                        semesterStart={activeSemester?.startDate}
                        semesterEnd={activeSemester?.endDate}
                        onSelect={selectCard}
                        onSetDate={setDateByDrop}
                        renderRail={onDragStart => (
                          <UndatedRail
                            tasks={filtered}
                            visuals={typeVisuals}
                            selectedId={selectedId}
                            draggable={canManage}
                            onSelect={selectCard}
                            onDragStart={onDragStart}
                          />
                        )}
                      />
                    ) : (
                      <ProgrammingTable
                        tasks={filtered}
                        visuals={typeVisuals}
                        docs={docs}
                        selectedId={selectedId}
                        canManage={canManage}
                        onSelect={selectCard}
                        onPatch={patchEvent}
                      />
                    )}

                    {/* The other half of the lanes' promise: three of the four
                        are private, and this is what the chapter actually sees. */}
                    <TimelineStrip tasks={events} visuals={typeVisuals} onSelect={selectCard} />
                  </div>

                  {/* ── Right column: the attention/recap rail (hidden when a card is
                       open; the inspector below takes the same slot on desktop). ── */}
                  {!railOpen && (
                    <aside className="ev-rail">
                      <div>
                        <p className="lbl">Needs attention · before its date</p>
                        <div className="ev-attn">
                          {attention.length === 0 ? (
                            <p className="a-empty">Nothing's waiting on anyone — nice work.</p>
                          ) : attention.map(entry => (
                            <button key={entry.task.id} className="a-row" onClick={() => selectCard(entry.task.id)}>
                              <span className={`a-flag ${entry.tone}`} />
                              <div className="a-main">
                                <div className="a-t">{entry.task.title}</div>
                                <div className={`a-need ${entry.tone}`}>{attnReason(entry)}</div>
                              </div>
                              <span className="a-when">{whenLabel(entry.task.dueDate, today)}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {recap.length > 0 && (
                        <div>
                          <p className="lbl">Recently wrapped</p>
                          <div className="ev-recap">
                            {recap.map(task => (
                              <button key={task.id} className="r-row" onClick={() => selectCard(task.id)}>
                                <div className="r-main">
                                  <div className="r-t">{task.title}</div>
                                  <div className="r-meta">
                                    {task.dueDate ? fmtDate(task.dueDate) : "—"}
                                    {task.spendingCents > 0 ? ` · ${fmt$(task.spendingCents / 100)} spent` : ""}
                                  </div>
                                </div>
                                {/* Same glyph + label rules as the board card:
                                    a dimmed ★ flattens to a full ★ in copied
                                    text and for screen readers. */}
                                <CardStars value={task.successRating} className="r-stars" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </aside>
                  )}

                  {/* ── Inspector: bottom-sheet on mobile, inline column on desktop.
                       One element + one panelRef so click-outside works on both. ── */}
                  {railOpen && (
                    <>
                      {/* Mobile-only dimmed backdrop behind the sheet. */}
                      <div className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-[280ms] xl:hidden ${isClosingDrawer ? "opacity-0" : "opacity-100"}`} />
                      <div
                        ref={panelRef}
                        className={`fixed inset-x-0 bottom-0 top-14 z-50 overflow-hidden rounded-t-2xl border-t border-white/[0.1] transition-[transform,opacity] duration-[280ms] ease-in-out xl:sticky xl:inset-auto xl:bottom-auto xl:top-[37px] xl:mt-[37px] xl:z-auto xl:max-h-[calc(100vh-74px)] xl:overflow-y-auto xl:rounded-none xl:border-0 xl:opacity-100 xl:translate-y-0 ${isClosingDrawer ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
                      >
                        {selected && (
                          <ProgrammingDetailPanel
                            event={selected}
                            canManage={canManage}
                            brothers={brotherList}
                            roles={roles}
                            visual={typeVisual(typeVisuals, selected.category)}
                            onPatch={patchEvent}
                            onStage={moveStage as unknown as (id: number, stage: ProgrammingStage) => Promise<void>}
                            onEdit={() => openEdit(selected)}
                            onDelete={() => setDeleteTarget(selected)}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {modal === "add" && (
        <Modal title="New Event" tone="dusk" onClose={() => setModal(null)}>
          <CalendarEventForm
            submitLabel="Add Event"
            onSubmit={handleAdd}
            categoryOptions={programmingFormOptions}
            showCollab
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
          />
        </Modal>
      )}

      {modal === "idea" && (
        <NewIdeaComposer
          categoryOptions={programmingFormOptions}
          onCancel={() => setModal(null)}
          onCommit={handleAddIdea}
        />
      )}

      {modal === "edit" && editTarget && (
        <Modal title="Edit Event" tone="dusk" onClose={() => { setModal(null); setEditTarget(null); }}>
          <CalendarEventForm
            submitLabel="Save Changes"
            initialEvent={{
              id: editTarget.id,
              title: editTarget.title,
              date: editTarget.dueDate ?? "",
              time: editTarget.time ?? undefined,
              category: editTarget.category,
              mandatory: editTarget.mandatory,
              location: editTarget.location || undefined,
              description: editTarget.description ?? undefined,
            }}
            initialCollab={editTarget.collab}
            onSubmit={handleEdit}
            categoryOptions={editCategoryOptions}
            showCollab
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
          />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          tone="dusk"
          title="Delete this event?"
          message={`"${deleteTarget.title}" will be removed from programming${deleteTarget.dueDate ? " and the timeline" : ""}.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Opens only when a forward move is blocked, and collects everything the
          gate is missing — not just a date, which is what the modal this replaced
          asked for before failing on the server over the location. */}
      {fixTarget && (
        <EventFixStep
          event={fixTarget.event}
          stage={fixTarget.stage}
          brothers={brotherList}
          roles={roles}
          eventTypes={programmingFormOptions}
          onCancel={() => setFixTarget(null)}
          onCommit={async (patch, stage) => {
            const { event } = fixTarget;
            setFixTarget(null);
            // Fields first, then the promotion: the server's gate reads
            // PERSISTED state, so a parallel move would race its own inputs.
            await patchEvent(event.id, patch as ApiPatch);
            // commitStage, not moveStage: the gate that opened this dialog has
            // just been satisfied, and re-running it would re-open the dialog.
            await commitStage(event.id, stage);
          }}
        />
      )}

      {helpOpen && <EventsHelp onClose={() => setHelpOpen(false)} />}

      {wrapTarget && (
        <EventWrapUp
          event={wrapTarget}
          onCancel={() => setWrapTarget(null)}
          onCommit={async patch => {
            const target = wrapTarget;
            setWrapTarget(null);
            // Rating first: successRating and wrapUpNotes are deliberately
            // outside the server's frozen set, so they land on the still-
            // Confirmed event. If the stage move then fails, the rating
            // survives rather than being lost with it.
            await patchEvent(target.id, patch as ApiPatch);
            await commitStage(target.id, "done");
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers + on-deck hero ──────────────────────────────────────────────────
