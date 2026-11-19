/**
 * The folded cards (web PhoneGlances.tsx + phone-dash.css `.dw-glance`): on a phone the
 * Members, Treasury, Activity and Docs cards close the page as half-width tiles, two to a
 * row (an odd one out takes the whole row), each one headline and one line from the
 * same data the card draws. A tap opens the card in a sheet, as the web's does.
 *
 *   tile    card face, 1.5 line border, 20 radius, padding 12/13/13, min height 124;
 *           pressed = ink border + scale .985
 *   head    26pt tile, label (.8rem 650 ink-soft), chevron
 *   body    display figure 1.6rem, or a three-line message; mono note at the bottom
 *
 * Sheets: Members (standing bands and who to keep an eye on, with why), Treasury (the
 * balance, its trend, projected), Activity (the latest rows), Docs (newest first; a tap
 * opens the link). Each ends in the page it summarises.
 */
import type { ActivityEntry, Brother, DashboardResponse, TreasuryData } from "@/lib/api-types";
import type { DashCardId } from "@/lib/dashboard-layout";
import { BAND_OF, getBrotherStatus, reasonFor, type Band } from "@/lib/dashboard/standing";
import type { Thresholds } from "@/lib/thresholds";
import type { TrackedMetrics } from "@/lib/tracked-metrics";
import * as WebBrowser from "expo-web-browser";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Icon, type IconName } from "~/icons/Icon";
import { Button } from "~/paper/Button";
import { Avatar, Tile } from "~/paper/bits";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useRise } from "./Card";

export const GLANCE_META: Partial<Record<DashCardId, { icon: IconName; tone: Tone }>> = {
  members: { icon: "people", tone: "mint" },
  treasury: { icon: "wallet", tone: "mint" },
  activity: { icon: "spark", tone: "rose" },
  docs: { icon: "doc", tone: "sky" },
};

export interface GlanceCtx {
  data: DashboardResponse;
  thresholds: Thresholds;
  measured: TrackedMetrics;
  standing: Record<Band, number> | null;
  pendingJoins: number;
  words: { members: string; service: string };
}

export const glanceLabel = (id: DashCardId, g: GlanceCtx) =>
  id === "members" ? g.words.members : id === "treasury" ? "Treasury" : id === "activity" ? "Activity" : "Recent docs";

/* ── sparkline (LedgerSparkline) ──────────────────────────────────────────────── */

function Spark({ data, color, width, height, fill }: { data: number[]; color: string; width: number; height: number; fill?: string }) {
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - lo) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill ? <Path d={`${d} L${width} ${height} L0 ${height} Z`} fill={fill} /> : null}
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/* ── tiles ────────────────────────────────────────────────────────────────────── */

function Body({ id, g }: { id: DashCardId; g: GlanceCtx }) {
  const { c } = useTheme();
  const V = ({ children, unset }: { children: string; unset?: boolean }) => <T v="measure" size={25.6} numberOfLines={1} color={unset ? c.ink3 : c.ink}>{children}</T>;
  const N = ({ children, warn }: { children: string; warn?: boolean }) => <T v="mono" size={10.6} numberOfLines={1} color={warn ? c.pastel.peach.ink : c.ink3} style={{ marginTop: "auto" }}>{children}</T>;
  const L = ({ children }: { children: string }) => <T v="callout" size={13.4} lh={1.32} numberOfLines={3}>{children}</T>;
  const d = g.data;
  if (id === "members") {
    const counts = g.standing, n = d.brothers.length, off = counts ? counts.watch + counts.risk : 0;
    return (
      <>
        <V>{String(n)}</V>
        {counts && n > 0 ? (
          <View style={styles.bands}>
            {counts.good > 0 ? <View style={{ flex: counts.good, backgroundColor: c.pastel.mint.ink }} /> : null}
            {counts.watch > 0 ? <View style={{ flex: counts.watch, backgroundColor: c.pastel.butter.ink }} /> : null}
            {counts.risk > 0 ? <View style={{ flex: counts.risk, backgroundColor: c.pastel.peach.ink }} /> : null}
          </View>
        ) : null}
        <N warn={g.pendingJoins > 0}>
          {g.pendingJoins > 0 ? `${g.pendingJoins} asking to join` : !counts || n === 0 ? "on the roster" : off > 0 ? `${off} to keep an eye on` : "All in good standing"}
        </N>
      </>
    );
  }
  if (id === "treasury") {
    const t = d.treasury;
    if (!t) return <><V unset>—</V><N>No balance yet</N></>;
    return (
      <>
        <V>{`$${Math.round(t.balance).toLocaleString()}`}</V>
        {t.trend.length > 1 ? <Spark data={t.trend.map(x => x.balance)} color={c.pastel.mint.ink} width={140} height={26} /> : null}
        <N>{`$${Math.round(t.projected).toLocaleString()} projected`}</N>
      </>
    );
  }
  if (id === "activity") {
    const e = d.activity[0];
    if (!e) return <N>Nothing yet</N>;
    return <><L>{e.message}</L><N>{e.timestamp}</N></>;
  }
  const doc = d.docs[0];
  if (!doc) return <N>No docs yet</N>;
  return <><L>{doc.title}</L><N>{d.docs.length > 1 ? `+${Math.min(d.docs.length, 5) - 1} more recent` : "Newest in the library"}</N></>;
}

