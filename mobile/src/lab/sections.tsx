/**
 * Motion Lab sections: every token, primitive and signature moment, playable at 1× and
 * 4× slow, in day and night, at simulated XXL / AX type, with reduced motion forced on or
 * off. The native counterpart of the HTML mocks' `window.__mock` scenes; later phases
 * add their moments here and get reviewed here.
 */
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { GLYPH_NAMES } from "~/icons/glyphs";
import { CheckInTicket, type CheckInWindow } from "~/moments/CheckInTicket";
import { haptics, type HapticName } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar, AvatarStack, Chip, Kicker, Pill, StickyNote, Surface, Tape, Tile } from "~/paper/bits";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Highlighter, IndexCard, INDEX_LINE, LegalPad, ManilaFolder, PAD_LINE, Receipt, SheetSurface } from "~/paper/stationery";
import { TickingNumber } from "~/paper/TickingNumber";
import { TONES, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { TYPE, type TypeName } from "~/theme/type";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.section}>
      <View style={{ gap: 4 }}>
        <T v="heading" accessibilityRole="header">{title}</T>
        {note && <T v="meta" color={c.ink3}>{note}</T>}
      </View>
      {children}
    </View>
  );
}

function Row({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  return <View style={[styles.row, wrap && { flexWrap: "wrap" }]}>{children}</View>;
}

/* ── Signature: check in ─────────────────────────────────────────────────────── */
export function CheckInLab() {
  const { c } = useTheme();
  const [win, setWin] = useState<CheckInWindow>("open");
  const [failNext, setFailNext] = useState(false);
  const [latency, setLatency] = useState<"fast" | "slow">("fast");
  const [nonce, setNonce] = useState(0);
  const wait = () => new Promise<void>(r => setTimeout(r, latency === "fast" ? 250 : 1600));

  return (
    <Section title="Checking in" note="Signature moment. Tear → HERE stamp → count ticks. Undo reattaches; a refusal smears the ink off.">
      <CheckInTicket
        key={nonce}
        title="Chapter meeting"
        dow="TUE"
        day="18"
        meta={["7:30 PM", "Library 204"]}
        window={win}
        closingLabel="Closes in 4:12"
        checkedIn={false}
        others={23}
        of={52}
        onCheckIn={async () => {
          await wait();
          if (failNext) { setFailNext(false); throw new Error("Check-in closed a moment ago, so this one wasn't counted."); }
        }}
        onUndo={wait}
      />
      <View style={styles.controls}>
        <Segmented label="Window" value={win} onChange={setWin} options={[{ value: "open", label: "Open" }, { value: "closing", label: "Closing" }, { value: "void", label: "Void" }]} />
        <Segmented label="Server" value={latency} onChange={setLatency} options={[{ value: "fast", label: "Fast reply" }, { value: "slow", label: "Slow reply" }]} />
        <Row>
          <Button label={failNext ? "Next tap will fail" : "Fail the next tap"} variant={failNext ? "ink" : "ghost"} tone="rose" size="sm" onPress={() => setFailNext(f => !f)} />
          <Button label="Reset" variant="soft" size="sm" onPress={() => { setFailNext(false); setNonce(n => n + 1); }} />
        </Row>
        <T v="meta" color={c.ink3}>"Slow reply" plus "Fail" shows a refusal arriving after the stamp has landed.</T>
      </View>
    </Section>
  );
}

/* ── Stamps ──────────────────────────────────────────────────────────────────── */
const STAMPS: { label: string; sub?: string; tone: Tone }[] = [
  { label: "HERE", sub: "7:34 PM", tone: "mint" },
  { label: "DONE", tone: "mint" },
  { label: "SENT", sub: "NOV 17", tone: "lilac" },
  { label: "PAID", tone: "sky" },
  { label: "VOID", sub: "not counted", tone: "rose" },
];

export function StampLab() {
  const [state, setState] = useState<StampState>("shown");
  const play = (s: StampState) => setState(s);
  return (
    <Section title="Stamp" note="in: drop 2.3× → .94× → 1×, ink on contact, soft haptic. out: lifts. smear: dragged off wet.">
      <Surface style={styles.stampDesk}>
        {STAMPS.map((s, i) => (
          <Stamp key={s.label} {...s} state={state} rotate={-8 + (i % 2) * 4} size={i === 0 ? "lg" : "md"}
            onImpact={i === 0 ? haptics.soft : undefined} />
        ))}
      </Surface>
      <Row>
        <Button label="Land" size="sm" onPress={() => { setState("hidden"); setTimeout(() => play("in"), 30); }} />
        <Button label="Lift" size="sm" variant="ghost" onPress={() => { setState("shown"); setTimeout(() => play("out"), 30); }} />
        <Button label="Smear" size="sm" variant="ghost" tone="rose" onPress={() => { setState("shown"); setTimeout(() => play("smear"), 30); }} />
        <Button label="Show" size="sm" variant="soft" onPress={() => play("shown")} />
      </Row>
    </Section>
  );
}

/* ── Ticking figures ─────────────────────────────────────────────────────────── */
export function TickLab() {
  const { c } = useTheme();
  const [n, setN] = useState(23);
  const [secs, setSecs] = useState(252);
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const money = `$${(n * 12.5).toFixed(2)}`;
  return (
    <Section title="Ticking figures" note="Only the digits that change roll; up when growing, down when shrinking.">
      <Surface style={{ padding: 16, gap: 14 }}>
        <Row>
          <TickingNumber value={n} v="figure" />
          <T v="meta" color={c.ink3} style={{ marginBottom: 6 }}>of 52 checked in</T>
        </Row>
        <Row>
          <T v="kicker" color={c.ink3}>Closes in</T>
          <TickingNumber value={mmss} v="monoLg" />
        </Row>
        <Row>
          <T v="kicker" color={c.ink3}>Owed</T>
          <TickingNumber value={money} v="measure" />
        </Row>
      </Surface>
      <Row>
        <Button label="+1" size="sm" onPress={() => setN(x => x + 1)} />
        <Button label="−1" size="sm" variant="ghost" onPress={() => setN(x => Math.max(0, x - 1))} />
        <Button label="9 → 10" size="sm" variant="ghost" onPress={() => setN(x => (x === 9 ? 10 : 9))} />
        <Button label="−1 second" size="sm" variant="soft" onPress={() => setSecs(s => Math.max(0, s - 1))} />
      </Row>
    </Section>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────────── */
export function ButtonLab() {
  return (
    <Section title="Buttons" note="The face slides into its shadow on press (transform only).">
      <Row>
        <Button label="I'm here" icon="hand" tone="mint" />
        <Button label="Add" variant="ghost" icon="plus" />
        <Button label="Not now" variant="soft" />
      </Row>
      <Row>
        <Button label="Small ink" size="sm" />
        <Button label="Small ghost" size="sm" variant="ghost" />
        <Button label="Disabled" size="sm" disabled />
      </Row>
      <Button label="Block button" block icon="send" />
    </Section>
  );
}

/* ── Paper primitives ────────────────────────────────────────────────────────── */
export function PaperLab() {
  const { c } = useTheme();
  const [hi, setHi] = useState(0);
  const people = [{ name: "Maya Okafor", tone: "peach" as Tone }, { name: "Dev Patel", tone: "sky" as Tone }, { name: "Sam Ruiz", tone: "mint" as Tone }, { name: "Lee Kim", tone: "butter" as Tone }, { name: "Ana Cruz" }, { name: "Jo Park" }];
  return (
    <>
      <Section title="Surfaces">
        <Surface style={styles.pad}><T v="callout">Card: hairline + soft lift</T></Surface>
        <Surface inked="mint" style={styles.pad}><T v="callout">Inked: the one card that matters most</T></Surface>
        <Surface dashed style={styles.pad}><T v="callout" color={c.ink2}>Dashed: unset, nothing yet</T></Surface>
      </Section>

      <Section title="Tiles, pills, chips, kickers">
        <Row>{TONES.map((t, i) => <Tile key={t} tone={t} icon={(["cal", "people", "check", "wallet", "spark", "heart"] as const)[i]!} rotate={i % 2 ? 4 : -4} />)}</Row>
        <Row>{TONES.map(t => <Pill key={t} tone={t} label={t} dot />)}<Pill label="neutral" /></Row>
        <Row><Chip label="This week" /><Chip label="Selected" selected icon="check" /></Row>
        <Kicker label="Tonight" />
        <Kicker label="On you" tone="lilac" mono={false} dash={14} />
      </Section>

      <Section title="Avatars">
        <Row>
          <Avatar name="Maya Okafor" size="sm" tone="peach" />
          <Avatar name="Dev Patel" tone="sky" />
          <Avatar name="Sam Ruiz" size="lg" tone="mint" />
          <AvatarStack people={people} />
        </Row>
      </Section>

      <Section title="Notes, tape, highlighter">
        <StickyNote>
          <T v="kicker" color={c.note.ink} style={{ opacity: 0.8 }}>Pinned</T>
          <T v="callout" color={c.note.ink} style={{ marginTop: 6 }}>Formal is the 22nd. Tickets close Friday.</T>
        </StickyNote>
        <StickyNote tone="rose" rotate={1.4} tape={false}><T v="callout" color={c.note.ink}>Untaped note, other tilt.</T></StickyNote>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <Tape width={72} />
          <Tape width={48} rotate={4} tint={c.note.fill.butter} />
        </View>
        <Pressable onPress={() => setHi(h => h + 1)} accessibilityRole="button" accessibilityLabel="Replay highlighter">
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
            <T v="title">You have</T>
            <Highlighter key={hi}><T v="title">3 things</T></Highlighter>
            <T v="title">on you</T>
          </View>
          <T v="meta" color={c.ink3}>Tap to replay the stroke.</T>
        </Pressable>
      </Section>

      <Section title="Index card" note={`Ruled every ${INDEX_LINE}pt; rose margin rule under the cap.`}>
        <View>
          <IndexCard ghost rotate={1.1} style={[StyleSheet.absoluteFill, { top: 8, left: 6, right: 6 }]} />
          <IndexCard
            tone="peach"
            cap={<><View style={[styles.dot, { backgroundColor: c.pastel.peach.ink }]} /><T v="kicker" color={c.pastel.peach.ink}>Due tomorrow</T><T v="meta" color={c.ink3} style={{ marginLeft: "auto" }}>1 of 3</T></>}
          >
            <T v="title" style={{ lineHeight: INDEX_LINE }}>Send the venue deposit</T>
            <T v="callout" color={c.ink2} style={{ lineHeight: INDEX_LINE }}>Treasurer has the card details.</T>
          </IndexCard>
        </View>
      </Section>

      <Section title="Legal pad" note={`Minutes and excuses. Ruled every ${PAD_LINE}pt.`}>
        <LegalPad>
          <T v="body" style={{ lineHeight: PAD_LINE }}>Can't make Tuesday, I have a lab practical until 8.</T>
          <T v="body" color={c.ink3} style={{ lineHeight: PAD_LINE }}>— filed under Chapter meeting</T>
        </LegalPad>
      </Section>

      <Section title="Manila folders">
        <ManilaFolder name="Bylaws & house rules" tone="sky">
          <View style={styles.folderRow}><Icon name="doc" size={16} color={c.ink3} /><T v="callout">Bylaws 2026.pdf</T></View>
        </ManilaFolder>
        <ManilaFolder name="Rush" tone="peach" tabAt={0.3}>
          <View style={styles.folderRow}><Icon name="link" size={16} color={c.ink3} /><T v="callout">Rush schedule</T></View>
        </ManilaFolder>
        <ManilaFolder name="Nothing filed yet" empty tabAt={0.12}>
          <View style={styles.folderRow}><T v="meta" color={c.ink3}>Officers add links here</T></View>
        </ManilaFolder>
      </Section>

      <Section title="Receipt" note="Thermal paper stays light in both themes.">
        <Receipt style={{ maxWidth: 300, alignSelf: "center", width: "100%" }}>
          <T v="kicker" color={c.thermal.faint} align="center">Dues · Fall term</T>
          <T v="figure" color={c.thermal.ink} align="center" style={{ marginVertical: 8 }}>$120.00</T>
          <View style={[styles.rcLine, { borderTopColor: c.thermal.faint }]} />
          <View style={styles.rcRow}><T v="mono" color={c.thermal.ink}>CHARGE  SEP 1</T><T v="mono" color={c.thermal.ink}>$180.00</T></View>
          <View style={styles.rcRow}><T v="mono" color={c.thermal.ink}>PAYMENT OCT 3</T><T v="mono" color={c.thermal.neg}>−$60.00</T></View>
        </Receipt>
      </Section>

      <Section title="Sheet surface" note="Static look only. Detents, drag and stacking arrive in U1.">
        <SheetSurface tone="mint" icon="hand" kicker="Excuse" title="File an excuse"
          footer={<><T v="meta" color={c.ink3} style={{ flex: 1 }}>Officers see it before the meeting</T><Button label="File it" size="sm" /></>}>
          <T v="body" color={c.ink2}>Sheet body content sits here.</T>
        </SheetSurface>
      </Section>
    </>
  );
}

/* ── Type scale ──────────────────────────────────────────────────────────────── */
export function TypeLab() {
  const { c } = useTheme();
  return (
    <Section title="Type scale" note="Each style caps its Dynamic Type growth (×cap). Try XXL and AX3 above.">
      {(Object.keys(TYPE) as TypeName[]).map(k => (
        <View key={k} style={{ gap: 2 }}>
          <T v="mono" color={c.ink3}>{k} · {TYPE[k].size}pt · ×{TYPE[k].cap}</T>
          <T v={k} numberOfLines={2}>{k === "kicker" || k === "label" || k === "stamp" ? "Check-in open" : k.startsWith("fig") || k === "measure" || k.startsWith("mono") ? "41 of 52 · $120.00" : "Chapter meeting tonight"}</T>
        </View>
      ))}
    </Section>
  );
}

/* ── Palette ─────────────────────────────────────────────────────────────────── */
function Swatch({ color, name, border }: { color: string; name: string; border?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 74, gap: 4 }}>
      <View style={{ height: 34, borderRadius: 10, backgroundColor: color, borderWidth: 1.5, borderColor: border ?? c.line }} />
      <T v="mono" color={c.ink3} numberOfLines={1} style={{ fontSize: 10 }}>{name}</T>
    </View>
  );
}

export function PaletteLab() {
  const { c } = useTheme();
  return (
    <Section title="Palette" note={`${c.scheme === "dark" ? "Night" : "Day"}: from app/paper-aesthetic.css.`}>
      <Row>
        {(["paper", "paper2", "paper3", "card", "ink", "ink2", "ink3", "faint", "line", "line2"] as const).map(k => <Swatch key={k} color={c[k]} name={k} />)}
      </Row>
      {TONES.map(t => (
        <Row key={t}>
          <Swatch color={c.pastel[t].fill} name={`${t}`} />
          <Swatch color={c.pastel[t].soft} name="soft" />
          <Swatch color={c.pastel[t].ink} name="ink" />
          <Swatch color={c.note.fill[t]} name="note" />
        </Row>
      ))}
      <Row>
        {(["ok", "warn", "risk", "danger"] as const).map(k => <Swatch key={k} color={c[k]} name={k} />)}
        {(Object.keys(c.cat) as (keyof typeof c.cat)[]).map(k => <Swatch key={k} color={c.cat[k]} name={k} />)}
      </Row>
    </Section>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────────────── */
export function IconLab() {
  const { c } = useTheme();
  return (
    <Section title="Glyphs" note={`${GLYPH_NAMES.length} from the web sprite (npm run gen:icons).`}>
      <View style={styles.iconGrid}>
        {GLYPH_NAMES.map(n => (
          <View key={n} style={styles.iconCell}>
            <Icon name={n} size={22} />
            <T v="mono" color={c.ink3} numberOfLines={1} style={{ fontSize: 9 }}>{n}</T>
          </View>
        ))}
      </View>
    </Section>
  );
}

/* ── Haptics ─────────────────────────────────────────────────────────────────── */
export function HapticsLab() {
  const names: HapticName[] = ["tap", "select", "soft", "success", "warn", "error"];
  return (
    <Section title="Haptics" note="One place to tune: src/motion/haptics.ts. Needs a real device.">
      <Row>{names.map(n => <Button key={n} label={n} size="sm" variant="ghost" onPress={() => haptics[n]()} />)}</Row>
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 18, marginTop: 30, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  controls: { gap: 10, marginTop: 6 },
  pad: { padding: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stampDesk: { padding: 20, flexDirection: "row", flexWrap: "wrap", gap: 22, alignItems: "center", justifyContent: "center", minHeight: 150 },
  folderRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  rcLine: { borderTopWidth: 1.5, borderStyle: "dashed", marginVertical: 10 },
  rcRow: { flexDirection: "row", justifyContent: "space-between" },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconCell: { width: 62, alignItems: "center", gap: 4, paddingVertical: 8 },
});
