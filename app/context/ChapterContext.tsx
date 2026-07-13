"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Brother, Task, Poll, InstagramTask, ProgrammingTask, PartyEvent, ActivityEntry, Transaction, Reimbursement,
} from "../data";
import { AVATAR_CHANGED_EVENT, parseAvatarFromMetadata } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import { hasDevImpersonationCookie } from "@/lib/auth/dev-bypass";
import { hasPermission, type Permission } from "@/lib/permissions";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
import type { CustomMemberFieldDef } from "@/lib/custom-member-fields";
import { orgFetch } from "../lib/api";
import { isDashboardRoute } from "../lib/routes";

function normalizeCurrentUser(me: CurrentUser): CurrentUser {
  return {
    ...me,
    avatarUrl: me.avatarUrl ?? null,
    hasCustomAvatar: me.hasCustomAvatar ?? false,
    permissions: me.permissions ?? 0,
    // Server serializes super-admin's Infinity maxRank as `null` (JSON-safe);
    // normalize it back to Infinity here so the `can()` helper and any
    // hierarchy-aware UI can treat super-admins uniformly with role-holders.
    maxRank: me.maxRank == null ? Number.POSITIVE_INFINITY : me.maxRank,
    roles: me.roles ?? [],
    // Defensive: an older/cached /me payload may omit enabledWorkflows. Default
    // to an empty array so the sidebar filter never reads `.includes` of
    // undefined — the Sidebar treats the always-on surfaces as visible regardless.
    org: me.org ? { ...me.org, logoUrl: me.org.logoUrl ?? null, enabledWorkflows: me.org.enabledWorkflows ?? [], vocabularyOverrides: me.org.vocabularyOverrides ?? {}, thresholds: me.org.thresholds ?? DEFAULT_THRESHOLDS, disabledFeatures: me.org.disabledFeatures ?? {}, customMemberFields: me.org.customMemberFields ?? [], navOrder: me.org.navOrder ?? [], metricDefinitionCount: me.org.metricDefinitionCount ?? 0, onboardingComplete: me.org.onboardingComplete ?? true } : null,
  };
}

interface TreasuryData {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
}

interface CurrentUserRole {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
}

export interface MembershipSummary {
  id: number;
  organizationId: number;
  isOrgAdmin: boolean;
  orgName: string;
  orgSlug: string;
  /** Display name in THIS org, or null when it falls back to the account name.
   *  Mirrors MembershipSummary in lib/auth/require-user.ts. */
  name: string | null;
}

export interface CurrentUser {
  id: number;
  name: string;
  role: string;
  email: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
  /** Effective bitfield = OR of every assigned role's permissions. Super-admins
   *  report `~0 >>> 0` (every bit set). */
  permissions: number;
  /** Highest assigned role's rank. Super-admins report Infinity (server emits
   *  `null` on the wire — normalized back to Infinity client-side). */
  maxRank: number;
  /** Roles assigned to this user. Empty for super-admins who haven't been
   *  given any actual role assignments. */
  roles: CurrentUserRole[];
  /** Current active org (resolved by active_org_id cookie or default).
   *  `enabledWorkflows` drives which sidebar surfaces render — see Sidebar.tsx.
   *  `logoUrl` is the org profile picture (null → gradient initials badge).
   *  `vocabularyOverrides` is a sparse map of canonical-term substitutions —
   *  read via useVocab() rather than directly.
   *  `thresholds` is the org's complete (resolved) member-status cutoff set —
   *  read via useThresholds() rather than directly.
   *  `disabledFeatures` is the OPT-OUT map of hidden page sections (workflow id →
   *  feature ids) — read via useFeature() rather than directly. */
  org: { name: string; slug: string; orgType: string | null; logoUrl: string | null; enabledWorkflows: string[]; vocabularyOverrides: Record<string, string>; thresholds: Thresholds; disabledFeatures: Record<string, string[]>; customMemberFields: CustomMemberFieldDef[]; navOrder: string[]; metricDefinitionCount: number; onboardingComplete: boolean } | null;
  orgId: number;
  /** All orgs this user belongs to. UI renders a switcher when length > 1. */
  memberships: MembershipSummary[];
}

