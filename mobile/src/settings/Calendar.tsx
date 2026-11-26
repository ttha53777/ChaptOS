/**
 * Settings → Calendar subscription (the web's <CalendarSubscription settings /> at phone
 * width: CalendarSettings, AdminReadiness, BlockingItem, UnconfirmedTime, TellMembers).
 * Every word and rule from @/lib/settings/calendar.
 *
 * Everyone reaches the page. Members see who can turn it on, or where to add it (the
 * app's Timeline "Add to my calendar" sheet). Org admins get the checklist:
 *
 *   status pill + health line
 *   off:  Time zone step (this device's zone until saved; Change opens the zone field),
 *         the blocking items with their in-place fixes, then Turn on for members (or
 *         "Turning on…" while the worker checks; polled every 4 s), why it's blocked
 *   on:   the Time zone row, Advanced (Regenerate URL with its warning, Turn off)
 *   events whose typed time can't be read (Set time → the When fields), other notes
 *   Tell your members: the group-chat message with Copy message
 */
import type { CalendarFeedIssue, CalendarSubscriptionView } from "@/lib/api-types";
import { parseLegacyTime } from "@/lib/calendar-feed/legacy-time";
import {
  CALENDAR_COPY as CC, TELL_PATH, blockReason as blockReasonOf, blockingText, healthLine, noteText, splitIssues, statusPill, tellMessage, zoneName,
} from "@/lib/settings/calendar";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { changeFeed, deleteLegacyEntry, setEventSchedule, useCalendarAdmin, type FeedAction } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { deviceZone } from "~/meetings/model";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { initialWhen, scheduleOf, WhenFields, type When } from "~/ui/WhenFields";
import { Note, ScBtn, ScCard, ScPill } from "./ledger";
import { webOrigin } from "./model";

/** IANA zones this runtime knows (Hermes may not list them; then typing one still works). */
function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try { return intl.supportedValuesOf?.("timeZone") ?? []; } catch { return []; }
}
function validZone(zone: string): boolean {
  if (!zone || !zone.includes("/") && zone !== "UTC") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function CalendarSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const [poll, setPoll] = useState(false);
  const q = useCalendarAdmin(poll);
  const data = q.data;
  useEffect(() => { setPoll(!!data?.validating); }, [data?.validating]);
  if (!me) return null;

  return (
    <View style={{ gap: 16 }}>
      {q.isError ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{errorMessage(q.error, CC.loadFailed)}</T> : null}
      {!data && !q.isError ? <Note>{CC.loading}</Note> : null}
      {data && !data.url && !data.admin ? <Note>{CC.offForMembers}</Note> : null}
      {data?.url && !data.admin ? (
        <Note>
          {CC.membersAddFrom[0]}
          <T v="meta" size={12.8} color={c.pastel.lilac.ink} style={{ textDecorationLine: "underline" }} onPress={() => router.push("/timeline?subscribe=1" as Href)}>{CC.membersAddFrom[1]}</T>
          {CC.membersAddFrom[2]}
        </Note>
      ) : null}
      {data?.admin ? <AdminReadiness data={data} /> : null}
      {data?.url && data.admin ? <TellMembers orgName={data.orgName} slug={me.org?.slug ?? ""} /> : null}
    </View>
  );
}

