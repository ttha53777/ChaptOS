/**
 * One Ask Chapt turn from the assistant (U8 "Answers"): every answer is a headline (the
 * verdict, its one emphasis in the answer's tone), one body block, and a footing (sources,
 * then what to ask next). The body is the server's shape drawn natively when this build
 * knows it, else the shape's own fallback rows; a plain-text reply is prose. Blocks enter
 * with a short rise + fade, once: only turns created in this session animate, so reopening
 * the sheet never replays them (~/chat/thread freshIds).
 *
 * Around it: the live ledger while it works, the folded trace once done, ask-back
 * questions (chips stage into one Continue per block; a lone single-choice question still
 * sends on the first tap, as on the web), citations into attached files, drafted writes
 * to confirm (proposal cards), and status slips (timed out, cut short, failed, stopped).
 */
import type { AnswerCitation, AnswerData, AskBack, AskBackQuestion } from "@/lib/api-types";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeIn, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { LiveLedger, Trace } from "./Ledger";
import { Proposal } from "./Proposal";
import { Prose, Verdict } from "./Rich";
import { Breakdown, Figure, Tally } from "./shapes/basic";
import { Rows, TONE_OF, useActions } from "./shapes/common";
import { Decline, Quote, Reasons, Record, Steps, Week } from "./shapes/more";
import { freshIds, markReplied } from "./thread";
import type { ChatMsg } from "./types";

function Body({ a }: { a: AnswerData }) {
  const tone = TONE_OF[a.tone ?? "chapt"] ?? "lilac";
  const s = a.shape;
  switch (s?.type) {
    case "figure": return <Figure s={s} tone={tone} />;
    case "tally": return <Tally s={s} rows={a.rows} tone={tone} />;
    case "breakdown": return <Breakdown s={s} rows={a.rows} />;
    case "week": return <Week s={s} />;
    case "record": return <Record s={s} />;
    case "steps": return <Steps s={s} />;
    case "reasons": return <Reasons s={s} rows={a.rows} />;
    case "quote": return <Quote s={s} />;
    case "decline": return <Decline s={s} />;
    default: return <Rows rows={a.rows} />;
  }
}

/** Enter once: a rise + fade for turns born this session, nothing for history. */
function Enter({ fresh, i, children }: { fresh: boolean; i: number; children: ReactNode }) {
  const m = useMotion();
  if (!fresh) return <View>{children}</View>;
  const e = m.reduced ? FadeIn.duration(m.t(180)) : FadeInDown.duration(m.t(280)).delay(m.t(i * 70));
  return <Animated.View entering={e.reduceMotion(ReduceMotion.Never)}>{children}</Animated.View>;
}

