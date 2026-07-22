"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  /**
   * Sections that have actually been fetched for this session. Only the data a
   * route needs is loaded (see SECTIONS_BY_PAGE), so an empty list here can mean
   * "not loaded yet" rather than "genuinely empty" — consult this before treating
   * one as authoritative.
   */
  loadedSections: ReadonlySet<DataSection>;
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
  /**
   * Patch the signed-in user's own display name in local state without a refetch.
   * Call it when a roster edit renames the actor themselves, so the greeting and
   * sidebar profile follow immediately instead of waiting for a reload.
   */
  setSelfNameLocal: (name: string) => void;
  hasLoaded: boolean;
}

/**
 * Sections the bootstrap fan-out can load. Note there is deliberately no
 * "programming" entry: `programmingTaskList` has no readers anywhere — the
 * events page both fetches /api/programming itself and is its only writer — so
 * bootstrapping it was a wasted request on every single page load (and the
 * slowest one in the fan-out). The state stays in the context because the
 * events page writes through `setProgrammingTaskList`.
 */
type ChapterSection =
  | "me"
  | "brothers"
  | "deadlines"
  | "instagram"
  | "parties"
  | "activity"
  | "treasury"
  | "transactions"
  | "reimbursements"
  | "polls";

/** The sections that are actually fetched. "me" is handled separately (it always loads). */
type DataSection = Exclude<ChapterSection, "me">;

const ALL_DATA_SECTIONS: readonly DataSection[] = [
  "brothers", "deadlines", "instagram", "parties",
  "activity", "treasury", "transactions", "reimbursements", "polls",
];

/**
 * Sections loaded on EVERY dashboard route, regardless of the manifest below.
 *
 * `brothers` is here deliberately. It's the one list read from shared chrome
 * rather than from a single page (SetupChecklist, and the roster lookups several
 * pages do on mount), and it is cheap relative to the risk of a page rendering an
 * empty roster. Keeping it always-on is the conservative choice.
 */
const ALWAYS_SECTIONS: readonly DataSection[] = ["brothers"];

/**
 * Which sections each dashboard page actually READS from this context, keyed by
 * the path segment after the org slug ("" = the dashboard index).
 *
 * Derived by auditing every `useChapter()` destructuring under app/ — note it is
 * *reads* that matter: a page that only takes a setter (e.g. /events takes
 * `setProgrammingTaskList`, the dashboard takes `setTransactionList`) fetches
 * that data itself and does not need it bootstrapped.
 *
 * Before this existed, every page loaded all nine sections, so opening /docs
 * fetched the roster, tasks, polls, parties, activity, treasury, transactions and
 * reimbursements to render a page that reads none of them.
 *
 * A segment that is NOT listed here falls back to loading everything — a new page
 * added later is slow until it's added below, never blank.
 */
const SECTIONS_BY_PAGE: Record<string, readonly DataSection[]> = {
  "":         ["deadlines", "instagram", "parties", "activity", "treasury", "reimbursements"],
  brothers:   [],
  chapter:    [],
  service:    [],
  docs:       [],
  events:     [],
  onboarding: [],
  instagram:  ["instagram"],
  parties:    ["parties"],
  tasks:      ["deadlines", "polls"],
  // GeneralSection reads igTaskList alongside the page's own brothers/tasks/parties.
  settings:   ["deadlines", "parties", "instagram"],
  timeline:   ["deadlines", "parties", "instagram"],
  treasury:   ["parties", "transactions", "treasury", "reimbursements"],
};

/**
 * Sections needed to render `pathname`. Empty on non-dashboard routes (/login,
 * /welcome, /create, …) — there's no org in the URL there, so these org-scoped
 * reads would resolve against a non-membership context and 403.
 */