export function GlanceTile({ id, g, wide, i, onPress }: { id: DashCardId; g: GlanceCtx; wide?: boolean; i: number; onPress: () => void }) {
  const { c } = useTheme();
  const rise = useRise(i);
  const meta = GLANCE_META[id];
  if (!meta) return null;
  const label = glanceLabel(id, g);
  return (
    <Animated.View style={[wide ? styles.wide : styles.half, rise]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. Opens the card.`}
        style={({ pressed }) => [styles.tile, { backgroundColor: c.card, borderColor: pressed ? c.ink : c.line, boxShadow: c.sh1 }, pressed && { transform: [{ scale: 0.985 }] }]}>
        <View style={styles.gh}>
          <Tile icon={meta.icon} tone={meta.tone} size={26} />
          <T v="bodyStrong" size={12.8} ls={-0.01} color={c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{label}</T>
          <View style={{ marginLeft: "auto" }}><Icon name="chev-r" size={14} color={c.ink3} /></View>
        </View>
        <View style={styles.gb}><Body id={id} g={g} /></View>
      </Pressable>
    </Animated.View>
  );
}

/* ── sheets ───────────────────────────────────────────────────────────────────── */

const BAND_LABEL: Record<Band, string> = { good: "Good standing", watch: "On watch", risk: "At risk" };

function MembersSheet({ g }: { g: GlanceCtx }) {
  const { c } = useTheme();
  const tone: Record<Band, Tone> = { good: "mint", watch: "butter", risk: "peach" };
  const people = g.data.brothers.map(b => ({ b, band: BAND_OF[getBrotherStatus(b, g.thresholds, g.measured)] }));
  const flagged = people.filter(p => p.band !== "good").sort((a, z) => (a.band === z.band ? a.b.name.localeCompare(z.b.name) : a.band === "risk" ? -1 : 1));
  return (
    <View style={{ gap: 14 }}>
      {g.standing ? (
        <View style={styles.bandRow}>
          {(["good", "watch", "risk"] as Band[]).map(k => (
            <View key={k} style={[styles.bandBox, { backgroundColor: c.pastel[tone[k]].soft, borderColor: c.pastel[tone[k]].border }]}>
              <T v="measure" size={24} color={c.pastel[tone[k]].ink}>{String(g.standing![k])}</T>
              <T v="kicker" size={9.5} color={c.pastel[tone[k]].ink}>{BAND_LABEL[k]}</T>
            </View>
          ))}
        </View>
      ) : (
        <T v="meta" color={c.ink2}>No one's standing can be judged yet: nothing tracked has been recorded.</T>
      )}
      {flagged.length ? (
        <View style={{ gap: 8 }}>
          <T v="kicker" size={10.2} color={c.ink3}>To keep an eye on</T>
          {flagged.map(({ b, band }) => (
            <Row key={b.id} lead={<Avatar name={b.name} uri={b.avatarUrl} tone={tone[band]} size="sm" />}
              title={b.name} meta={reasonFor(b as Brother, band, g.thresholds, g.measured, g.words.service)} metaTone={tone[band]} />
          ))}
        </View>
      ) : g.standing ? <T v="meta" color={c.ink2}>Everyone is in good standing.</T> : null}
    </View>
  );
}

function TreasurySheet({ t }: { t: TreasuryData | null }) {
  const { c } = useTheme();
  if (!t) return <T v="meta" color={c.ink2}>No balance yet. It shows once the books have an opening balance or an entry.</T>;
  return (
    <View style={{ gap: 12 }}>
      <View>
        <T v="kicker" size={10.2} color={c.ink3}>Balance</T>
        <T v="figure" size={40}>{`$${Math.round(t.balance).toLocaleString()}`}</T>
        <T v="mono" size={11.5} color={c.ink3}>{`$${Math.round(t.projected).toLocaleString()} projected`}</T>
      </View>
      {t.trend.length > 1 ? (
        <View style={[styles.chart, { borderColor: c.line, backgroundColor: c.card }]}>
          <Spark data={t.trend.map(x => x.balance)} color={c.pastel.mint.ink} fill={c.pastel.mint.soft} width={300} height={110} />
          <View style={styles.months}>
            {t.trend.map((x, k) => (k === 0 || k === t.trend.length - 1 || t.trend.length <= 6 ? <T key={k} v="mono" size={10} color={c.ink3}>{x.month}</T> : null))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActivitySheet({ entries }: { entries: ActivityEntry[] }) {
  const { c } = useTheme();
  if (!entries.length) return <T v="meta" color={c.ink2}>Nothing yet. Changes across the chapter land here.</T>;
  const tone = (t: ActivityEntry["type"]): Tone => (t === "success" ? "mint" : t === "warning" ? "peach" : "sky");
  return (
    <View style={{ gap: 8 }}>
      {entries.map(e => <Row key={e.id} lead={<View style={[styles.adot, { backgroundColor: c.pastel[tone(e.type)].ink }]} />} title={e.message} meta={e.timestamp} wrap />)}
    </View>
  );
}

function DocsSheet({ docs }: { docs: DashboardResponse["docs"] }) {
  const { c } = useTheme();
  if (!docs.length) return <T v="meta" color={c.ink2}>No docs yet.</T>;
  return (
    <View style={{ gap: 8 }}>
      {docs.slice(0, 5).map(d => (
        <Row key={d.id} lead={<Tile icon="doc" tone="sky" size={30} />} title={d.title} meta={d.description ?? new URL(d.url).hostname}
          onPress={() => void WebBrowser.openBrowserAsync(d.url).catch(() => toast.error("Couldn't open that link"))} />
      ))}
    </View>
  );
}

function Row({ lead, title, meta, metaTone, onPress, wrap }: { lead: ReactNode; title: string; meta?: string; metaTone?: Tone; onPress?: () => void; wrap?: boolean }) {
  const { c } = useTheme();
  const inner = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="callout" numberOfLines={wrap ? 3 : 1}>{title}</T>
        {meta ? <T v="meta" size={12} numberOfLines={1} color={metaTone ? c.pastel[metaTone].ink : c.ink3}>{meta}</T> : null}
      </View>
      {onPress ? <Icon name="arrow-r" size={13} color={c.ink3} /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.row, { borderColor: pressed ? c.line2 : c.line, backgroundColor: c.card }]}>{inner}</Pressable>
  ) : <View style={[styles.row, { borderColor: c.line, backgroundColor: c.card }]}>{inner}</View>;
}

const PAGE: Partial<Record<DashCardId, { label: string; href: Href }>> = {
  members: { label: "See everyone", href: "/(tabs)/members" as Href },
  treasury: { label: "Open Treasury", href: "/more/treasury" as Href },
  activity: { label: "Close", href: "" as Href },
  docs: { label: "Open Docs", href: "/more/docs" as Href },
};

export function GlanceSheet({ id, g, onClose }: { id: DashCardId | null; g: GlanceCtx; onClose: () => void }) {
  const meta = id ? GLANCE_META[id] : null;
  const page = id ? PAGE[id] : null;
  return (
    <Sheet open={!!id} onClose={onClose} title={id ? glanceLabel(id, g) : ""} icon={meta?.icon} tone={meta?.tone} size="tall"
      footer={page ? <Button label={page.label} block variant={id === "activity" ? "soft" : "ink"} onPress={() => { onClose(); if (id !== "activity") router.navigate(page.href); }} /> : undefined}>
      {id === "members" ? <MembersSheet g={g} />
        : id === "treasury" ? <TreasurySheet t={g.data.treasury} />
        : id === "activity" ? <ActivitySheet entries={g.data.activity} />
        : id === "docs" ? <DocsSheet docs={g.data.docs} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  half: { flexBasis: "45%", flexGrow: 1 },
  wide: { flexBasis: "100%" },
  tile: { flex: 1, minHeight: 124, gap: 9, paddingTop: 12, paddingHorizontal: 13, paddingBottom: 13, borderRadius: 20, borderWidth: 1.5 },
  gh: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  gb: { flex: 1, gap: 5, minWidth: 0 },
  bands: { flexDirection: "row", gap: 2, height: 6, borderRadius: 3, overflow: "hidden", marginVertical: 2 },
  bandRow: { flexDirection: "row", gap: 8 },
  bandBox: { flex: 1, padding: 12, borderRadius: 14, borderWidth: 1.5, gap: 2 },
  chart: { padding: 12, borderRadius: 16, borderWidth: 1.5, gap: 6 },
  months: { flexDirection: "row", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  adot: { width: 8, height: 8, borderRadius: 4 },
});
