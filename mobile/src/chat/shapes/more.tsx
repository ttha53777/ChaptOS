/**
 * Answer shapes, part two: Week (a planner page: seven day lines, each item a tappable
 * line in its category ink, the next thing after the week underneath), Record (the
 * record card inline), Steps (a how-to as a path through the app, with the screen it
 * opens), Reasons (an attendance case file: gauge, the meeting strip, the rest of the row,
 * and what the meetings left can do), Quote (what the minutes say, word for word, and the
 * meeting's action items), Decline (out of scope, said plainly).
 */
import type { AnswerRow, DeclineShape, QuoteShape, ReasonsShape, RecordShape, StepsShape, WeekItem, WeekShape } from "@/lib/api-types";
import { Pressable, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { Button } from "~/paper/Button";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { clockLabel, monthDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";
import { PeekBody } from "../PeekBody";
import { Kicker, Rows, styles, useActions, usableRef } from "./common";

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return dt.toISOString().slice(0, 10);
};

function WeekRow({ it }: { it: WeekItem }) {
  const { c } = useTheme();
  const a = useActions();
  const ink = it.kind === "deadline" ? c.cat.deadline : (c.scheme === "dark" ? it.cat?.colorDark : it.cat?.color) ?? c.cat.chapter;
  const ref = usableRef(it.ref);
  return (
    <Pressable disabled={!ref} onPress={() => { if (ref) a.peek(ref); }} accessibilityRole="button"
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, opacity: pressed ? 0.6 : 1 }]}>
      <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: ink }} />
      <View style={{ flex: 1 }}>
        <T v="callout" numberOfLines={1}>{it.title}{it.mandatory ? <T v="meta" color={c.pastel.rose.ink}>  required</T> : null}{it.mine ? <T v="meta" color={c.pastel.sky.ink}>  yours</T> : null}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{[it.kind === "deadline" ? "Due" : it.cat?.label, clockLabel(it.time), it.place].filter(Boolean).join(" · ")}</T>
      </View>
      {it.attended === true ? <Icon name="check" size={13} color={c.pastel.mint.ink} /> : null}
    </Pressable>
  );
}

export function Week({ s }: { s: WeekShape }) {
  const { c } = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(s.start, i));
  return (
    <View style={[styles.card, { borderColor: c.ink, backgroundColor: c.card, gap: 0, paddingVertical: 6 }]}>
      {days.map((d, i) => {
        const items = s.items.filter(it => it.date === d);
        return (
          <View key={d} style={{ flexDirection: "row", gap: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: alpha(c.pastel.sky.ink, 0.15) }}>
            <View style={{ width: 40 }}>
              <T v="mono" color={c.ink3} style={{ fontSize: 10 }}>{weekdayShort(d).toUpperCase()}</T>
              <T v="subhead" color={items.length ? c.ink : c.ink3}>{Number(d.slice(8))}</T>
            </View>
            <View style={{ flex: 1, justifyContent: "center" }}>
              {items.length ? items.map((it, j) => <WeekRow key={j} it={it} />) : <T v="meta" color={c.faint}>—</T>}
            </View>
          </View>
        );
      })}
      {s.after ? (
        <View style={{ borderTopWidth: 1.5, borderTopColor: c.line, paddingTop: 8, marginTop: 4 }}>
          <T v="label" color={c.ink3}>After that · {monthDay(s.after.date)}</T>
          <WeekRow it={s.after} />
        </View>
      ) : null}
    </View>
  );
}

export function Record({ s }: { s: RecordShape }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {s.cards.map((card, i) => (
        <View key={i} style={[styles.card, { borderColor: c.ink, backgroundColor: c.card }]}><PeekBody card={card} /></View>
      ))}
    </View>
  );
}

export function Steps({ s }: { s: StepsShape }) {
  const { c } = useTheme();
  const a = useActions();
  return (
    <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
      <Kicker text={s.crumbs.join(" › ")} />
      {s.steps.map((st, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.ink, alignItems: "center", justifyContent: "center" }}>
            <T v="mono" style={{ fontSize: 11 }}>{i + 1}</T>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="callout">{st.title}</T>
            {st.hint ? <T v="meta" color={c.ink3}>{st.hint}</T> : null}
            {st.fields?.map((f, j) => (
              <T key={j} v="meta" color={c.ink2}><T v="meta" style={{ fontWeight: "600" }}>{f.label}</T>{f.example ? `: ${f.example}` : ""}</T>
            ))}
          </View>
        </View>
      ))}
      {s.perm && !s.perm.ok ? <T v="meta" color={c.pastel.rose.ink}>Needs {s.perm.label}, which you don't have. An officer who does can do this.</T> : null}
      <Button label={`Open ${s.screen.label} on the web`} icon="out" variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => a.screen(s.screen.path)} />
    </View>
  );
}

