/**
 * Motion Lab: U4 Timeline & events. Every new motion, on local data (nothing here calls
 * the API): the supply pin (claim, unclaim, and a refused claim lifting back out), the
 * excuse note folding and filing (and lifting back out on a refusal), and an action item's
 * tick → strike.
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FiledNote, FILE_MS, type FileState } from "~/moments/ExcuseFile";
import { PIN_MS, PinnedTag } from "~/moments/Pin";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { toast } from "~/shell/toast";
import { CheckBox, StrikeTitle } from "~/tasks/bits";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Section } from "./sections";

const ITEMS = ["Speakers", "Ice", "Cups and napkins", "Extension cords"];

export function PinLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [mine, setMine] = useState<Set<number>>(new Set([0]));
  const toggle = (i: number) => {
    const on = !mine.has(i);
    if (!on) haptics.tap();
    setMine(s => { const n = new Set(s); if (on) n.add(i); else n.delete(i); return n; });
  };
  const refuse = () => {
    // claim Ice, then the "server" says no a beat later and the pin lifts back out
    haptics.tap();
    setMine(s => new Set(s).add(1));
    setTimeout(() => {
      haptics.error();
      setMine(s => { const n = new Set(s); n.delete(1); return n; });
      toast.error("Couldn't sign you up", { detail: "Someone else just claimed that." });
    }, m.t(PIN_MS + 400));
  };
  return (
    <Section title="Supply pin" note={`Claim: the pin falls 26pt at 1.5× (200ms, press), presses in at .88 with the soft haptic, springs back; the tag swings in from 9° (320ms). Unclaim plays it backwards in 220ms. A refused claim is the same unclaim, plus the error toast. ~${PIN_MS}ms. Reduced: 180ms fades.`}>
      <View style={[styles.board, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
        {ITEMS.map((t, i) => {
          const on = mine.has(i);
          return (
            <Pressable key={t} onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={[styles.item, { backgroundColor: c.card, borderColor: on ? c.ink : c.line }]}>
              <T v="callout" style={{ textAlign: "center" }}>{t}</T>
              <View style={styles.slot}>
                {!on ? <T v="pill" color={c.ink3} style={{ position: "absolute", bottom: 6 }}>I'll bring it</T> : null}
                <PinnedTag on={on} onPinned={() => haptics.soft()}>
                  <View style={[styles.who, { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }]}>
                    <T v="pill" color={c.pastel.mint.ink}>You</T>
                  </View>
                </PinnedTag>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Button label="Claim Ice, then refuse it" icon="alert" variant="ghost" tone="rose" onPress={refuse} />
    </Section>
  );
}

export function ExcuseFileLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [state, setState] = useState<FileState | null>(null);
  const [n, setN] = useState(0);
  const file = (refuse: boolean) => {
    setN(x => x + 1);
    setState("filing");
    if (refuse) setTimeout(() => {
      haptics.error();
      toast.error("Couldn't file that excuse", { detail: "Excuse already pending review" });
      setState("unfiling");
    }, m.t(FILE_MS + 500));
  };
  return (
    <Section title="Excuse filing" note={`The note drops 56pt while folding about its top edge (rotateX 0 → 62°, ${Math.round(FILE_MS * 0.6)}ms, flight), lands with the soft haptic, then opens flat at −1° (${Math.round(FILE_MS * 0.4)}ms, spring). A refusal lifts it back out (300ms) and the form would reopen with the words kept. Reduced: 180ms fades.`}>
      <View style={{ minHeight: 110, justifyContent: "flex-end" }}>
        {state ? (
          <FiledNote key={n} state={state} onLanded={() => haptics.soft()} onGone={() => setState(null)}>
            <View style={[styles.note, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
              <T v="kicker" color={c.pastel.butter.ink} style={{ fontSize: 10 }}>Waiting for review</T>
              <T v="body" color={c.note.ink}>“Away for Thanksgiving”</T>
            </View>
          </FiledNote>
        ) : <T v="meta" color={c.ink3}>Nothing filed.</T>}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="File it" icon="send" tone="butter" onPress={() => file(false)} style={{ flex: 1 }} />
        <Button label="File, then refuse" variant="ghost" tone="rose" onPress={() => file(true)} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

export function ActionItemLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [done, setDone] = useState(false);
  const tick = (refuse: boolean) => {
    const next = !done;
    if (next) haptics.success(); else haptics.tap();
    setDone(next);
    if (refuse) setTimeout(() => {
      haptics.error();
      setDone(!next);
      toast.error("Couldn't tick that off", { detail: "Only the person it's assigned to can tick it" });
    }, m.t(900));
  };
  return (
    <Section title="Action item tick" note="The minutes' action items use the Tasks check-tick and strike: box fills, the check is uncovered, a strike draws left to right through each line. A refusal undraws it.">
      <View style={[styles.row, { backgroundColor: c.card, borderColor: c.line }]}>
        <CheckBox done={done} tone="mint" label="Send the final formal headcount to the venue" onPress={() => tick(false)} />
        <View style={{ flex: 1, gap: 2 }}>
          <StrikeTitle struck={done} color={done ? c.ink3 : c.ink}>Send the final formal headcount to the venue</StrikeTitle>
          <T v="meta" color={c.ink3}>You · by Nov 16</T>
        </View>
      </View>
      <Button label={done ? "Untick, then refuse" : "Tick, then refuse"} variant="ghost" tone="rose" onPress={() => tick(true)} />
    </Section>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1.5 },
  item: { width: "47%", flexGrow: 1, minHeight: 92, alignItems: "center", justifyContent: "space-between", gap: 6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5 },
  slot: { minHeight: 34, alignItems: "center", justifyContent: "flex-end" },
  who: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1.5 },
  note: { gap: 4, padding: 14, borderWidth: 1.5, borderRadius: 12 },
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5 },
});
