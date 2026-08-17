"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { inputDuskCls, btnDuskPrimaryCls } from "../../components/dashboard/styles";
import { CalendarEventForm, type CalendarDraft, type CategoryOption } from "../../components/timeline/CalendarEventForm";
import { ProgrammingBoard } from "../../components/programming/ProgrammingBoard";
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
import { statusBits } from "../../components/programming/eventsCopy";
import { LedgerStrip, Measure } from "../../components/dashboard/ledger/LedgerStrip";
import type { CalEventType, ProgrammingTask, TaskStatus } from "../../data";
import { fmtDate } from "../../data";
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

type View = "board" | "calendar";

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
  const [loading, setLoading] = useState(true);
  // Errors go to the app-wide toast stack rather than a page-local banner, so a
  // failure here reads the same as a failure anywhere else in the app.
  const toast = useToast();
  const showError = toast.error;
  const [view, setView] = useState<View>("board");
  const [search, setSearch] = useState("");
  // Category-slug filter. A SET, not one slug with an "All" sentinel: "show me
  // socials and fundraisers" is the question a chapter actually asks of a slate,
  // and an empty set already means all — so the All chip was a control whose only
  // job was undoing the single-select limitation next to it.
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
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
    if (typeFilter.size) list = list.filter(e => typeFilter.has(e.category));
    return list;
  }, [events, search, typeFilter]);

  // Names the filters actually in force, so the empty result is attributable to
  // something the reader can then clear.
  const noMatchBits = useMemo(() => {
    const bits: string[] = [];
    if (typeFilter.size) {
      bits.push(
        [...typeFilter]
          .map(slug => typeFilters.find(t => t.slug === slug)?.label ?? slug)
          .join(" or "),
      );
    }
    if (search.trim()) bits.push(`“${search.trim()}”`);
    return bits.length ? bits.join(" + ") : "this filter";
  }, [typeFilter, typeFilters, search]);

  /** Toggle a type chip. An empty set means every type, so this never empties to
   *  a state that shows nothing. */
  const toggleType = useCallback((slug: string) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }, []);

  const selected = events.find(e => e.id === selectedId) ?? null;

  // ── Derived: glance stats and the status line ──
  const today = todayStr();
  const onDeck = useMemo(() => nextOnDeckEvent(events, today), [events, today]);
  const stats = useMemo(() => eventsTermStats(events, today), [events, today]);
  // Planning events with nothing left to collect. This is the status line's one
  // genuinely actionable count — the events a click away from being public.
  const readyToConfirm = useMemo(
    () => events.filter(e => e.stage === "planning" && canEnter(e, "confirmed")).length,
    [events],
  );
  const status = useMemo(
    () => statusBits(onDeck, readyToConfirm, stats.unownedIdeas, today),
    [onDeck, readyToConfirm, stats.unownedIdeas, today],
  );

  // The kicker's second half. The active term is the more useful of the two —
  // the org's name is already at the top of the sidebar — so it leads, and the
  // org name only stands in when no semester is active.
  const termLabel = activeSemester?.label ?? currentUser?.org?.name ?? "ChaptOS";
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

  // The drawer stays mounted through its slide-out so the animation can run.
  const panelOpen = selected || isClosingDrawer;

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
                  &ensp;·&ensp;{termLabel}
                </p>
                <h1 className="greeting">The <em>programme</em>.</h1>
                {/* Three derived clauses, not a digest paragraph. Each one names a
                    count the board's gates make actionable, so the line reads as
                    a short to-do rather than a summary of what you can already
                    see below it. */}
                <p className="status-line">
                  {loading ? (
                    <span className="status-loading">Reading the slate…</span>
                  ) : status.lead || status.bits.length ? (
                    <>
                      {status.lead && (
                        <>
                          <b>{status.lead.title}</b> is next — {status.lead.when}.
                        </>
                      )}
                      {status.bits.map(bit => (
                        <span key={bit.text} className={bit.tone === "warn" ? "warn" : undefined}>
                          {" "}{bit.text}
                        </span>
                      ))}
                    </>
                  ) : (
                    "Nothing scheduled."
                  )}
                </p>
              </div>
              <div className="ev-briefing-actions">
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
                {/* Last, and glyph-only: it sits with the actions because that's
                    where you look when you don't know what to do next, but it
                    isn't one of them. */}
                <button
                  className="ev-help-btn"
                  onClick={() => setHelpOpen(true)}
                  aria-label="How this board works"
                  title="How this board works  (?)"
                >
                  ?
                </button>
              </div>
            </section>

            {loading ? (
              <>
                <div className="ev-skel glance" />
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
                  {/* Replaced "Spent this term": spend is a treasury question
                      and the treasury page answers it properly. What this board
                      is for is noticing the ideas nobody has picked up — the
                      measure the owner gate exists to make visible. Third rather
                      than last, because it's the one measure here you can act on
                      today. */}
                  <Measure
                    label="Unowned ideas"
                    value={String(stats.unownedIdeas)}
                    unit={` of ${stats.ideaCount}`}
                    note={stats.unownedIdeas > 0
                      ? "nobody's picked them up"
                      : stats.ideaCount > 0 ? "every idea has someone" : "no ideas yet"}
                    noteWarn={stats.unownedIdeas > 0}
                    noteGood={stats.unownedIdeas === 0 && stats.ideaCount > 0}
                  />
                  {/* Averaged over the events that were RATED, not every wrapped
                      one — the wrap-up's rating is optional, and counting the
                      unrated ones in the denominator's label would overstate what
                      the number is built from. */}
                  <Measure
                    label="Average stars"
                    value={stats.avgSuccess != null ? stats.avgSuccess.toFixed(1) : "—"}
                    unit={stats.avgSuccess != null ? " / 5" : undefined}
                    note={stats.ratedCount > 0
                      ? `${stats.ratedCount} event${stats.ratedCount === 1 ? "" : "s"} rated`
                      : "nothing rated yet"}
                  />
                </LedgerStrip>

                {/* ── Toolbar: the two views, the type chips, and search, on one
                     line. No "Pipeline" heading above it — the board underneath
                     is the only thing on the page, so naming it spends a row
                     titling the obvious. ── */}
                <div className="ev-toolbar">
                  <div className="ev-views">
                    {(["board", "calendar"] as View[]).map(v => (
                      <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>
                    ))}
                  </div>
                  {typeFilters.map(t => {
                    const on = typeFilter.has(t.slug);
                    const hex = typeVisual(typeVisuals, t.slug).hex;
                    return (
                      <button
                        key={t.slug}
                        className={`chip${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleType(t.slug)}
                        style={on ? { color: hex, borderColor: `${hex}80` } : undefined}
                      >
                        <span className="cdot" style={{ background: hex }} />
                        {t.label}
                      </button>
                    );
                  })}
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
                  // Distinct from the empty state above: the slate isn't empty,
                  // the filters just don't match it. Without this the board
                  // renders four blank lanes and reads as data loss.
                  <div className="ev-nomatch">
                    <p className="nm-t">No events match.</p>
                    <p className="nm-s">
                      Nothing on the slate matches {noMatchBits}. All {events.length}{" "}
                      {events.length === 1 ? "event is" : "events are"} still there.
                    </p>
                    <button className="ev-btn-ghost" onClick={() => { setSearch(""); setTypeFilter(new Set()); }}>
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
                ) : (
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
                )}

                {/* The other half of the lanes' promise: three of the four
                    are private, and this is what the chapter actually sees. */}
                <TimelineStrip tasks={events} visuals={typeVisuals} onSelect={selectCard} />
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Inspector. A fixed right-hand drawer over the board, not a column
           beside it: with the rail gone the board takes the full width, and a
           grid slot that only exists while a card is open would reflow all four
           lanes on every open and close. Deliberately NOT aria-modal — the board
           behind it stays live and clickable, so you can open another card
           straight from it, and claiming modality would lie about what's
           reachable. On mobile it's a bottom sheet with a dimmed backdrop. ── */}
      {panelOpen && (
        <>
          <div className={`ev-panel-scrim${isClosingDrawer ? " closing" : ""}`} aria-hidden />
          <aside
            ref={panelRef}
            className={`ev-panel${isClosingDrawer ? "" : " open"}`}
            role="dialog"
            aria-label="Event details"
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
                onClose={closeDrawer}
              />
            )}
          </aside>
        </>
      )}

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
