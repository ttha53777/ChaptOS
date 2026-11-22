/**
 * The Fundraisers sheets (app/org/[slug]/fundraisers/NewFundraiserDialog, on the phone),
 * and the jar moment:
 *
 *   Composer     New fundraiser / Edit fundraiser: Name it (the name guesses the kind,
 *                which picks the suggested shopping list), Day, Time optional "to",
 *                Where optional, Goal optional. Saves itself, as the web's dialog does,
 *                and hands back the server's copy; a refusal stays in the sheet.
 *   JarMoment    after the server has the wrap-up: the jar fills over the page and the
 *                WRAPPED / SHORT stamp slams onto it (the success tap lands on impact).
 *                Tap anywhere, or it lets go by itself.
 */
import type { Fundraiser } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { localDay } from "~/data/home";
import { createFundraiser, patchFundraiser } from "~/data/fundraisers";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { deviceZone } from "~/meetings/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import type { Tone } from "~/theme/palette";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { FormField, FormLabel } from "~/ui/WhenFields";
import { Cal, MoneyJar } from "./bits";
import { $m, COMPOSE, DETAIL, FUNDRAISER_KINDS, composeBody, errorText, kindOf } from "./model";

const toMin = (t: string | null | undefined) => {
  if (!t) return null;
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};
const toHHMM = (n: number | null) => (n == null ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`);

/* ── New fundraiser / Edit fundraiser ─────────────────────────────────────────── */

export function Composer({ open, editing, onClose, onSaved }: {
  open: boolean;
  /** Present = edit this one (PATCH) instead of creating. */
  editing: Fundraiser | null;
  onClose: () => void;
  onSaved: (f: Fundraiser) => void;
}) {
  const { c } = useTheme();
  const term = useEntryOf("ready")?.me?.org?.activeTerm ?? null;
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [t0, setT0] = useState<number | null>(null);
  const [t1, setT1] = useState<number | null>(null);
  const [place, setPlace] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? ""); setDate(editing?.date ?? localDay());
    setT0(toMin(editing?.startTime)); setT1(toMin(editing?.endTime));
    setPlace(editing?.place ?? ""); setGoal(editing?.goal ? String(editing.goal) : "");
    setBusy(false); setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const nm = name.trim(), k = kindOf(nm), K = FUNDRAISER_KINDS[k];

  const submit = async () => {
    if (!nm || !date || busy) return;
    setBusy(true); setError(null);
    const body = composeBody({ name: nm, date, t0: toHHMM(t0), t1: toHHMM(t1), place, goal }, deviceZone());
    try {
      const saved = editing ? await patchFundraiser(editing.id, body) : await createFundraiser(body);
      haptics.success();
      onSaved(saved);
    } catch (e) {
      haptics.error();
      setError(errorText(e, COMPOSE.failed(!!editing)));
      setBusy(false);
    }
  };

  const footer = (
    <View style={{ gap: 10, flex: 1 }}>
      {error ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{error}</T> : null}
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{COMPOSE.note(!!editing)}</T>
      <View style={styles.footBtns}>
        <Button label={COMPOSE.cancel} variant="ghost" onPress={onClose} disabled={busy} />
        <Button label={COMPOSE.go(!!editing, busy)} tone="butter" icon="arrow-r" onPress={() => void submit()} disabled={!nm || !date || busy} />
      </View>
    </View>
  );

  return (
    <Sheet open={open} onClose={() => { if (!busy) onClose(); }} size="tall" tone="butter" icon="jar" title={COMPOSE.eyebrow(!!editing)} footer={footer}>
      <View style={{ gap: 18 }}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 8 }}>
            <FormField value={name} onChange={setName} placeholder={COMPOSE.namePh} label="Name" autoFocus={!editing} />
            <View accessibilityLiveRegion="polite">
              {!nm ? <T v="meta" color={c.ink3}>{COMPOSE.hintEmpty}</T>
                : k === "other" ? <T v="meta" color={c.ink3}>{COMPOSE.hintOther}</T>
                : (
                  <View style={styles.hint}>
                    <KindTag icon={K.icon as IconName} label={K.label} hue={K.hue as Tone} />
                    <T v="meta" color={c.ink3} style={{ flexShrink: 1 }}>{COMPOSE.hintKind(k)}</T>
                  </View>
                )}
            </View>
          </View>
          <Cal date={date || null} size={52} />
        </View>
        <View>
          <FormLabel text={COMPOSE.day} />
          <DayStrip value={date} onChange={d => { haptics.select(); setDate(d); }} today={localDay()} term={term} usualDow={null} taken={new Set()} editing={!!editing} open={open} />
        </View>
        <View>
          <FormLabel text={COMPOSE.time} opt={COMPOSE.optional} />
          <View accessibilityLabel={COMPOSE.time}><Clock minutes={t0} onChange={m => { setT0(m); if (m == null) setT1(null); }} tone="butter" /></View>
          {t0 != null ? (
            <View style={{ marginTop: 10 }}>
              <T v="meta" color={c.ink3} style={{ marginBottom: 6 }}>{COMPOSE.to}</T>
              <View accessibilityLabel={COMPOSE.to}><Clock minutes={t1} onChange={setT1} tone="butter" /></View>
            </View>
          ) : null}
        </View>
        <View>
          <FormLabel text={COMPOSE.where} opt={COMPOSE.optional} />
          <FormField value={place} onChange={setPlace} placeholder={COMPOSE.wherePh} label={COMPOSE.where} />
        </View>
        <View>
          <FormLabel text={COMPOSE.goal} opt={COMPOSE.optional} />
          <FormField value={goal} onChange={setGoal} placeholder={COMPOSE.goalPh} label={COMPOSE.goal} keyboardType="decimal-pad" />
        </View>
      </View>
    </Sheet>
  );
}

function KindTag({ icon, label, hue }: { icon: IconName; label: string; hue: Tone }) {
  const { c } = useTheme();
  const p = c.pastel[hue];
  return (
    <View style={[styles.kind, { backgroundColor: p.soft, borderColor: p.border }]}>
      <Icon name={icon} size={12} color={p.ink} />
      <T v="meta" color={p.ink} style={{ fontSize: 12, fontWeight: "600" }}>{label}</T>
    </View>
  );
}

/* ── the jar moment ───────────────────────────────────────────────────────────── */

export function JarMoment({ f, onDone }: { f: Fundraiser | null; onDone: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  useEffect(() => {
    if (!f) return;
    const t = setTimeout(onDone, m.reduced ? 1800 : 2800);
    return () => clearTimeout(t);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const made = f.made ?? 0, loss = made < 0;
  const tone = loss ? c.pastel.rose : c.pastel.mint;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: alpha(c.paper, 0.94) }]}>
        <Pressable style={styles.moment} onPress={onDone} accessibilityRole="button" accessibilityLabel={`${DETAIL.kick(loss)} ${$m(Math.abs(made))}. Tap to close.`}>
          <T v="kicker" color={tone.ink}>{DETAIL.kick(loss)}</T>
          <View style={[styles.big, { backgroundColor: tone.fill }]}><T v="hero" size={48}>{$m(Math.abs(made))}</T></View>
          <MoneyJar uid="moment" sup={f.spent} goal={f.goal} inn={f.cameIn} stamp={loss ? "SHORT" : "WRAPPED"} slam width={220} />
          <T v="meta" color={c.ink3}>{f.name}</T>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  hint: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  kind: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  footBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  moment: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  big: { paddingHorizontal: 12, borderRadius: 8, transform: [{ rotate: "-1deg" }] },
});
