"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Brother, Deadline, InstagramTask, PartyEvent, ActivityEntry,
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
}

const ChapterContext = createContext<ChapterContextValue | null>(null);

export function ChapterProvider({ children }: { children: React.ReactNode }) {
  const [brotherList,  setBrotherList]  = useState<Brother[]>([]);
  const [deadlineList, setDeadlineList] = useState<Deadline[]>([]);
  const [igTaskList,   setIgTaskList]   = useState<InstagramTask[]>([]);
  const [partyList,    setPartyList]    = useState<PartyEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);

  useEffect(() => {
    fetch("/api/brothers")
      .then((r) => r.json())
      .then(setBrotherList)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/deadlines")
      .then((r) => r.json())
      .then(setDeadlineList)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/instagram")
      .then((r) => r.json())
      .then(setIgTaskList)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/parties")
      .then((r) => r.json())
      .then(setPartyList)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then(setActivityFeed)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/treasury")
      .then((r) => r.json())
      .then(setTreasuryData)
      .catch(console.error);
  }, []);

  return (
    <ChapterContext.Provider value={{ brotherList, setBrotherList, deadlineList, setDeadlineList, igTaskList, setIgTaskList, partyList, setPartyList, activityFeed, setActivityFeed, treasuryData, setTreasuryData }}>
      {children}
    </ChapterContext.Provider>
  );
}

export function useChapter(): ChapterContextValue {
  const ctx = useContext(ChapterContext);
  if (!ctx) throw new Error("useChapter must be used inside ChapterProvider");
  return ctx;
}