export function AssistantTurn({ msg, streaming }: { msg: ChatMsg; streaming: boolean }) {
  const { c } = useTheme();
  const act = useActions();
  const fresh = freshIds.has(msg.id);
  const a = msg.answer;
  const working = streaming && !a && !msg.content && !msg.proposals?.length && !msg.notice && !msg.error;
  const tone = TONE_OF[a?.tone ?? "chapt"] ?? "lilac";

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.who}>
        <View style={[styles.dot, { backgroundColor: c.pastel.lilac.ink }]} />
        <T v="label" color={c.ink3}>Ask Chapt</T>
      </View>

      {working ? <LiveLedger intent={msg.intent ?? "Searching the records…"} steps={msg.steps ?? []} composing={msg.composing} />
        : msg.steps?.length ? <Trace steps={msg.steps} /> : null}

      {a ? (
        <>
          <Enter fresh={fresh} i={0}><Verdict text={a.verdict} tone={tone} /></Enter>
          {a.citations?.length ? <Enter fresh={fresh} i={1}><Cites list={a.citations} onCite={act.cite} /></Enter> : null}
          <Enter fresh={fresh} i={1}><Body a={a} /></Enter>
          {a.askback ? <Enter fresh={fresh} i={2}><AskBackBlock askback={a.askback} replied={!!msg.replied} onSend={t => { markReplied(msg.id); act.ask(t); }} /></Enter> : null}
          <Enter fresh={fresh} i={3}>
            <View style={{ gap: 10 }}>
              {a.sources.length ? (
                <View style={styles.wrap}>
                  {a.sources.map(s => (
                    <View key={s} style={[styles.src, { borderColor: c.line }]}>
                      <View style={[styles.srcDot, { backgroundColor: c.pastel.mint.ink }]} />
                      <T v="pill" color={c.ink3}>{s}</T>
                    </View>
                  ))}
                </View>
              ) : null}
              {!a.askback && a.follows.length ? (
                <View style={styles.wrap}>
                  {a.follows.map(f => (
                    <Pressable key={f.label} onPress={() => { haptics.select(); act.ask(f.ask); }} accessibilityRole="button"
                      style={({ pressed }) => [styles.follow, { borderColor: c.ink, backgroundColor: pressed ? c.pastel.lilac.soft : c.card }]}>
                      <Icon name="arrow-r" size={12} color={c.ink2} />
                      <T v="pill">{f.label}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </Enter>
        </>
      ) : null}

      {msg.content ? <Enter fresh={fresh} i={0}><Prose text={msg.content} refs={msg.noteRefs} onRef={act.peek} /></Enter> : null}

      {msg.proposals?.map(p => <Proposal key={p.id} msgId={msg.id} card={p} />)}

      {msg.notice ? <Slip tone="butter" icon="alert" text={msg.notice.kind === "timeout" ? "That took too long, so I stopped. Try asking a narrower question." : msg.notice.kind === "cut_short" ? "The answer was cut short." : "Something went wrong on my side."} /> : null}
      {msg.error ? <Slip tone="rose" icon="alert" text={msg.error.message ?? (msg.error.at ? `Lost the connection while reading ${msg.error.at}.` : "Lost the connection. Ask again when you're back online.")} /> : null}
      {msg.stopped ? <Slip tone="sky" icon="x" text="Stopped." /> : null}
    </View>
  );
}

function Slip({ tone, icon, text }: { tone: "butter" | "rose" | "sky"; icon: "alert" | "x"; text: string }) {
  const { c } = useTheme();
  const p = c.pastel[tone];
  return (
    <View style={[styles.slip, { backgroundColor: p.soft, borderColor: p.border }]} accessibilityRole="alert">
      <Icon name={icon} size={14} color={p.ink} />
      <T v="meta" color={c.ink2} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function Cites({ list, onCite }: { list: AnswerCitation[]; onCite: (c: AnswerCitation) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {list.map((ct, i) => (
        <Pressable key={i} onPress={() => { haptics.select(); onCite(ct); }} accessibilityRole="button" accessibilityLabel={`Open ${ct.name}, ${ct.locator}`}
          style={({ pressed }) => [styles.src, { borderColor: c.pastel.sky.border, backgroundColor: pressed ? c.pastel.sky.soft : "transparent" }]}>
          <Icon name="doc" size={11} color={c.pastel.sky.ink} />
          <T v="pill" color={c.pastel.sky.ink} numberOfLines={1}>{ct.name} · {ct.locator}</T>
        </Pressable>
      ))}
    </View>
  );
}

/* ── ask-back ─────────────────────────────────────────────────────────────────── */

type Picks = Record<number, string[]>;
const compose = (qs: AskBackQuestion[], picks: Picks) => qs.map((q, i) => ((picks[i] ?? []).length ? `${q.question} ${picks[i]!.join(", ")}` : "")).filter(Boolean).join(" ");

function AskBackBlock({ askback, replied, onSend }: { askback: AskBack; replied: boolean; onSend: (text: string) => void }) {
  const { c } = useTheme();
  const [picks, setPicks] = useState<Picks>({});
  const qs = askback.questions;
  const instant = qs.length === 1 && qs[0]!.select !== "many";
  const staged = Object.values(picks).some(v => v.length);

  const tap = (qi: number, q: AskBackQuestion, chip: string) => {
    if (replied) return;
    haptics.select();
    if (instant) { onSend(`${q.question} ${chip}`); return; }
    setPicks(prev => {
      const cur = prev[qi] ?? [];
      if (q.select === "many") return { ...prev, [qi]: cur.includes(chip) ? cur.filter(x => x !== chip) : [...cur, chip] };
      return { ...prev, [qi]: cur[0] === chip ? [] : [chip] };
    });
  };

  return (
    <View style={[styles.ab, { borderColor: c.pastel.lilac.border, backgroundColor: c.pastel.lilac.soft, opacity: replied ? 0.6 : 1 }]}>
      {askback.lead ? <T v="callout" color={c.ink2}>{askback.lead}</T> : null}
      {qs.map((q, qi) => (
        <View key={qi} style={{ gap: 8 }}>
          <T v="callout">{q.question}</T>
          <View style={styles.wrap}>
            {q.chips.map((chip, ci) => {
              const on = (picks[qi] ?? []).includes(chip);
              const person = q.people?.[ci];
              return (
                <Pressable key={ci} onPress={() => tap(qi, q, chip)} disabled={replied} accessibilityRole={q.select === "many" ? "checkbox" : "radio"} accessibilityState={{ checked: on, selected: on }}
                  style={({ pressed }) => [person ? styles.person : styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.card : pressed ? c.card : c.paper }]}>
                  {on ? <Icon name="check" size={12} color={c.ink} /> : null}
                  {person ? (
                    <View style={{ gap: 2 }}>
                      <T v="callout">{person.name}</T>
                      <T v="meta" color={c.ink3}>{[person.role, ...person.facts.map(f => f.label)].filter(Boolean).join(" · ")}</T>
                    </View>
                  ) : <T v="pill">{chip}</T>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {!instant && staged && !replied ? (
        <Button label="Continue" icon="arrow-r" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => onSend(compose(qs, picks))} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  src: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: "100%" },
  srcDot: { width: 5, height: 5, borderRadius: 3 },
  follow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  slip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  ab: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  person: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, width: "100%" },
});
