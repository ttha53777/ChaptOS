/**
 * Motion Lab: U8 Ask Chapt. The reasoning ledger stepping through a turn (pending →
 * active → done, findings posting) and an answer block entering once. Nothing here
 * calls the API; the answer is a hand-made tally.
 */
import type { AnswerData } from "@/lib/api-types";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AssistantTurn } from "~/chat/Answer";
import { LiveLedger } from "~/chat/Ledger";
import { freshIds } from "~/chat/thread";
import type { ChatMsg, LedgerStep } from "~/chat/types";
import { Button } from "~/paper/Button";
import { Section } from "./sections";

const PLAN: { id: string; verb: string; source: string; finding: string }[] = [
  { id: "dues", verb: "Reading the dues ledger", source: "Dues", finding: "6 members still owe, $740 in all" },
  { id: "roster", verb: "Checking the roster", source: "Roster", finding: "42 active members" },
  { id: "pay", verb: "Matching recent payments", source: "Treasury", finding: "3 paid this week" },
];

export function LedgerLab() {
  const [steps, setSteps] = useState<LedgerStep[]>([]);
  const [composing, setComposing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);
  const run = () => {
    clear();
    setComposing(false);
    setSteps(PLAN.map(p => ({ id: p.id, verb: p.verb, source: p.source, status: "pending" })));
    PLAN.forEach((p, i) => {
      timers.current.push(setTimeout(() => setSteps(s => s.map(x => (x.id === p.id ? { ...x, status: "active" } : x))), 500 + i * 1100));
      timers.current.push(setTimeout(() => setSteps(s => s.map(x => (x.id === p.id ? { ...x, status: "done", finding: p.finding } : x))), 1300 + i * 1100));
    });
    timers.current.push(setTimeout(() => setComposing(true), 1500 + PLAN.length * 1100));
  };
  return (
    <Section title="Reasoning ledger" note="Steps rise in (240ms) down a rose margin rule. Active = an arc spinning on the node (900ms a turn); done = a mint ticked disc, its finding fading in (260ms). The intent line breathes and counts done/total. Reduced: no spin or breathing, 180ms fades.">
      <LiveLedger intent="Looking at dues…" steps={steps} composing={composing} />
      <Button label="Run a turn" size="sm" variant="ghost" style={{ alignSelf: "flex-start" }} onPress={run} />
    </Section>
  );
}

const ANSWER: AnswerData = {
  verdict: "Six members *still owe dues*, $740 in all.",
  tone: "watch",
  rows: [
    { kind: "person", title: "Rob Chen", subtitle: "Treasurer", value: "$120" },
    { kind: "person", title: "Sam Ortiz", subtitle: "Member", value: "$95" },
  ],
  shape: {
    type: "tally", metric: "owes_dues", hit: 6, of: 42, hitWord: "owe", hitLegend: "Owes", restLegend: "Paid up", topLabel: "$100+",
    marks: Array.from({ length: 42 }, (_, i) => ({ id: 900000 + i, name: `Member ${i + 1}`, state: i < 2 ? "top" : i < 6 ? "hit" : "rest", value: i < 6 ? "$95" : null })),
  },
  follows: [{ label: "Who paid this week?", ask: "Who paid dues this week?" }],
  sources: ["Dues", "Roster"],
};

export function AnswerLab() {
  const [n, setN] = useState(0);
  const id = `lab-${n}`;
  if (n) freshIds.add(id);
  const msg: ChatMsg = { id, role: "assistant", content: "", answer: ANSWER, steps: PLAN.map(p => ({ id: p.id, verb: p.verb, source: p.source, status: "done", finding: p.finding })) };
  return (
    <Section title="Answer entrance" note="Verdict, body, footing rise 8pt + fade (280ms) on a 70ms stagger, once: only turns born this session animate, so reopening the sheet never replays them. Reduced: 180ms fade, no travel.">
      <View key={id}><AssistantTurn msg={msg} streaming={false} /></View>
      <Button label="Play the entrance" size="sm" variant="ghost" style={{ alignSelf: "flex-start" }} onPress={() => setN(x => x + 1)} />
    </Section>
  );
}
