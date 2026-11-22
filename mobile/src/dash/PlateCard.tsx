/**
 * On your plate (web plate/PlateCard.tsx), the officer queue plus the viewer's own,
 * from lib/dashboard/plate.ts derivePlate, the same rows the web card draws:
 *
 *   header   flag tile, "On your plate", a peach "N left" chip (mint "all clear")
 *   scope    You / All tabs when someone else's rows are in the list
 *   lanes    Late · Today · Coming up, each with its count
 *   rows     tile, title, meta (late parts in peach), "for you" / "as Treasurer" tag,
 *            and the row's one action:
 *              task           Mark done (the Tasks tab's tick: toast + Undo)
 *              poll           Vote → options open under the row → Cast vote
 *              wrap-up        Wrap up → Programming
 *              fundraiser     Wrap up → Fundraisers
 *              reimbursement  Review → each request with Reject / Approve, Approve all
 *              dues           Open dues → Treasury
 *              my-dues        See dues → Yours → Dues
 *   empty    ALL CLEAR stamp, or the mug hello on an org with nothing recorded yet
 *   cap      five rows, then "Show N more" (the web rail's cap)
 *
 * Motion: rows leave by sliding left and fading while the rest glide up (layout
 * transition); an opened row's drawer fades in. Haptics: success on a cast vote and an
 * approval (the tick fires its own), select on the You/All switch, error on refusal.
 */
import type { DashboardResponse } from "@/lib/api-types";
import type { PlateItem, PlateLane, PlatePerm } from "@/lib/dashboard/plate";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOutLeft, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { refreshHome } from "~/data/home";
import { reviewReimbursement } from "~/data/money";
import { postVote } from "~/data/tasks";
import { Icon, type IconName } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Tile } from "~/paper/bits";
import { toast } from "~/shell/toast";
import { onTickRefused, tickTask } from "~/tasks/tick";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { CountChip, DashCard } from "./Card";
import { pressedDim } from "~/motion/press";

const LANES: [PlateLane, string][] = [["late", "Late"], ["today", "Today"], ["soon", "Coming up"]];
const CAP = 5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt$ = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const first = (name: string) => name.split(" ")[0] ?? name;

/** The web's when(): "today", "tomorrow", "Sat", "Nov 28", "yesterday". */
function when(iso: string, today: string): string {
  const a = new Date(`${today}T00:00:00`), b = new Date(`${iso}T00:00:00`);
  const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 1 && d < 7) return b.toLocaleDateString("en-US", { weekday: "short" });
  return `${MON[b.getMonth()]} ${b.getDate()}`;
}

function Btn({ label, icon, onPress, ghost, solid, disabled, after }: { label: string; icon?: IconName; onPress: () => void; ghost?: boolean; solid?: boolean; disabled?: boolean; after?: IconName }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, {
        backgroundColor: solid ? c.ink : ghost ? "transparent" : c.card,
        borderColor: ghost ? c.line2 : c.ink,
        boxShadow: ghost || pressed ? undefined : `2px 2px 0 ${c.pastel.butter.fill}`,
        opacity: disabled ? 0.55 : 1,
      }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      {icon ? <Icon name={icon} size={13} color={solid ? c.paper : c.ink} /> : null}
      <T v="buttonSm" size={12.6} color={solid ? c.paper : c.ink}>{label}</T>
      {after ? <Icon name={after} size={12} color={solid ? c.paper : c.ink} /> : null}
    </Pressable>
  );
}

