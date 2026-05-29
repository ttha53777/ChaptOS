"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Brother, Deadline, InstagramTask, PartyEvent, ActivityEntry, Transaction,
} from "../data";
import { AVATAR_CHANGED_EVENT, parseAvatarFromMetadata } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, type Permission } from "@/lib/permissions";

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
  };
}

export interface TreasuryData {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
}

export interface CurrentUserRole {
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
  /** Current active org (resolved by active_org_id cookie or default). */
  org: { name: string; slug: string } | null;
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
  deadlineList: Deadline[];
  setDeadlineList: React.Dispatch<React.SetStateAction<Deadline[]>>;
  igTaskList: InstagramTask[];
  setIgTaskList: React.Dispatch<React.SetStateAction<InstagramTask[]>>;
  partyList: PartyEvent[];
  setPartyList: React.Dispatch<React.SetStateAction<PartyEvent[]>>;
  activityFeed: ActivityEntry[];
  setActivityFeed: React.Dispatch<React.SetStateAction<ActivityEntry[]>>;
  treasuryData: TreasuryData | null;
  setTreasuryData: React.Dispatch<React.SetStateAction<TreasuryData | null>>;
  transactionList: Transaction[];
  setTransactionList: React.Dispatch<React.SetStateAction<Transaction[]>>;
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
  hasLoaded: boolean;
}

export type ChapterSection =
  | "me"
  | "brothers"
  | "deadlines"
  | "instagram"
  | "parties"
  | "activity"
  | "treasury"
  | "transactions";

const ChapterContext = createContext<ChapterContextValue | null>(null);

class UnauthenticatedError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 401) throw new UnauthenticatedError();
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
  const [deadlineList,     setDeadlineList]     = useState<Deadline[]>([]);
  const [igTaskList,       setIgTaskList]       = useState<InstagramTask[]>([]);
  const [partyList,        setPartyList]        = useState<PartyEvent[]>([]);
  const [activityFeed,     setActivityFeed]     = useState<ActivityEntry[]>([]);
  const [treasuryData,     setTreasuryData]     = useState<TreasuryData | null>(null);
  const [transactionList,  setTransactionList]  = useState<Transaction[]>([]);
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

  const refreshChapterData = useCallback(async () => {
    const myId = ++refreshIdRef.current;
    const isLatest = () => refreshIdRef.current === myId;

    setIsLoading(true);
    setLoadError(null);
    setSectionErrors(new Set());

    // Each endpoint loads independently. A failure in one section (e.g. treasury)
    // marks that section as errored but lets the rest of the dashboard render.
    // Auth failure is the one exception — if /api/auth/me fails, we abort the
    // whole refresh because the rest of the data is meaningless without a user.
    const meResult        = await Promise.resolve().then(() => fetchJson<CurrentUser>("/api/auth/me"))
      .then(value => ({ ok: true as const, value }))
      .catch(error => ({ ok: false as const, error }));

    if (!isLatest()) return;

    if (!meResult.ok) {
      if (meResult.error instanceof UnauthenticatedError) {
        setIsLoading(false);
        setHasLoaded(true);
        return;
      }
      console.error("[ChapterContext] /api/auth/me failed:", meResult.error);
      setLoadError("Could not load your account. Please refresh.");
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    setCurrentUser(normalizeCurrentUser(meResult.value));
    setAvatarRevision(r => r + 1);

    // Fan out the rest. allSettled so one slow/broken endpoint doesn't blank
    // the dashboard — see audit finding D4 / backend E3.
    const [brothers, deadlines, instagram, parties, activity, treasury, transactions] = await Promise.allSettled([
      fetchJson<Brother[]>("/api/brothers"),
      fetchJson<Deadline[]>("/api/deadlines"),
      fetchJson<InstagramTask[]>("/api/instagram"),
      fetchJson<PartyEvent[]>("/api/parties"),
      fetchJson<ActivityEntry[]>("/api/activity"),
      fetchJson<TreasuryData>("/api/treasury"),
      fetchJson<Transaction[]>("/api/transactions"),
    ]);

    if (!isLatest()) return;

    const failed = new Set<ChapterSection>();
    const trackFailure = (section: ChapterSection, result: PromiseSettledResult<unknown>) => {
      if (result.status === "rejected") {
        failed.add(section);
        console.error(`[ChapterContext] ${section} fetch failed:`, result.reason);
      }
    };

    if (brothers.status === "fulfilled")     setBrotherList(brothers.value);
    else                                     trackFailure("brothers", brothers);

    if (deadlines.status === "fulfilled")    setDeadlineList(deadlines.value);
    else                                     trackFailure("deadlines", deadlines);

    if (instagram.status === "fulfilled")    setIgTaskList(instagram.value);
    else                                     trackFailure("instagram", instagram);

    if (parties.status === "fulfilled") {
      setPartyList(parties.value.map(p => ({
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

    if (activity.status === "fulfilled")     setActivityFeed(activity.value);
    else                                     trackFailure("activity", activity);

    if (treasury.status === "fulfilled")     setTreasuryData(treasury.value);
    else                                     trackFailure("treasury", treasury);

    if (transactions.status === "fulfilled") setTransactionList(transactions.value);
    else                                     trackFailure("transactions", transactions);

    setSectionErrors(failed);
    setIsLoading(false);
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) {
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
    deadlineList, setDeadlineList,
    igTaskList, setIgTaskList,
    partyList, setPartyList,
    activityFeed, setActivityFeed,
    treasuryData, setTreasuryData,
    transactionList, setTransactionList,
    isLoading, loadError, sectionErrors,
    mutationError, setMutationError,
    refreshChapterData, hasLoaded,
  }), [
    currentUser,
    avatarRevision,
    setAvatarUrl,
    can,
    brotherList, deadlineList, igTaskList, partyList,
    activityFeed, treasuryData, transactionList,
    isLoading, loadError, sectionErrors, mutationError, hasLoaded,
    refreshChapterData,
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
