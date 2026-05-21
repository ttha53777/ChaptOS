"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Brother, Deadline, InstagramTask, PartyEvent, ActivityEntry, Transaction,
} from "../data";
import { AVATAR_CHANGED_EVENT, parseAvatarFromMetadata } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";

function normalizeCurrentUser(me: CurrentUser): CurrentUser {
  return {
    ...me,
    avatarUrl: me.avatarUrl ?? null,
    hasCustomAvatar: me.hasCustomAvatar ?? false,
  };
}

export interface TreasuryData {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
}

export interface CurrentUser {
  id: number;
  name: string;
  role: string;
  email: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
}

interface ChapterContextValue {
  currentUser: CurrentUser | null;
  avatarRevision: number;
  setAvatarUrl: (avatarUrl: string | null, hasCustomAvatar?: boolean) => void;
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
  mutationError: string | null;
  setMutationError: React.Dispatch<React.SetStateAction<string | null>>;
  refreshChapterData: () => Promise<void>;
  hasLoaded: boolean;
}

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

    try {
      const [me, brothers, deadlines, instagram, parties, activity, treasury, transactions] = await Promise.all([
        fetchJson<CurrentUser>("/api/auth/me"),
        fetchJson<Brother[]>("/api/brothers"),
        fetchJson<Deadline[]>("/api/deadlines"),
        fetchJson<InstagramTask[]>("/api/instagram"),
        fetchJson<PartyEvent[]>("/api/parties"),
        fetchJson<ActivityEntry[]>("/api/activity"),
        fetchJson<TreasuryData>("/api/treasury"),
        fetchJson<Transaction[]>("/api/transactions"),
      ]);

      if (!isLatest()) return;

      setCurrentUser(normalizeCurrentUser(me));
      setAvatarRevision(r => r + 1);
      setBrotherList(brothers);
      setDeadlineList(deadlines);
      setIgTaskList(instagram);
      setPartyList(parties.map(p => ({
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
      setActivityFeed(activity);
      setTreasuryData(treasury);
      setTransactionList(transactions);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return;
      }
      console.error(error);
      if (isLatest()) setLoadError("Could not load chapter data from the database.");
      throw error;
    } finally {
      if (isLatest()) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
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
  useEffect(() => {
    if (!hasLoaded) return;
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      const { avatarUrl, hasCustomAvatar } = parseAvatarFromMetadata(session.user.user_metadata);
      setCurrentUser(prev => {
        if (!prev) return prev;
        if (prev.avatarUrl === avatarUrl && prev.hasCustomAvatar === hasCustomAvatar) return prev;
        setBrotherList(bl => bl.map(b => (b.id === prev.id ? { ...b, avatarUrl } : b)));
        return { ...prev, avatarUrl, hasCustomAvatar };
      });
      setAvatarRevision(r => r + 1);
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const { avatarUrl, hasCustomAvatar } = parseAvatarFromMetadata(user.user_metadata);
      setCurrentUser(prev => {
        if (!prev) return prev;
        if (prev.avatarUrl === avatarUrl && prev.hasCustomAvatar === hasCustomAvatar) return prev;
        setBrotherList(bl => bl.map(b => (b.id === prev.id ? { ...b, avatarUrl } : b)));
        return { ...prev, avatarUrl, hasCustomAvatar };
      });
      setAvatarRevision(r => r + 1);
    });
    return () => subscription.unsubscribe();
  }, [hasLoaded]);

  const value = useMemo(() => ({
    currentUser,
    avatarRevision,
    setAvatarUrl,
    brotherList, setBrotherList,
    deadlineList, setDeadlineList,
    igTaskList, setIgTaskList,
    partyList, setPartyList,
    activityFeed, setActivityFeed,
    treasuryData, setTreasuryData,
    transactionList, setTransactionList,
    isLoading, loadError,
    mutationError, setMutationError,
    refreshChapterData, hasLoaded,
  }), [
    currentUser,
    avatarRevision,
    setAvatarUrl,
    brotherList, deadlineList, igTaskList, partyList,
    activityFeed, treasuryData, transactionList,
    isLoading, loadError, mutationError, hasLoaded,
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
