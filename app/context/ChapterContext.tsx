"use client";

import React, { createContext, useContext, useState } from "react";
import {
  Brother, Deadline, InstagramTask, PartyEvent, ActivityEntry,
  brothers, deadlines, instagramTasks, partyEvents, seedActivity,
} from "../data";

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
}

const ChapterContext = createContext<ChapterContextValue | null>(null);

export function ChapterProvider({ children }: { children: React.ReactNode }) {
  const [brotherList,  setBrotherList]  = useState<Brother[]>(brothers);
  const [deadlineList, setDeadlineList] = useState<Deadline[]>(deadlines);
  const [igTaskList,   setIgTaskList]   = useState<InstagramTask[]>(instagramTasks);
  const [partyList,    setPartyList]    = useState<PartyEvent[]>(partyEvents);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>(seedActivity);

  return (
    <ChapterContext.Provider value={{ brotherList, setBrotherList, deadlineList, setDeadlineList, igTaskList, setIgTaskList, partyList, setPartyList, activityFeed, setActivityFeed }}>
      {children}
    </ChapterContext.Provider>
  );
}

export function useChapter(): ChapterContextValue {
  const ctx = useContext(ChapterContext);
  if (!ctx) throw new Error("useChapter must be used inside ChapterProvider");
  return ctx;
}