export function PlateCard({ items, today, data, hasData, roleNames, duesWord, memberWord, i }: {
  items: PlateItem[]; today: string; data: DashboardResponse;
  /** The web's hasAnyData: anything measured at all (ALL CLEAR vs the mug hello). */
  hasData: boolean;
  roleNames: Partial<Record<PlatePerm, string>>;
  duesWord: string; memberWord: (plural: boolean) => string;
  i: number;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ key: string; msg: string } | null>(null);

  // A refused tick puts the row back.
  useEffect(() => onTickRefused(id => setGone(g => { const n = new Set(g); n.delete(`task-${id}`); return n; })), []);
  // A fresh read is the truth again.
  useEffect(() => { setGone(new Set()); }, [data]);

  const live = items.filter(x => !gone.has(x.key));
  const hasOthers = live.some(x => !x.mine);
  const mineCount = live.filter(x => x.mine).length;
  const scoped = scope === "mine" && hasOthers ? live.filter(x => x.mine) : live;
  const capped = !more && scoped.length > CAP + 1;
  const visible = capped ? scoped.slice(0, CAP) : scoped;

  const leave = (key: string) => { setOpen(null); setRowErr(null); setGone(g => new Set(g).add(key)); };
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = FadeOutLeft.duration(m.t(m.reduced ? 160 : 260)).reduceMotion(ReduceMotion.Never);
  const enter = FadeIn.duration(m.t(220)).reduceMotion(ReduceMotion.Never);


  function row(it: PlateItem) {
    const isOpen = open === it.key;
    let icon: IconName, tone: Tone, title: string, meta: { text: string; late?: boolean }[], action: React.ReactNode = null, drawer: React.ReactNode = null;
    const toggle = (label: string) => <Btn label={isOpen ? "Close" : label} icon={isOpen ? "x" : undefined} ghost={isOpen} onPress={() => { setRowErr(null); setOpen(isOpen ? null : it.key); }} />;
    switch (it.kind) {
      case "task": {
        icon = "box"; tone = it.lane === "late" ? "peach" : "mint"; title = it.title;
        meta = it.dueDate == null ? [{ text: "No due date" }]
          : it.lane === "late" ? [{ text: `Due ${when(it.dueDate, today)} · ` }, { text: `${plural(it.daysLate, "day")} late`, late: true }]
          : [{ text: `Due ${when(it.dueDate, today)}` }];
        const task = data.tasks.find(t => t.id === it.id);
        action = task ? <Btn label="Mark done" icon="check" onPress={() => { leave(it.key); tickTask(task, true); }} /> : null;
        break;
      }
      case "poll": {
        icon = "chat"; tone = "lilac"; title = `Vote: ${it.question}`;
        meta = it.closeDate ? (it.lane === "today" ? [{ text: "Closes today", late: true }] : [{ text: `Closes ${when(it.closeDate, today)}` }]) : [{ text: "Open until it's closed" }];
        action = toggle("Vote");
        const chosen = pick[it.id];
        drawer = (
          <View style={styles.dr}>
            <T v="meta" color={c.ink2}>Pick one. Your vote counts once you cast it.</T>
            <View style={styles.opts} accessibilityRole="radiogroup">
              {it.options.map(o => {
                const on = chosen === o.id;
                return (
                  <Pressable key={o.id} onPress={() => { haptics.select(); setPick(p => ({ ...p, [it.id]: o.id })); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={[styles.opt, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.pastel.lilac.soft : c.card }]}>
                    <T v="callout" size={13.6}>{o.label}</T>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.acts}>
              <Btn label="Not now" ghost onPress={() => setOpen(null)} />
              <Btn label={busy === it.key ? "Casting…" : "Cast vote"} icon="check" solid disabled={chosen == null || busy === it.key} onPress={async () => {
                if (chosen == null) return;
                setBusy(it.key);
                try {
                  await postVote(it.id, chosen);
                  haptics.success();
                  leave(it.key);
                  toast.show("Vote cast", { detail: it.question });
                  void refreshHome();
                } catch {
                  haptics.error();
                  setRowErr({ key: it.key, msg: "That vote didn't go through. Try again." });
                } finally { setBusy(null); }
              }} />
            </View>
          </View>
        );
        break;
      }
      case "wrap-up": {
        icon = "clip"; tone = "rose"; title = `Wrap up ${it.title}`;
        meta = [{ text: `${it.dueDate ? `Happened ${when(it.dueDate, today)}` : "Happened"} · ` }, { text: "not wrapped up yet", late: true }];
        action = <Btn label="Wrap up" after="arrow-r" onPress={() => router.push("/more/programming" as Href)} />;
        break;
      }
      case "fundraiser": {
        icon = "jar"; tone = "butter"; title = `Count up ${it.name}`;
        meta = it.daysAgo === 0 ? [{ text: "Today · type in what came in once it's over" }] : [{ text: `Happened ${when(it.date, today)} · ` }, { text: "not counted yet", late: true }];
        action = <Btn label="Wrap up" after="arrow-r" onPress={() => router.push(`/more/fundraiser/${it.id}?wrap=1` as Href)} />;
        break;
      }
      case "reimbursement": {
        icon = "receipt"; tone = "sky"; title = `${plural(it.requests.length, "reimbursement")} to review · ${fmt$(it.total)}`;
        meta = [{ text: it.requests.slice(0, 3).map(r => `${first(r.name)} ${fmt$(r.amount)}`).join(" · ") + (it.requests.length > 3 ? " · …" : "") }];
        action = toggle("Review");
        const act = async (ids: number[], status: "approved" | "rejected") => {
          setBusy(it.key); setRowErr(null);
          let ok = 0;
          for (const id of ids) { try { await reviewReimbursement(id, status); ok++; } catch (e) { setRowErr({ key: it.key, msg: errorMessage(e, "Some of those didn't save. Try again.") }); } }
          setBusy(null);
          if (ok < ids.length) { haptics.error(); return; }
          if (status === "approved") haptics.success(); else haptics.tap();
          const who = ids.length === 1 ? first(it.requests.find(r => r.id === ids[0])?.name ?? "") : `All ${ids.length}`;
          toast.show(`${who} ${status}`);
          if (ids.length === it.requests.length) leave(it.key);
          void refreshHome();
        };
        drawer = (
          <View style={styles.dr}>
            <T v="meta" color={c.ink2}>Approving records it as an expense in Treasury.</T>
            {it.requests.map(r => (
              <View key={r.id} style={[styles.rq, { borderColor: c.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="bodyStrong" size={13.6} numberOfLines={1}>{`${r.name} · ${fmt$(r.amount)}`}</T>
                  <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{`${r.description} · ${when(r.date, today)}`}</T>
                </View>
                <Pressable disabled={busy === it.key} onPress={() => act([r.id], "rejected")} style={({ pressed }) => [[styles.mini, { borderColor: c.line2 }], pressed && pressedDim]} accessibilityRole="button" accessibilityLabel={`Reject ${r.name}`}>
                  <T v="buttonSm" size={12}>Reject</T>
                </Pressable>
                <Pressable disabled={busy === it.key} onPress={() => act([r.id], "approved")} style={({ pressed }) => [[styles.mini, { borderColor: c.pastel.mint.border, backgroundColor: c.pastel.mint.soft }], pressed && pressedDim]} accessibilityRole="button" accessibilityLabel={`Approve ${r.name}`}>
                  <T v="buttonSm" size={12} color={c.pastel.mint.ink}>Approve</T>
                </Pressable>
              </View>
            ))}
            <View style={styles.acts}>
              <Btn label="Close" ghost onPress={() => setOpen(null)} />
              {it.requests.length > 1 ? <Btn label={`Approve all ${it.requests.length}`} icon="check" disabled={busy === it.key} onPress={() => act(it.requests.map(r => r.id), "approved")} /> : null}
            </View>
          </View>
        );
        break;
      }
      case "dues": {
        icon = "wallet"; tone = "butter"; title = `${fmt$(it.total)} in ${duesWord.toLowerCase()} outstanding`;
        meta = [
          { text: `${it.count} ${memberWord(it.count !== 1).toLowerCase()}` },
          ...(it.overdue > 0 ? [{ text: " · " }, { text: `${it.overdue} overdue`, late: true }] : []),
          { text: ` · ${it.top.map(b => `${first(b.name)} ${fmt$(b.amount)}`).join(", ")}${it.count > 3 ? "…" : ""}` },
        ];
        action = <Btn label={`Open ${duesWord.toLowerCase()}`} after="arrow-r" onPress={() => router.push("/more/treasury" as Href)} />;
        break;
      }
      case "my-dues": {
        icon = "wallet"; tone = "butter"; title = `You owe ${fmt$(it.amount)} in ${duesWord.toLowerCase()}`;
        meta = it.lateDays > 0 ? [{ text: `${plural(it.lateDays, "day")} overdue`, late: true }] : [{ text: "Unpaid balance" }];
        action = <Btn label={`See ${duesWord.toLowerCase()}`} after="arrow-r" onPress={() => router.push("/more/dues" as Href)} />;
        break;
      }
      default: return null;
    }

    const tag = it.mine
      ? (hasOthers && scope === "all" ? "for you" : null)
      : it.kind === "task" ? (it.assignees === "Unassigned" ? "unassigned" : `${it.assignees}'s`)
      : `as ${it.as ? roleNames[it.as] ?? "officer" : "officer"}`;

    return (
      <Animated.View key={it.key} layout={layout} entering={enter} exiting={exit}
        style={[styles.it, { borderColor: isOpen ? c.ink : c.line, backgroundColor: c.card }]}>
        <View style={styles.r}>
          <Tile icon={icon} tone={tone} size={32} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T v="bodyStrong" size={14.1} numberOfLines={2}>{title}</T>
            <T v="meta" size={12} color={c.ink3} numberOfLines={2}>
              {meta.map((p, k) => <T key={k} v="meta" size={12} color={p.late ? c.pastel.peach.ink : c.ink3}>{p.text}</T>)}
            </T>
            {tag ? <T v="kicker" size={9.5} color={it.mine ? c.pastel.mint.ink : c.ink3}>{tag}</T> : null}
          </View>
        </View>
        {action ? <View style={styles.actRow}>{action}</View> : null}
        {isOpen ? <Animated.View entering={enter}>{drawer}</Animated.View> : null}
        {isOpen && rowErr?.key === it.key ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{rowErr.msg}</T> : null}
      </Animated.View>
    );
  }

  const left = scoped.length;
  return (
    <DashCard icon="flag" tone="peach" title="On your plate" i={i}
      right={left > 0 ? <CountChip label={`${left} left`} /> : hasData ? <CountChip label="all clear" tone="mint" /> : null}>
      {!live.length ? (
        hasData ? (
          <View style={styles.clear}>
            <View style={[styles.stamp, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={11} color={c.pastel.mint.ink}>All clear</T></View>
            <T v="meta" color={c.ink2}>Nothing's waiting on you right now.</T>
          </View>
        ) : (
          <View style={styles.hello}>
            <Tile icon="mug" tone="peach" size={36} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Nothing here yet.</T>
              <T v="meta" color={c.ink2}>Tasks, votes and anything else waiting on you will show up here.</T>
            </View>
          </View>
        )
      ) : (
        <>
          {hasOthers ? (
            <View style={[styles.scope, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist">
              {(["mine", "all"] as const).map(s => {
                const on = scope === s;
                return (
                  <Pressable key={s} onPress={() => { if (!on) { haptics.select(); setScope(s); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={[styles.scopeB, on && { backgroundColor: c.card, borderColor: c.line2 }]}>
                    <T v="buttonSm" size={12.6} color={on ? c.ink : c.ink3}>{s === "mine" ? "You" : "All"}</T>
                    <T v="mono" size={11} color={c.ink3}>{String(s === "mine" ? mineCount : live.length)}</T>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {!scoped.length ? (
            <View style={styles.clear}>
              <View style={[styles.stamp, { borderColor: c.pastel.mint.ink }]}><T v="kicker" size={11} color={c.pastel.mint.ink}>All clear</T></View>
              <T v="meta" color={c.ink2}>{`Nothing's waiting on you. ${live.length} more across the chapter ${live.length === 1 ? "is" : "are"} under All.`}</T>
              <Btn label={`Show all ${live.length}`} after="arrow-r" onPress={() => setScope("all")} />
            </View>
          ) : (
            <Animated.View layout={layout} style={{ gap: 14 }}>
              {LANES.map(([lane, label]) => {
                const rows = visible.filter(x => x.lane === lane);
                if (!rows.length) return null;
                const n = scoped.filter(x => x.lane === lane).length;
                const ink = lane === "late" ? c.pastel.peach.ink : lane === "today" ? c.pastel.butter.ink : c.pastel.sky.ink;
                return (
                  <Animated.View key={lane} layout={layout} style={{ gap: 8 }}>
                    <View style={styles.laneH}>
                      <View style={[styles.laneRule, { backgroundColor: ink }]} />
                      <T v="kicker" size={10.2} color={ink}>{label}</T>
                      <T v="kicker" size={10.2} color={c.ink3}>{String(n)}</T>
                    </View>
                    {rows.map(row)}
                  </Animated.View>
                );
              })}
            </Animated.View>
          )}
          {scoped.length > CAP + 1 ? (
            <Pressable onPress={() => setMore(v => !v)} style={({ pressed }) => [styles.more, pressed && pressedDim]} accessibilityRole="button">
              <T v="buttonSm" size={12.6} color={c.ink2}>{more ? "Show less" : `Show ${scoped.length - CAP} more`}</T>
            </Pressable>
          ) : null}
        </>
      )}
    </DashCard>
  );
}

const styles = StyleSheet.create({
  it: { borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 10 },
  r: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  actRow: { flexDirection: "row", paddingLeft: 43 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, alignSelf: "flex-start" },
  dr: { gap: 10, paddingTop: 2 },
  opts: { gap: 6 },
  opt: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  acts: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  rq: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  mini: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5 },
  scope: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 2, borderRadius: 999, borderWidth: 1.5 },
  scopeB: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: "transparent" },
  laneH: { flexDirection: "row", alignItems: "center", gap: 8 },
  laneRule: { width: 14, height: 2, borderRadius: 1 },
  clear: { alignItems: "flex-start", gap: 8 },
  stamp: { paddingVertical: 3, paddingHorizontal: 9, borderWidth: 2, borderRadius: 6, transform: [{ rotate: "-3deg" }] },
  hello: { flexDirection: "row", alignItems: "center", gap: 12 },
  more: { alignSelf: "center", paddingVertical: 6 },
});