function AdminReadiness({ data }: { data: CalendarSubscriptionView }) {
  const { c } = useTheme();
  const device = deviceZone();
  const [zone, setZone] = useState(data.timeZone ?? (validZone(device) ? device : ""));
  const [editingZone, setEditingZone] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [turnOnFailed, setTurnOnFailed] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  // Say so if a turn-on we watched didn't take.
  const wasTurningOn = useRef(false);
  useEffect(() => {
    if (data.validating) { if (data.turningOn) wasTurningOn.current = true; return; }
    if (wasTurningOn.current) { wasTurningOn.current = false; setTurnOnFailed(!data.enabled); if (data.enabled) haptics.success(); }
  }, [data.validating, data.turningOn, data.enabled]);

  const { blocking, unconfirmed, notes } = splitIssues(data.issues);
  const zoneValid = validZone(zone);
  const pill = statusPill(data);
  const health = healthLine(data);
  const blockReason = blockReasonOf(data, blocking.length, zoneValid);

  const change = async (body: FeedAction) => {
    setBusy(true); setErr("");
    try { await changeFeed(body); haptics.success(); return true; }
    catch (e) { haptics.error(); setErr(errorMessage(e, CC.updateFailed)); return false; }
    finally { setBusy(false); }
  };
  const turnOn = async () => {
    setTurnOnFailed(false);
    if (await change(zone !== data.timeZone ? { action: "turnOn", timeZone: zone } : { action: "turnOn" })) setEditingZone(false);
  };
  const saveZone = async () => { if (await change({ action: "timeZone", timeZone: zone })) setEditingZone(false); };

  const zoneField = <ZoneField zone={zone} onChange={setZone} device={device} />;
  const zoneSummary = (
    <T v="body" size={14}>
      {zoneName(zone)}{" "}
      <T v="mono" size={11.5} color={c.ink3}>{zone}</T>
      {!data.timeZone ? <T v="meta" size={12.8} color={c.ink3}>{CC.fromDevice}</T> : null}
      {" · "}
      <T v="body" size={14} color={c.pastel.lilac.ink} style={{ textDecorationLine: "underline" }} onPress={() => setEditingZone(true)} accessibilityRole="button">{CC.change}</T>
    </T>
  );

  return (
    <View style={{ gap: 16 }}>
      {err ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{err}</T> : null}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }} accessibilityLiveRegion="polite">
        <ScPill tone={pill.tone} label={pill.label} />
        {health ? <T v="meta" size={12.8} color={health.error ? c.pastel.rose.ink : c.ink3} style={health.error ? { fontWeight: "600" } : undefined}>{health.text}</T> : null}
      </View>

      {!data.enabled ? (
        <>
          <ScCard pad>
            <CheckStep n={blocking.length ? 1 : undefined} done={Boolean(data.timeZone) && zone === data.timeZone && !editingZone} title={CC.timeZone} last={blocking.length === 0}>
              {editingZone || !zoneValid ? zoneField : zoneSummary}
              <Note>{CC.zoneNote}</Note>
              {editingZone && data.timeZone ? (
                <View style={styles.btnRow}>
                  <ScBtn label={CC.saveZone} disabled={busy || !zoneValid || zone === data.timeZone} onPress={() => void saveZone()} />
                  <ScBtn label={CC.cancel} onPress={() => { setZone(data.timeZone!); setEditingZone(false); }} />
                </View>
              ) : null}
            </CheckStep>
            {blocking.length > 0 ? (
              <CheckStep n={2} done={false} title={CC.fixTitle(blocking.length)} last>
                <View style={{ gap: 12 }}>{blocking.map(issue => <BlockingItem key={`${issue.source}:${issue.id}`} issue={issue} />)}</View>
              </CheckStep>
            ) : null}
          </ScCard>

          {data.turningOn ? (
            <Note><T v="meta" size={12.8} color={c.ink} style={{ fontWeight: "700" }}>{CC.turningOn[0]}</T>{CC.turningOn[1]}</Note>
          ) : (
            <View style={{ gap: 10 }}>
              <ScBtn kind="primary" label={CC.turnOn} disabled={busy || Boolean(blockReason) || Boolean(data.validating)} onPress={() => void turnOn()} />
              {data.validating ? <Note>{CC.checking}</Note> : null}
              {blockReason ? <Note>{blockReason}</Note> : null}
              {!blockReason ? <Note>{CC.thenMembers(data.orgName).join("")}</Note> : null}
              {turnOnFailed ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{CC.turnOnFailed}</T> : null}
            </View>
          )}
        </>
      ) : (
        <ScCard pad>
          <CheckStep done={false} title={CC.timeZone} last>
            {editingZone ? (
              <>
                {zoneField}
                <View style={styles.btnRow}>
                  <ScBtn kind="primary" label={CC.saveZone} disabled={busy || !zoneValid || zone === data.timeZone} onPress={() => void saveZone()} />
                  <ScBtn label={CC.cancel} onPress={() => { setZone(data.timeZone ?? ""); setEditingZone(false); }} />
                </View>
                <Note>{CC.zoneChangeNote}</Note>
              </>
            ) : zoneSummary}
          </CheckStep>
        </ScCard>
      )}

      {unconfirmed.length > 0 ? (
        <Details initiallyOpen={unconfirmed.length <= 5}
          summary={<T v="body" size={13.4} color={c.ink2}><T v="bodyStrong" size={13.4}>{CC.unconfirmedHead(unconfirmed.length).join("")}</T>{CC.unconfirmedTail}</T>}>
          <ScCard>{unconfirmed.map((issue, i) => <UnconfirmedTime key={issue.id} issue={issue} zone={data.timeZone || device} last={i === unconfirmed.length - 1} />)}</ScCard>
        </Details>
      ) : null}

      {notes.length > 0 ? (
        <Details summary={<T v="body" size={13.4} color={c.ink2}>{CC.notesHead(notes.length).join("")}</T>}>
          <View style={{ gap: 6, paddingLeft: 4 }}>
            {notes.map(issue => (
              <T key={`${issue.source}:${issue.id}`} v="meta" size={12.8} color={c.ink2}><T v="meta" size={12.8} color={c.ink} style={{ fontWeight: "700" }}>{issue.title}</T>{`: ${noteText(issue)}`}</T>
            ))}
          </View>
        </Details>
      ) : null}

      {data.enabled ? (
        <Details summary={<T v="body" size={13.4} color={c.ink2}>{CC.advanced}</T>} open={advanced} onToggle={setAdvanced}>
          <View style={{ gap: 10 }}>
            {!rotate ? (
              <View style={styles.btnRow}>
                <ScBtn label={CC.regenerate} disabled={busy} onPress={() => setRotate(true)} />
                <ScBtn label={CC.turnOff} disabled={busy} onPress={() => void change({ action: "disable" })} />
              </View>
            ) : null}
            <Note>{CC.turnOffNote}</Note>
            {rotate ? (
              <View style={{ gap: 8 }} accessibilityRole="alert">
                <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }}>{CC.rotateWarn}</T>
                <View style={styles.btnRow}>
                  <ScBtn kind="danger" label={CC.rotateConfirm} disabled={busy} onPress={async () => { if (await change({ action: "rotate" })) setRotate(false); }} />
                  <ScBtn label={CC.rotateKeep} onPress={() => setRotate(false)} />
                </View>
              </View>
            ) : null}
          </View>
        </Details>
      ) : null}
    </View>
  );
}