function sectionsForPath(pathname: string | null): readonly DataSection[] {
  if (!pathname || !isDashboardRoute(pathname)) return [];
  const segment = pathname.split("/")[2] ?? "";
  const page = SECTIONS_BY_PAGE[segment];
  if (!page) return ALL_DATA_SECTIONS;
  return [...new Set([...ALWAYS_SECTIONS, ...page])];
}

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
  const pathname = usePathname();
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

  // Which sections have data. Kept in a ref as well as state because the
  // route-change effect below has to read the CURRENT set synchronously — a state
  // snapshot captured in a closure would re-request sections already in flight.
  const loadedSectionsRef = useRef<ReadonlySet<DataSection>>(new Set());
  const [loadedSections, setLoadedSections] = useState<ReadonlySet<DataSection>>(loadedSectionsRef.current);

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

  // Patch the signed-in user's OWN display name in local state only — no network.
  // Renaming yourself on the roster PATCHes /api/brothers/:id, which updates
  // brotherList; but the dashboard greeting and the sidebar profile read
  // currentUser.name, which is only ever populated from /api/auth/me at load. So
  // without this the app kept greeting you by your old name until a hard reload.
  // A name is org-local (Membership.name), so the active membership entry — the
  // one the org switcher renders — is patched alongside it.
  // Mirrors setNavOrderLocal's targeted setCurrentUser patch.
  const setSelfNameLocal = useCallback((name: string) => {
    setCurrentUser(prev => (prev
      ? {
          ...prev,
          name,
          memberships: prev.memberships.map(m => (m.organizationId === prev.orgId ? { ...m, name } : m)),
        }
      : prev));
  }, []);

  /**
   * One fetch+apply pair per section. Each loader resolves to a `commit` thunk so
   * the network work can all start in parallel and the state writes still happen
   * together, after the race guard has confirmed this refresh is still the latest.
   *
   * `useState` setters are stable, so this map never needs to be rebuilt.
   */
  const sectionLoaders = useMemo<Record<DataSection, () => Promise<() => void>>>(() => ({
    brothers: async () => {
      const v = await fetchJson<Brother[]>("/api/brothers");
      return () => setBrotherList(v ?? []);
    },
    deadlines: async () => {
      const v = await fetchJson<Task[]>("/api/tasks");
      return () => setTaskList(v ?? []);
    },
    polls: async () => {
      const v = await fetchJson<Poll[]>("/api/polls");
      return () => setPollList(v ?? []);
    },
    instagram: async () => {
      const v = await fetchJson<InstagramTask[]>("/api/instagram");
      return () => setIgTaskList(v ?? []);
    },
    parties: async () => {
      const v = await fetchJson<PartyEvent[]>("/api/parties");
      return () => setPartyList((v ?? []).map(p => ({
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
    },
    activity: async () => {
      const v = await fetchJson<ActivityEntry[]>("/api/activity");
      return () => setActivityFeed(v ?? []);
    },
    treasury: async () => {
      const v = await fetchJson<TreasuryData>("/api/treasury");
      return () => setTreasuryData(v);
    },
    transactions: async () => {
      const v = await fetchJson<Transaction[]>("/api/transactions");
      return () => setTransactionList(v ?? []);
    },
    reimbursements: async () => {
      const v = await fetchJson<Reimbursement[]>("/api/reimbursements");
      return () => setReimbursementList(v ?? []);
    },
  }), []);

  /**
   * Load `wanted` sections (and optionally /api/auth/me).
   *
   * Each section loads independently: a failure in one (e.g. treasury) marks that
   * section as errored but lets the rest of the dashboard render. Auth failure is
   * the one exception — if /api/auth/me fails we abort the whole refresh, because
   * the rest of the data is meaningless without a user.
   */
  const loadSections = useCallback(async (
    wanted: readonly DataSection[],
    opts: { includeMe: boolean },
  ) => {
    const myId = ++refreshIdRef.current;
    const isLatest = () => refreshIdRef.current === myId;

    setIsLoading(true);
    if (opts.includeMe) setLoadError(null);

    // Sections fan out FIRST so they're in flight in parallel with /api/auth/me
    // rather than waterfalling behind it (saves a full round-trip per load).
    const sectionsPromise = wanted.length > 0
      ? Promise.allSettled(wanted.map(s => sectionLoaders[s]()))
      : null;

    if (opts.includeMe) {
      const meResult = await fetchJson<CurrentUser>("/api/auth/me")
        .then(value => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }));

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

      setCurrentUser(normalizeCurrentUser(meResult.value as CurrentUser));
      setAvatarRevision(r => r + 1);
    }

    if (!sectionsPromise) {
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    const results = await sectionsPromise;

    if (!isLatest()) return;

    const failed = new Set<DataSection>();
    const loaded = new Set<DataSection>();

    results.forEach((result, i) => {
      const section = wanted[i];
      if (result.status === "fulfilled") {
        result.value();
        loaded.add(section);
        return;
      }
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
    });

    // Only sections whose data actually landed count as loaded — a failed one
    // must stay eligible for a retry on the next navigation or refresh.
    loadedSectionsRef.current = new Set([...loadedSectionsRef.current, ...loaded]);
    setLoadedSections(loadedSectionsRef.current);

    // Merge rather than replace: a partial load must not clear the error state of
    // sections it didn't touch. Sections in `wanted` get a clean slate first, so a
    // recovered section drops out of the set.
    setSectionErrors(prev => {
      const next = new Set(prev);
      for (const s of wanted) next.delete(s);
      for (const s of failed) next.add(s);
      return next;
    });
    setIsLoading(false);
    setHasLoaded(true);
  }, [sectionLoaders]);

  /**
   * Refetch everything currently loaded, plus whatever the current route needs.
   * This is the public "something changed, resync" entry point — its contract is
   * unchanged, so every existing caller (mutations, SemesterGate, settings forms)
   * behaves as before.
   */
  const refreshChapterData = useCallback(async () => {
    const path = typeof window !== "undefined" ? window.location.pathname : null;
    const wanted = [...new Set([...loadedSectionsRef.current, ...sectionsForPath(path)])];
    await loadSections(wanted, { includeMe: true });
  }, [loadSections]);

  useEffect(() => {
    // Dev-only screenshot bypass: there's no client-side Supabase session, so
    // the session check below would come back empty and skip the load. The
    // impersonation cookie stands in for the session — load directly. (Inert in
    // prod; the cookie is only ever set by the local screenshot tool. See
    // lib/auth/dev-bypass.ts.)
    if (hasDevImpersonationCookie()) {
      refreshChapterData().catch(() => undefined);
      return;
    }
    // getSession() reads the stored session LOCALLY; getUser() posts to the
    // Supabase auth server. Since this gate sits in front of the entire bootstrap
    // fan-out, getUser() added a full network round-trip to the head of every
    // page load — and bought nothing: the client session is never trusted for
    // authorization. Every endpoint below re-verifies server-side, and a stale or
    // expired local session just yields 401 from /api/auth/me, which
    // refreshChapterData already treats as a silent no-op.
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) {
        refreshChapterData().catch(() => undefined);
      } else {
        setIsLoading(false);
      }
    });
  }, [refreshChapterData]);

  // Top up on navigation. The initial bootstrap only loads what the landing route
  // needs, so moving to a page with a bigger appetite (say /docs → /treasury)
  // fetches the difference here. Sections already loaded are NOT refetched, which
  // is what makes navigating back instant — and means data never disappears out
  // from under a page that is still mounted.
  useEffect(() => {
    if (!hasLoaded || !currentUser) return;
    const missing = sectionsForPath(pathname).filter(s => !loadedSectionsRef.current.has(s));
    if (missing.length === 0) return;
    loadSections(missing, { includeMe: false }).catch(() => undefined);
  }, [pathname, hasLoaded, currentUser, loadSections]);

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
    isLoading, loadError, sectionErrors, loadedSections,
    mutationError, setMutationError,
    refreshChapterData, hasLoaded,
    setDisabledFeaturesLocal,
    setNavOrderLocal,
    setSelfNameLocal,
  }), [
    currentUser,
    avatarRevision,
    setAvatarUrl,
    can,
    brotherList, taskList, pollList, igTaskList, programmingTaskList, partyList,
    activityFeed, treasuryData, transactionList, reimbursementList,
    isLoading, loadError, sectionErrors, loadedSections, mutationError, hasLoaded,
    refreshChapterData,
    setDisabledFeaturesLocal,
    setNavOrderLocal,
    setSelfNameLocal,
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
