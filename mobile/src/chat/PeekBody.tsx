/**
 * A record card (PeekCard): what a tapped answer row opens, and what a `record` answer
 * draws inline. Title + subtitle, a badge, facts as a two-column ledger (figures in
 * mono, toned), then sections of rows (or the section's own empty line).
 */
import type { PeekCard, PeekTone } from "@/lib/api-types";
import { StyleSheet, View } from "react-native";
import { Pill } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { monthDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";

const BADGE: Record<PeekTone, Tone> = { good: "mint", warn: "butter", risk: "rose", muted: "sky" };

export function PeekBody({ card, title = true }: { card: PeekCard; title?: boolean }) {
  const { c } = useTheme();
  const ink = (t?: PeekTone) => (t === "good" ? c.pastel.mint.ink : t === "warn" ? c.pastel.butter.ink : t === "risk" ? c.pastel.rose.ink : t === "muted" ? c.ink3 : c.ink);
  return (
    <View style={{ gap: 14 }}>
      {title ? (
        <View style={styles.head}>
          {card.date ? (
            <View style={[styles.stub, { borderColor: c.line2 }]}>
              <T v="mono" color={c.ink3} style={{ fontSize: 9.5 }}>{weekdayShort(card.date).toUpperCase()}</T>
              <T v="subhead">{monthDay(card.date)}</T>
            </View>
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="heading" numberOfLines={2}>{card.title}</T>
            {card.subtitle ? <T v="meta" color={c.ink3}>{card.subtitle}</T> : null}
          </View>
          {card.badge ? <Pill label={card.badge.label} tone={BADGE[card.badge.tone]} /> : null}
        </View>
      ) : null}
      {card.facts.length ? (
        <View style={[styles.facts, { borderColor: c.line }]}>
          {card.facts.map((f, i) => (
            <View key={i} style={[styles.fact, i > 0 && { borderTopColor: c.lineSoft, borderTopWidth: 1 }]}>
              <T v="meta" color={c.ink3} style={{ flex: 1 }}>{f.k}</T>
              <T v={f.mono ? "mono" : "callout"} color={ink(f.tone)} style={f.mono ? { fontSize: 13 } : undefined}>{f.v}</T>
            </View>
          ))}
        </View>
      ) : null}
      {card.sections.map((s, i) => (
        <View key={i} style={{ gap: 6 }}>
          <T v="label" color={c.ink3}>{s.label}</T>
          {s.rows.length ? s.rows.map((r, j) => (
            <View key={j} style={styles.row}>
              <View style={{ flex: 1 }}>
                <T v="callout" numberOfLines={2}>{r.title}</T>
                {r.subtitle ? <T v="meta" color={c.ink3}>{r.subtitle}</T> : null}
              </View>
              {r.value ? <T v="mono" color={ink(r.tone)} style={{ fontSize: 12.5 }}>{r.value}</T> : null}
            </View>
          )) : <T v="meta" color={c.ink3}>{s.empty ?? "Nothing here."}</T>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  stub: { alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1.5, borderRadius: 10, borderStyle: "dashed" },
  facts: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12 },
  fact: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
});