const STRIP = { there: "mint", missed: "rose", excused: "butter", unrecorded: "sky", ahead: "sky" } as const;

export function Reasons({ s, rows }: { s: ReasonsShape; rows: AnswerRow[] }) {
  const { c } = useTheme();
  const g = s.gauge;
  const low = g.value < g.atRisk;
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
        <Kicker text={`${s.subject.name} · ${s.subject.role}`} />
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <T v="measure" color={low ? c.pastel.rose.ink : c.ink}>{g.value}%</T>
          <T v="meta" color={c.ink3}>{g.attended} of {g.counted} meetings</T>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: c.paper3 }} accessibilityElementsHidden>
          <View style={{ width: `${Math.min(100, g.value)}%`, height: 10, borderRadius: 5, backgroundColor: low ? c.pastel.rose.fill : c.pastel.mint.fill }} />
          <View style={{ position: "absolute", left: `${g.atRisk}%`, top: -3, bottom: -3, width: 2, backgroundColor: c.pastel.rose.ink }} />
          {g.watch != null ? <View style={{ position: "absolute", left: `${g.watch}%`, top: -3, bottom: -3, width: 2, backgroundColor: c.pastel.butter.ink }} /> : null}
        </View>
        <T v="meta" color={c.ink3}>At risk under {g.atRisk}%{g.watch != null ? `, watch under ${g.watch}%` : ""}.</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessible accessibilityLabel={s.strip.map(m => `${monthDay(m.date)} ${m.state}`).join(", ")}>
          {s.strip.map(m => {
            const p = c.pastel[STRIP[m.state]];
            return <View key={m.eventId} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.2, borderColor: m.state === "ahead" ? c.line2 : p.ink, backgroundColor: m.state === "there" ? p.fill : m.state === "excused" ? p.soft : "transparent", borderStyle: m.state === "ahead" ? "dotted" : "solid" }} />;
          })}
        </View>
        {s.rest.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <T v="meta" color={c.ink2}>{r.label}</T>
            <T v="mono" color={r.ok ? c.ink : c.pastel.rose.ink} style={{ fontSize: 12 }}>{r.value}</T>
          </View>
        ))}
        {s.pathBack && low ? (
          <View style={{ gap: 6 }}>
            <T v="meta" color={c.ink2}>{s.pathBack.left} required {s.pathBack.left === 1 ? "meeting is" : "meetings are"} still on the calendar.</T>
            {s.pathBack.outcomes.map((o, oi) => (
              <View key={oi} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T v="callout" style={{ flex: 1 }}>{o.attend === s.pathBack!.left ? `Makes all ${o.attend}` : "Misses one"} → {o.attended} of {o.counted}</T>
                <T v="mono" color={o.clears ? c.pastel.mint.ink : c.pastel.rose.ink} style={{ fontSize: 12 }}>{o.pct}% · {o.clears ? "clears it" : "still under"}</T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Rows rows={rows} />
    </View>
  );
}

export function Quote({ s }: { s: QuoteShape }) {
  const { c } = useTheme();
  const a = useActions();
  return (
    <View style={[styles.card, { borderColor: c.line, backgroundColor: c.card }]}>
      <Pressable onPress={() => a.peek({ type: "event", id: s.meeting.id })} accessibilityRole="button">
        <Kicker text={`${s.meeting.title} · ${monthDay(s.meeting.date)}${s.decided ? " · Decided" : ""}`} />
      </Pressable>
      <View style={{ borderLeftWidth: 3, borderLeftColor: c.pastel.butter.ink, paddingLeft: 12 }}>
        <T v="body" style={{ fontStyle: "italic" }}>“{s.text}”</T>
      </View>
      {s.items.length ? (
        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink3}>Action items</T>
          {s.items.map(it => (
            <View key={it.id} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Icon name={it.done ? "check" : "clip"} size={13} color={it.done ? c.pastel.mint.ink : c.ink3} />
              <T v="meta" color={c.ink2} style={{ flex: 1, textDecorationLine: it.done ? "line-through" : "none" }}>
                {it.text}{it.owner ? ` · ${it.owner}` : ""}{it.due ? ` · ${monthDay(it.due)}` : ""}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Decline({ s }: { s: DeclineShape }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { borderColor: c.line2, backgroundColor: c.paper2, borderStyle: "dashed" }]}>
      <T v="body" color={c.ink2}>{s.scope}</T>
    </View>
  );
}