interface ChapterContextValue {
  currentUser: CurrentUser | null;
  avatarRevision: number;
  setAvatarUrl: (avatarUrl: string | null, hasCustomAvatar?: boolean) => void;
  /** Returns true when the current user holds the given permission (super-admins
   *  always return true). Returns false when there is no signed-in user. UI use
   *  only — server-side guards are authoritative. */
  can: (perm: Permission) => boolean;
  brotherList: Brother[];
  setBrotherList: React.Dispatch<React.SetStateAction<Brother[]>>;
  taskList: Task[];
  setTaskList: React.Dispatch<React.SetStateAction<Task[]>>;
  pollList: Poll[];
  setPollList: React.Dispatch<React.SetStateAction<Poll[]>>;
  igTaskList: InstagramTask[];
  setIgTaskList: React.Dispatch<React.SetStateAction<InstagramTask[]>>;
  programmingTaskList: ProgrammingTask[];
  setProgrammingTaskList: React.Dispatch<React.SetStateAction<ProgrammingTask[]>>;
  partyList: PartyEvent[];
  setPartyList: React.Dispatch<React.SetStateAction<PartyEvent[]>>;
  activityFeed: ActivityEntry[];
  setActivityFeed: React.Dispatch<React.SetStateAction<ActivityEntry[]>>;
  treasuryData: TreasuryData | null;
  setTreasuryData: React.Dispatch<React.SetStateAction<TreasuryData | null>>;
  transactionList: Transaction[];
  setTransactionList: React.Dispatch<React.SetStateAction<Transaction[]>>;
  reimbursementList: Reimbursement[];
  setReimbursementList: React.Dispatch<React.SetStateAction<Reimbursement[]>>;
  isLoading: boolean;
  loadError: string | null;
  /**
   * Per-section load errors. Populated when a single endpoint fails during
   * `refreshChapterData()` while the rest succeed. UI can flag the failed
   * section with a localized retry instead of blanking the whole dashboard.
   * Empty set when everything loaded. Key = the endpoint slug below.
   */
  sectionErrors: ReadonlySet<ChapterSection>;
  mutationError: string | null;
  setMutationError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshChapterData: () => Promise<void>;
  /**
   * Patch the active org's `disabledFeatures` in local state without a refetch.
   * For optimistic show/hide of dashboard widgets — update locally, PATCH in the
   * background, roll back on failure. No-op if there's no active org.
   */
  setDisabledFeaturesLocal: (disabledFeatures: Record<string, string[]>) => void;
  setNavOrderLocal: (navOrder: string[]) => void;
  hasLoaded: boolean;
}

type ChapterSection =
  | "me"
  | "brothers"
  | "deadlines"
  | "instagram"
  | "programming"
  | "parties"
  | "activity"
  | "treasury"
  | "transactions"
  | "reimbursements"
  | "polls";

const ChapterContext = createContext<ChapterContextValue | null>(null);


/**
 * Marker on errors thrown by fetchJson for an aborted/timed-out request (vs. a
 * real HTTP failure). These are transient — a slow first Turbopack compile, an
 * HMR reload, or a momentary network drop — and recover on the next refresh, so
 * callers downgrade them from console.error (which trips Next's dev error
 * overlay) to a warning rather than treating them as a code regression.
 */
const TRANSIENT_FETCH_ERROR = Symbol.for("figurints.transientFetchError");

function isTransientFetchError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[TRANSIENT_FETCH_ERROR] === true;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  // Bootstrap fan-out can run while Turbopack is compiling — allow a generous
  // timeout so a slow first compile doesn't abort with a raw fetch TypeError.
  let response: Response;
  try {
    response = await orgFetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    // Network drop / timeout / dev HMR — surface as a normal Error so callers'
    // catch + allSettled paths handle it without an uncaught TypeError from fetch().
    const reason = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`${url} unreachable: ${reason}`);
    // AbortSignal.timeout() rejects with a TimeoutError DOMException; a user/HMR
    // abort gives an AbortError. Both are transient — tag them so callers can
    // tell them apart from a genuine failure.
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      (wrapped as unknown as Record<symbol, unknown>)[TRANSIENT_FETCH_ERROR] = true;
    }
    throw wrapped;
  }
  // 401 is the normal "no session" path — return null so callers can handle it
  // without throwing (avoids spurious console errors in browser devtools).
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  try {
    return await (response.json() as Promise<T>);
  } catch {
    throw new Error(`${url} returned non-JSON response`);
  }
}