/** `.cal-check` row: the numbered disc (ticked when done; no number when it's the only row), title, body. */
function CheckStep({ n, done, title, last, children }: { n?: number; done: boolean; title: string; last?: boolean; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.step, !last && { borderBottomWidth: 1, borderBottomColor: c.card2 }]}>
      {n != null ? (
        <View style={[styles.stepN, { borderColor: c.ink, backgroundColor: done ? c.ink : c.card }]}>
          {done ? <Icon name="check" size={12} color={c.paper} /> : <T v="buttonSm" size={12} color={c.ink}>{String(n)}</T>}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <T v="bodyStrong" size={14.4} accessibilityLabel={done ? `${title} (done)` : title}>{title}</T>
        {children}
      </View>
    </View>
  );
}

/** The web's <details>: a chevron summary that folds its body. */
function Details({ summary, children, initiallyOpen = false, open: controlled, onToggle }: {
  summary: ReactNode; children: ReactNode; initiallyOpen?: boolean; open?: boolean; onToggle?: (v: boolean) => void;
}) {
  const { c } = useTheme();
  const [own, setOwn] = useState(initiallyOpen);
  const open = controlled ?? own;
  const flip = () => { (onToggle ?? setOwn)(!open); };
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={flip} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => [styles.summary, pressed && pressedDim]}>
        <View style={{ marginTop: 3 }}><Icon name={open ? "chev-d" : "chev-r"} size={13} color={c.ink2} /></View>
        <View style={{ flex: 1 }}>{summary}</View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ZoneField({ zone, onChange, device }: { zone: string; onChange: (z: string) => void; device: string }) {
  const { c } = useTheme();
  const zones = useMemo(allZones, []);
  const [focused, setFocused] = useState(false);
  const needle = zone.trim().toLowerCase().replace(/\s+/g, "_");
  const matches = focused && needle && !validZone(zone)
    ? zones.filter(z => z.toLowerCase().includes(needle)).slice(0, 6)
    : [];
  return (
    <View style={{ gap: 6 }}>
      <T v="meta" size={11.8} color={c.ink2} style={{ fontWeight: "600" }}>{CC.zoneLabel}</T>
      <TextInput value={zone} onChangeText={onChange} placeholder={CC.zonePlaceholder} placeholderTextColor={c.ink3} autoCapitalize="none" autoCorrect={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel={CC.zoneLabel}
        style={[styles.input, { borderColor: c.line2, backgroundColor: c.card, color: c.ink }]} />
      {matches.length ? (
        <View style={[styles.matches, { borderColor: c.line2, backgroundColor: c.card }]}>
          {matches.map(z => (
            <Pressable key={z} onPress={() => { haptics.select(); onChange(z); }} accessibilityRole="button" accessibilityLabel={z}
              style={({ pressed }) => [styles.match, pressed && { backgroundColor: c.card2 }]}>
              <T v="body" size={14}>{zoneName(z)}</T>
              <T v="mono" size={11} color={c.ink3}>{z}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {device && zone !== device && validZone(device) ? (
        <T v="meta" size={12.8} color={c.pastel.lilac.ink} style={{ textDecorationLine: "underline" }} onPress={() => onChange(device)} accessibilityRole="button">
          {CC.useDeviceZone(zoneName(device)).join("")}
        </T>
      ) : null}
    </View>
  );
}

function BlockingItem({ issue }: { issue: CalendarFeedIssue }) {
  const { c } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");
  const legacy = issue.kind === "legacy-deadline";
  const open = () => {
    if (issue.kind === "unlinked-service") router.push("/more/service" as Href);
    else if (issue.kind === "unlinked-party") router.push("/more/parties" as Href);
    else router.push(`/timeline?event=${issue.id}` as Href);
  };
  const run = async (fn: () => Promise<void>, fallback: string) => {
    setWorking(true); setErr("");
    try { await fn(); haptics.success(); }
    catch (e) { haptics.error(); setErr(errorMessage(e, fallback)); setWorking(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <T v="bodyStrong" size={14} color={c.pastel.lilac.ink} style={{ textDecorationLine: "underline" }} onPress={open} accessibilityRole="link">{issue.title}</T>
      <Note>{blockingText(issue)}</Note>
      {err ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{err}</T> : null}
      <View style={styles.btnRow}>
        {legacy && !confirming ? <ScBtn small label={CC.delete} disabled={working} onPress={() => setConfirming(true)} /> : null}
        {legacy && confirming ? (
          <>
            <ScBtn small kind="danger" label={CC.deleteEntry} disabled={working} onPress={() => void run(() => deleteLegacyEntry(issue.id), CC.deleteFailed)} />
            <ScBtn small label={CC.keep} disabled={working} onPress={() => setConfirming(false)} />
          </>
        ) : null}
        {issue.kind === "unlinked-service" ? (
          <ScBtn kind="accent" label={CC.addToTimeline} disabled={working} onPress={() => void run(() => changeFeed({ action: "link", source: "service", id: issue.id }), CC.linkFailed)} />
        ) : null}
      </View>
    </View>
  );
}

function UnconfirmedTime({ issue, zone, last }: { issue: CalendarFeedIssue; zone: string; last: boolean }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState<When>(() => {
    // Prefill what the text clearly says; the officer confirms it.
    const guess = parseLegacyTime(issue.time ?? "");
    return { ...initialWhen(null, zone, issue.date ?? ""), start: guess.start ? minutesOf(guess.start) : null, end: guess.end ? minutesOf(guess.end) : null };
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const r = scheduleOf(when, zone);
    if ("error" in r) { haptics.warn(); setErr(r.error); return; }
    setSaving(true); setErr("");
    try { await setEventSchedule(issue.id, r.schedule); haptics.success(); }
    catch (e) { haptics.error(); setErr(errorMessage(e, CC.timeFailed)); }
    finally { setSaving(false); }
  };
  return (
    <View style={[styles.uRow, !last && { borderBottomWidth: 1, borderBottomColor: c.card2 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong" size={14.4}>{issue.title}</T>
          <T v="meta" size={12.5} color={c.ink3}><T v="mono" size={11.5} color={c.ink3}>{issue.date ?? ""}</T>{` · “${issue.time ?? ""}”`}</T>
        </View>
        {!editing ? <ScBtn kind="accent" label={CC.setTime} onPress={() => setEditing(true)} /> : null}
      </View>
      {editing ? (
        <View style={{ gap: 10 }}>
          <WhenFields value={when} onChange={setWhen} label="When" err={err} open editing={false} term={null} orgZone={zone} tone="sky" />
          {err ? <T v="meta" size={12.8} color={c.pastel.rose.ink} style={{ fontWeight: "600" }} accessibilityRole="alert">{err}</T> : null}
          <View style={styles.btnRow}>
            <ScBtn kind="primary" label={CC.saveTime} disabled={saving} onPress={() => void save()} />
            <ScBtn label={CC.cancel} onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TellMembers({ orgName, slug }: { orgName: string; slug: string }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  const message = tellMessage(orgName, `${webOrigin()}/org/${slug}${TELL_PATH}`);
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(message);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      haptics.error();
      toast.error(CC.copyFailed);
    }
  };
  return (
    <ScCard style={{ padding: 14, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <T v="bodyStrong" size={14.4}>{CC.tellTitle}</T>
        <Note>{CC.tellNote}</Note>
      </View>
      <View style={[styles.msg, { borderColor: c.line2, backgroundColor: c.card }]}>
        <T v="body" size={13.4} color={c.ink2} selectable>{message}</T>
      </View>
      <ScBtn kind="primary" icon={copied ? "check" : undefined} label={copied ? CC.copied : CC.copyMessage} onPress={() => void copy()} />
    </ScCard>
  );
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  stepN: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  summary: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 11, height: 42, fontSize: 15 },
  matches: { borderWidth: 1.5, borderRadius: 10, overflow: "hidden" },
  match: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingVertical: 9, paddingHorizontal: 11 },
  uRow: { paddingVertical: 10, paddingHorizontal: 14, gap: 10 },
  msg: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
