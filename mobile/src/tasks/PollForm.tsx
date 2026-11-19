/**
 * The new / edit poll sheet for poll managers (MANAGE_POLLS), the web's PaperPollSheet
 * (app/org/[slug]/tasks/TaskSheets.tsx), checks and quick days from @/lib/tasks/list:
 *
 *   What are you asking   the question (300)
 *   The choices · 2 to 10 one field per choice, Add a choice; locked once votes are in
 *   Who votes             no picker: every new poll goes to the whole chapter, and all of
 *                         them must vote; an older targeted poll keeps its audience
 *   When it closes        Tomorrow · the coming Friday · Next week · Pick a date · When I close it
 *
 * The footer previews the card as it'll sit in Votes, then Cancel · Open the vote / Save.
 * POST /api/polls or PATCH /api/polls/[id] (choices only while nobody has voted).
 * DeletePoll is the web's confirm.
 */
import type { Poll } from "@/lib/api-types";
import { MON, dateOf, fmtDay, inTermOf, isoOf, plusDays, pollQuickDays, startOfToday, validatePoll } from "@/lib/tasks/list";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { createPoll, deletePoll, editPoll, useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { DayStrip } from "~/meetings/EventForm";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { TBtn } from "./List";
import { B, BigInput, Chip, Crowd, Head, Lab, PreviewRow, WhoTag } from "./TaskForm";

export function PollForm({ open, poll, onClose }: { open: boolean; poll: Poll | null; onClose: () => void }) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const roster = useRoster(open);
  const todayD = startOfToday();
  const today = isoOf(todayD);
  const term = me?.org?.activeTerm ?? null;
  const inTerm = inTermOf(term?.startDate, term?.endDate);
  const quick = pollQuickDays(todayD);
  const editing = !!poll;
  const legacy = !!poll && !poll.everyone;
  const optionsLocked = !!poll && poll.totalVotes > 0;

  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [close, setClose] = useState<string>("none");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaultClose = quick.find(x => x.label !== "Tomorrow" && inTerm(x.iso))?.iso ?? "none";
    setQuestion(poll?.question ?? "");
    setOpts(poll?.options.length ? poll.options.map(o => o.label) : ["", ""]);
    setClose(poll ? (poll.closeDate || "none") : defaultClose);
    setPicking(!!poll?.closeDate && !quick.some(x => x.iso === poll.closeDate));
    setBusy(false); setErr(null);
  }, [open, poll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const members = useMemo(() => {
    const list = roster.data ?? [];
    return [...list].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.name.localeCompare(b.name)));
  }, [roster.data, me?.id]);
  const n = members.length;
  const filled = opts.map(o => o.trim()).filter(Boolean);
  const cd = close !== "none" ? dateOf(close) : null;

  const save = async () => {
    if (busy) return;
    const closeIso = close !== "none" ? close : "";
    const problem = validatePoll({ question, options: opts, close: closeIso, initialClose: poll?.closeDate ?? undefined }, inTerm);
    if (problem) { haptics.error(); setErr(problem); return; }
    setBusy(true); setErr(null);
    try {
      if (poll) {
        await editPoll(poll.id, { question: question.trim(), closeDate: closeIso || null, ...(poll.totalVotes === 0 ? { options: filled } : {}) });
      } else {
        await createPoll({ question: question.trim(), options: filled, ...(closeIso ? { closeDate: closeIso } : {}) });
      }
      haptics.success();
      onClose();
    } catch {
      haptics.error();
      setErr("Could not save the poll. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} locked={busy} size="tall" tone="lilac" icon="bars" title={editing ? "Edit poll" : "New poll"}
      footer={
        <View style={{ gap: 10 }}>
          {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
          <T v="kicker" size={10.2} color={c.ink3}>How it’ll look in Votes</T>
          <PreviewRow tone="lilac" box title={question.trim()} placeholder="Your question" stubLabel="OPEN"
            stub={cd ? { mon: MON[cd.getMonth()]!, day: String(cd.getDate()) } : null}>
            {legacy
              ? <WhoTag label={`${poll!.assigneeCount} voters`} />
              : <><WhoTag icon="people" label="Everyone votes" strong /><T v="mono" size={10.9} color={c.ink3}>{`0 of ${n}`}</T></>}
            <T v="mono" size={10.9} color={c.ink3}>{`${filled.length} choice${filled.length === 1 ? "" : "s"}`}</T>
          </PreviewRow>
          <View style={styles.acts}>
            <View style={{ flex: 1 }} />
            <TBtn soft label="Cancel" onPress={onClose} />
            <TBtn label={busy ? "Saving…" : editing ? "Save" : "Open the vote"} tone="lilac" disabled={busy} onPress={() => void save()} />
          </View>
        </View>
      }>
      <View style={{ gap: 22 }}>
        <View style={{ gap: 8 }}>
          <Lab>What are you asking</Lab>
          <BigInput value={question} onChangeText={t => { setQuestion(t); setErr(null); }} placeholder="Where should we hold spring formal?" maxLength={300} autoFocus={!editing} tone="lilac" />
        </View>

        <View style={{ gap: 8 }}>
          <T v="label" color={c.ink2}>The choices <T v="label" color={c.ink3}>· 2 to 10</T></T>
          {optionsLocked ? (
            <>
              {opts.map((o, i) => (
                <View key={i} style={styles.popt}>
                  <View style={[styles.bx, { borderColor: c.line2 }]} />
                  <View style={[styles.locked, { borderColor: c.line2, backgroundColor: c.paper2 }]}><T v="body" color={c.ink2}>{o}</T></View>
                </View>
              ))}
              <View style={styles.hint}><Icon name="lock" size={13} color={c.ink3} /><T v="meta" color={c.ink3}>Votes are in, so the choices are locked.</T></View>
            </>
          ) : (
            <>
              {opts.map((o, i) => (
                <View key={i} style={styles.popt}>
                  <View style={[styles.bx, { borderColor: c.ink }]} />
                  <View style={{ flex: 1 }}>
                    <BigInput value={o} small tone="lilac" maxLength={120} placeholder={`Choice ${i + 1}`} accessibilityLabel={`Choice ${i + 1}`}
                      onChangeText={v => { setOpts(l => l.map((x, j) => (j === i ? v : x))); setErr(null); }}
                      returnKeyType={i === opts.length - 1 ? "done" : "next"} />
                  </View>
                  {opts.length > 2 ? (
                    <Pressable onPress={() => setOpts(l => l.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove choice ${i + 1}`} hitSlop={8} style={styles.rm}>
                      <Icon name="x" size={14} color={c.ink3} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {opts.length < 10 ? (
                <Pressable onPress={() => setOpts(l => [...l, ""])} accessibilityRole="button" style={styles.add}>
                  <Icon name="plus" size={15} color={c.ink2} /><T v="bodyStrong" size={14.4} color={c.ink2}>Add a choice</T>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Head label="Who votes" say={legacy ? <><B>{String(poll!.assigneeCount)}</B>{` ${poll!.assigneeCount === 1 ? "person" : "people"}`}</> : <>All <B>{String(n)}</B> must vote</>} />
          <View style={[styles.panel, { borderColor: c.ink, backgroundColor: c.paper2 }]}>
            {legacy
              ? <T v="callout" size={14} color={c.ink2}>{`This older poll goes to the ${poll!.assigneeCount === 1 ? "person" : "people"} it was sent to. New polls go to the whole chapter.`}</T>
              : <>
                  <Crowd people={members} mode="each" />
                  <T v="callout" size={14} color={c.ink2}><B s={14}>The whole chapter votes.</B>{` All ${n} ballots get collected. It sits on everyone’s plate until they vote, and anyone who joins later gets it too.`}</T>
                </>}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Lab>When it closes</Lab>
          <View style={styles.chips}>
            {quick.map(x => (
              <Chip key={x.iso} label={x.label} small={fmtDay(x.iso)} on={!picking && close === x.iso} disabled={!inTerm(x.iso)}
                onPress={() => { haptics.select(); setClose(x.iso); setPicking(false); setErr(null); }} />
            ))}
            <Chip label="Pick a date" icon="cal" on={picking} onPress={() => {
              haptics.select(); setPicking(true);
              setClose(close !== "none" && !quick.some(x => x.iso === close) ? close : isoOf(plusDays(todayD, 14))); setErr(null);
            }} />
            <Chip label="When I close it" on={close === "none"} onPress={() => { haptics.select(); setClose("none"); setPicking(false); setErr(null); }} />
          </View>
          {picking && close !== "none" ? (
            <DayStrip value={close} onChange={v => { setClose(v); setErr(null); }} today={today} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

export function DeletePoll({ poll, onClose }: { poll: Poll | null; onClose: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Poll | null>(null);
  useEffect(() => { if (poll) { setLast(poll); setBusy(false); } }, [poll]);
  const p = poll ?? last;
  const go = async () => {
    if (!p) return;
    setBusy(true);
    try { await deletePoll(p.id); haptics.soft(); onClose(); }
    catch (x) { haptics.error(); setBusy(false); toast.error("Could not delete the poll.", { detail: errorMessage(x) }); }
  };
  return (
    <Sheet open={!!poll} onClose={onClose} locked={busy} size="fit" tone="rose" icon="trash" title="Delete poll"
      footer={
        <View style={styles.acts}>
          <View style={{ flex: 1 }} />
          <TBtn soft label="Cancel" onPress={onClose} disabled={busy} />
          <TBtn label={busy ? "Deleting…" : "Delete"} tone="rose" onPress={() => void go()} disabled={busy} />
        </View>
      }>
      {p ? <T v="body" color={c.ink2}>{`Delete "${p.question}"? This deletes its votes too and can't be undone.`}</T> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  popt: { flexDirection: "row", alignItems: "center", gap: 10 },
  bx: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.6 },
  locked: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  rm: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 4 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6 },
  panel: { borderWidth: 1.5, borderRadius: 20, padding: 12, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  acts: { flexDirection: "row", alignItems: "center", gap: 10 },
});
