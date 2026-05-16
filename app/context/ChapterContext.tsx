"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  Brother, Deadline, InstagramTask, PartyEvent, ActivityEntry, Transaction,
} from "../data";

export interface TreasuryData {
  balance: number;
  projected: number;
  trend: { month: string; balance: number }[];
}

interface ChapterContextValue {
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
}

const ChapterContext = createContext<ChapterContextValue | null>(null);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function ChapterProvider({ children }: { children: React.ReactNode }) {
  const [brotherList,      setBrotherList]      = useState<Brother[]>([]);
  const [deadlineList,     setDeadlineList]     = useState<Deadline[]>([]);
  const [igTaskList,       setIgTaskList]       = useState<InstagramTask[]>([]);
  const [partyList,        setPartyList]        = useState<PartyEvent[]>([]);
  const [activityFeed,     setActivityFeed]     = useState<ActivityEntry[]>([]);
  const [treasuryData,     setTreasuryData]     = useState<TreasuryData | null>(null);
  const [transactionList,  setTransactionList]  = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const refreshChapterData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [brothers, deadlines, instagram, parties, activity, treasury, transactions] = await Promise.all([
        fetchJson<Brother[]>("/api/brothers"),
        fetchJson<Deadline[]>("/api/deadlines"),
        fetchJson<InstagramTask[]>("/api/instagram"),
        fetchJson<PartyEvent[]>("/api/parties"),
        fetchJson<ActivityEntry[]>("/api/activity"),
        fetchJson<TreasuryData>("/api/treasury"),
        fetchJson<Transaction[]>("/api/transactions"),
      ]);

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
      console.error(error);
      setLoadError("Could not load chapter data from the database.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshChapterData().catch(() => undefined);
  }, [refreshChapterData]);

  return (
    <ChapterContext.Provider value={{ brotherList, setBrotherList, deadlineList, setDeadlineList, igTaskList, setIgTaskList, partyList, setPartyList, activityFeed, setActivityFeed, treasuryData, setTreasuryData, transactionList, setTransactionList, isLoading, loadError, mutationError, setMutationError, refreshChapterData }}>
      {children}
    </ChapterContext.Provider>
  );
}

export function useChapter(): ChapterContextValue {
  const ctx = useContext(ChapterContext);
  if (!ctx) throw new Error("useChapter must be used inside ChapterProvider");
  return ctx;
}