export function ChapterProvider({ children }: { children: React.ReactNode }) {
  const [brotherList,      setBrotherList]      = useState<Brother[]>([]);
  const [taskList,         setTaskList]         = useState<Task[]>([]);
  const [pollList,         setPollList]         = useState<Poll[]>([]);
  const [igTaskList,       setIgTaskList]       = useState<InstagramTask[]>([]);
  const [programmingTaskList, setProgrammingTaskList] = useState<ProgrammingTask[]>([]);
  const [partyList,        setPartyList]        = useState<PartyEvent[]>([]);
  const [activityFeed,     setActivityFeed]     = useState<ActivityEntry[]>([]);
  const [treasuryData,     setTreasuryData]     = useState<TreasuryData | null>(null);
  const [transactionList,  setTransactionList]  = useState<Transaction[]>([]);
  const [reimbursementList, setReimbursementList] = useState<Reimbursement[]>([]);
  const [currentUser,      setCurrentUser]      = useState<CurrentUser | null>(null);
  const [avatarRevision,   setAvatarRevision]   = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<ReadonlySet<ChapterSection>>(() => new Set());
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Race guard: only the most recently *started* refresh is allowed to write state.
  // Older in-flight refreshes that resolve later are ignored, preventing stale overwrites.
  const refreshIdRef = useRef(0);

  const setAvatarUrl = useCallback((avatarUrl: string | null, hasCustomAvatar = false) => {
    setCurrentUser(prev => {
      if (prev) {
        setBrotherList(bl => bl.map(b => (b.id === prev.id ? { ...b, avatarUrl } : b)));
        return { ...prev, avatarUrl, hasCustomAvatar };
      }
      return prev;
    });
    setAvatarRevision(r => r + 1);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { avatarUrl, hasCustomAvatar } }),
      );
    }
  }, []);

  useEffect(() => {
    function onAvatarChanged(e: Event) {
      const { avatarUrl, hasCustomAvatar } = (e as CustomEvent<{ avatarUrl: string | null; hasCustomAvatar: boolean }>).detail;
      setCurrentUser(prev => (prev ? { ...prev, avatarUrl, hasCustomAvatar } : prev));
      setAvatarRevision(r => r + 1);
    }
    window.addEventListener(AVATAR_CHANGED_EVENT, onAvatarChanged);
    return () => window.removeEventListener(AVATAR_CHANGED_EVENT, onAvatarChanged);
  }, []);

  // Patch the active org's disabledFeatures in local state only — no network.
  // Lets callers update the hidden-section map optimistically (the widget shows/
  // hides on the next render) and fire the PATCH in the background, instead of
  // waiting on a full refreshChapterData() round-trip + 8-endpoint refetch.
  // Mirrors setAvatarUrl's targeted setCurrentUser patch.
  const setDisabledFeaturesLocal = useCallback((disabledFeatures: Record<string, string[]>) => {
    setCurrentUser(prev => (prev?.org ? { ...prev, org: { ...prev.org, disabledFeatures } } : prev));
  }, []);

  // Patch the active org's navOrder in local state only — no network. Lets the
  // sidebar reorder pages optimistically on drop (the new order paints
  // immediately) while the PATCH persists in the background. Mirrors
  // setDisabledFeaturesLocal's targeted setCurrentUser patch.
  const setNavOrderLocal = useCallback((navOrder: string[]) => {
    setCurrentUser(prev => (prev?.org ? { ...prev, org: { ...prev.org, navOrder } } : prev));
  }, []);

  const refreshChapterData = useCallback(async () => {
    const myId = ++refreshIdRef.current;
    const isLatest = () => refreshIdRef.current === myId;

    setIsLoading(true);
    setLoadError(null);
    setSectionErrors(new Set());

    // The org-scoped fan-out below only makes sense inside an org dashboard
    // (/[slug]/…). On platform/auth routes (/welcome, /create, /login,
    // /pending-access, …) there's no org slug in the URL, so these reads would
    // resolve to a non-membership org context and 403. A signed-in but
    // already-onboarded user can legitimately sit on /create (founding
    // another org), so we skip the section fetches there rather than firing a
    // wall of doomed 403s. The route check only needs the URL, so it happens
    // up front — letting the fan-out start in PARALLEL with /api/auth/me
    // instead of waterfalling behind it (saves a full round-trip per load).
    const onDashboard = typeof window !== "undefined" && isDashboardRoute(window.location.pathname);

    // Each endpoint loads independently. A failure in one section (e.g. treasury)
    // marks that section as errored but lets the rest of the dashboard render.
    // Auth failure is the one exception — if /api/auth/me fails, we abort the
    // whole refresh (section results are discarded) because the rest of the
    // data is meaningless without a user.
    const mePromise = fetchJson<CurrentUser>("/api/auth/me")
      .then(value => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error }));

    // Fan out alongside /me. allSettled so one slow/broken endpoint doesn't
    // blank the dashboard — see audit finding D4 / backend E3.
    const sectionsPromise = onDashboard
      ? Promise.allSettled([
          fetchJson<Brother[]>("/api/brothers"),
          fetchJson<Task[]>("/api/tasks"),
          fetchJson<InstagramTask[]>("/api/instagram"),
          fetchJson<ProgrammingTask[]>("/api/programming"),
          fetchJson<PartyEvent[]>("/api/parties"),
          fetchJson<ActivityEntry[]>("/api/activity"),
          fetchJson<TreasuryData>("/api/treasury"),
          fetchJson<Transaction[]>("/api/transactions"),
          fetchJson<Reimbursement[]>("/api/reimbursements"),
          fetchJson<Poll[]>("/api/polls"),
        ])
      : null;

    const meResult = await mePromise;

    if (!isLatest()) return;

    // null = 401 (no session) — silent no-op, not an error.
    if (meResult.ok && meResult.value === null) {
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    if (!meResult.ok) {
      console.error("[ChapterContext] /api/auth/me failed:", meResult.error);
      setLoadError("Could not load your account. Please refresh.");
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    const me = normalizeCurrentUser(meResult.value as CurrentUser);
    setCurrentUser(me);
    setAvatarRevision(r => r + 1);

    if (!sectionsPromise) {
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    const [brothers, deadlines, instagram, programming, parties, activity, treasury, transactions, reimbursements, polls] = await sectionsPromise;

    if (!isLatest()) return;

    const failed = new Set<ChapterSection>();
    const trackFailure = (section: ChapterSection, result: PromiseSettledResult<unknown>) => {
      if (result.status === "rejected") {
        failed.add(section);
        // A transient abort/timeout (slow first compile, HMR, brief network drop)
        // recovers on the next refresh — warn rather than error so it doesn't trip
        // the dev error overlay or read as a code regression. Real failures still
        // log at console.error.
        if (isTransientFetchError(result.reason)) {
          console.warn(`[ChapterContext] ${section} fetch timed out (transient):`, result.reason);
        } else {
          console.error(`[ChapterContext] ${section} fetch failed:`, result.reason);
        }
      }
    };

    if (brothers.status === "fulfilled")     setBrotherList(brothers.value ?? []);
    else                                     trackFailure("brothers", brothers);

    if (deadlines.status === "fulfilled")    setTaskList(deadlines.value ?? []);
    else                                     trackFailure("deadlines", deadlines);

    if (polls.status === "fulfilled")        setPollList(polls.value ?? []);
    else                                     trackFailure("polls", polls);

    if (instagram.status === "fulfilled")    setIgTaskList(instagram.value ?? []);
    else                                     trackFailure("instagram", instagram);

    if (programming.status === "fulfilled")  setProgrammingTaskList(programming.value ?? []);
    else                                     trackFailure("programming", programming);

    if (parties.status === "fulfilled") {
      setPartyList((parties.value ?? []).map(p => ({
        ...p,
        partyType:   (p.partyType   ?? "Open") as "Open" | "Closed",
        theme:       p.theme        ?? "",
        collabOrg:   p.collabOrg    ?? "",
        doorRevenue: p.doorRevenue  ?? 0,
        attendance:  p.attendance   ?? 0,
        expenses:    p.expenses     ?? 0,
        notes:       p.notes        ?? "",
        completed:   p.completed    ?? false,
        completedAt: p.completedAt  ?? null,
      })));
    } else {
      trackFailure("parties", parties);
    }

    if (activity.status === "fulfilled")     setActivityFeed(activity.value ?? []);
    else                                     trackFailure("activity", activity);

    if (treasury.status === "fulfilled")     setTreasuryData(treasury.value);
    else                                     trackFailure("treasury", treasury);

    if (transactions.status === "fulfilled") setTransactionList(transactions.value ?? []);
    else                                     trackFailure("transactions", transactions);

    if (reimbursements.status === "fulfilled") setReimbursementList(reimbursements.value ?? []);
    else                                       trackFailure("reimbursements", reimbursements);

    setSectionErrors(failed);
    setIsLoading(false);
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    // Dev-only screenshot bypass: there's no client-side Supabase session, so
    // getUser() would return null and skip the load. The impersonation cookie
    // stands in for the session — load directly. (Inert in prod; the cookie is
    // only ever set by the local screenshot tool. See lib/auth/dev-bypass.ts.)
    if (hasDevImpersonationCookie()) {
      refreshChapterData().catch(() => undefined);
      return;
    }
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        refreshChapterData().catch(() => undefined);
      } else {
        setIsLoading(false);
      }
    });
  }, [refreshChapterData]);

  // Keep avatar in sync with Supabase session (covers stale /api/auth/me and cross-page nav).
  // IMPORTANT: never let session metadata clobber a custom avatar. Supabase re-syncs
  // Google's OAuth claims into user_metadata.avatar_url on TOKEN_REFRESHED / re-login,
  // reverting it to the Google picture. The source of truth for a custom photo is the
  // persisted Brother.avatarUrl (served by /api/auth/me), so we only adopt the session's
  // avatar when it is itself a custom one, or when we don't yet have any avatar.
  useEffect(() => {
    if (!hasLoaded) return;
    const supabase = createClient();
    const applyFromMetadata = (meta: Record<string, unknown> | undefined) => {
      const { avatarUrl, hasCustomAvatar } = parseAvatarFromMetadata(meta);
      setCurrentUser(prev => {
        if (!prev) return prev;
        // Skip when the session reports a non-custom avatar but we already hold one —
        // that's the OAuth re-sync trying to overwrite the user's custom photo.
        if (!hasCustomAvatar && prev.avatarUrl) return prev;
        if (prev.avatarUrl === avatarUrl && prev.hasCustomAvatar === hasCustomAvatar) return prev;
        setBrotherList(bl => bl.map(b => (b.id === prev.id ? { ...b, avatarUrl } : b)));
        return { ...prev, avatarUrl, hasCustomAvatar };
      });
      setAvatarRevision(r => r + 1);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      applyFromMetadata(session.user.user_metadata);
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) applyFromMetadata(user.user_metadata);
    });
    return () => subscription.unsubscribe();
  }, [hasLoaded]);

  // `can` reads from currentUser at call time via a closure over the latest
  // permissions snapshot. Stable identity per render so it's safe to put in
  // the memo dep list without re-creating the whole context value every tick.
  const can = useCallback(
    (perm: Permission) => (currentUser ? hasPermission(currentUser.permissions, perm) : false),
    [currentUser],
  );

  const value = useMemo(() => ({
    currentUser,
    avatarRevision,
    setAvatarUrl,
    can,
    brotherList, setBrotherList,
    taskList, setTaskList,
    pollList, setPollList,
    igTaskList, setIgTaskList,
    programmingTaskList, setProgrammingTaskList,
    partyList, setPartyList,
    activityFeed, setActivityFeed,
    treasuryData, setTreasuryData,
    transactionList, setTransactionList,
    reimbursementList, setReimbursementList,
    isLoading, loadError, sectionErrors,
    mutationError, setMutationError,
    refreshChapterData, hasLoaded,
    setDisabledFeaturesLocal,
    setNavOrderLocal,
  }), [
    currentUser,
    avatarRevision,
    setAvatarUrl,
    can,
    brotherList, taskList, pollList, igTaskList, programmingTaskList, partyList,
    activityFeed, treasuryData, transactionList, reimbursementList,
    isLoading, loadError, sectionErrors, mutationError, hasLoaded,
    refreshChapterData,
    setDisabledFeaturesLocal,
    setNavOrderLocal,
  ]);

  return (
    <ChapterContext.Provider value={value}>
      {children}
    </ChapterContext.Provider>
  );
}

export function useChapter(): ChapterContextValue {
  const ctx = useContext(ChapterContext);
  if (!ctx) throw new Error("useChapter must be used inside ChapterProvider");
  return ctx;
}
