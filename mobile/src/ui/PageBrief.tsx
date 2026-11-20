/**
 * A page's briefing on a phone (paper-aesthetic.css `.briefing`): the same frame as
 * Today's Brief, with each page's own words.
 *
 *   kicker   a pill ("THURSDAY, NOVEMBER 19, 2026"), then a mono line after it
 *            ("· WEEK OF NOV 16–22"), wrapping under it on a narrow phone
 *   greeting the page's line in the display face, one word over a highlighter stroke
 *            ("The weeks *ahead*.", "The *Members*.")
 *   sub      an optional plain paragraph (day one)
 *   digest   a lilac DIGEST chip and a line with bold runs, or a quiet line on its own
 *
 * Motion: the highlighter draws left to right (spring, .35s in), as on the web.
 * Reduced: it's simply there.
 */
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { Icon } from "~/icons/Icon";
import { T } from "./T";

export interface BriefPart { text: string; bold?: boolean }

export function PageBrief({ pill, kicker, lead, mark, tail = ".", markTone = "sky", sub, digest, quiet, kickerSep = true, spark }: {
  /** The date pill; omitted on pages whose web brief has none (Docs). */
  pill?: string | null;
  kicker?: string | null;
  /** The "·" before the kicker (Treasury's web brief has none). */
  kickerSep?: boolean;
  /** Greeting text before the highlighted words, the highlighted words, and after. */
  lead: string; mark: string; tail?: string;
  markTone?: Tone;
  /** A sentence under the title; bold runs are the web's <b>. */
  sub?: string | BriefPart[] | null;
  digest?: BriefPart[] | ReactNode | null;
  /** Shown instead of a digest, in the quiet ink, without the chip. */
  quiet?: string | null;
  /** The ✦ before DIGEST (Docs). */
  spark?: boolean;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const draw = useSharedValue(m.reduced ? 1 : 0);
  useEffect(() => {
    if (!m.reduced) draw.value = withDelay(m.t(350), withSpring(1, m.spring("settle")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const markStyle = useAnimatedStyle(() => ({ transform: [{ rotate: "-0.8deg" }, { scaleX: draw.value }] }));

  const parts = Array.isArray(digest) ? (digest as BriefPart[]) : null;
  const H = (s: string) => <T v="hero" size={34} ls={-0.035} lh={1.04}>{s}</T>;

  return (
    <View accessibilityRole="summary">
      <View style={styles.kicker}>
        {pill ? (
          <View style={[styles.pill, { backgroundColor: c.card, borderColor: c.line2 }]}>
            <T v="kicker" size={11.5} color={c.ink2}>{pill.toUpperCase()}</T>
          </View>
        ) : null}
        {kicker && pill ? <T v="kicker" size={11.5} color={c.ink3}>{`${kickerSep ? "·  " : ""}${kicker.toUpperCase()}`}</T> : null}
        {kicker && !pill ? <T v="label" size={11} ls={0.1} color={c.ink3} style={{ fontWeight: "600" }}>{kicker}</T> : null}
      </View>

      <View style={styles.greet} accessibilityRole="header" accessibilityLabel={`${lead}${mark}${tail}`}>
        {lead ? H(lead) : null}
        <View>
          <Animated.View style={[styles.mark, { backgroundColor: c.pastel[markTone].fill, opacity: c.markOp }, markStyle]} />
          {H(mark)}
        </View>
        {tail ? H(tail) : null}
      </View>

      {sub ? (
        <T v="body" size={15.2} lh={1.5} color={c.ink2} style={{ marginTop: 10 }}>
          {typeof sub === "string" ? sub : sub.map((p, i) => p.bold ? <T key={i} v="bodyStrong" size={15.2} lh={1.5} color={c.ink}>{p.text}</T> : p.text)}
        </T>
      ) : null}

      {parts || (digest && !Array.isArray(digest)) ? (
        <View style={styles.digest}>
          <View style={[styles.chip, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
            {spark ? <Icon name="spark" size={9} color={c.pastel.lilac.ink} /> : null}
            <T v="label" size={10.2} color={c.pastel.lilac.ink}>Digest</T>
          </View>
          <T v="body" size={15.2} lh={1.5} color={c.ink2} style={{ flex: 1 }}>
            {parts ? parts.map((p, i) => p.bold ? <T key={i} v="bodyStrong" size={15.2} lh={1.5} color={c.ink}>{p.text}</T> : p.text) : digest as ReactNode}
          </T>
        </View>
      ) : quiet ? (
        <T v="body" size={15.2} lh={1.5} color={c.ink3} style={{ marginTop: 10 }}>{quiet}</T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 10 },
  pill: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1.5 },
  greet: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 },
  mark: { position: "absolute", left: -3, right: -3, bottom: 2, height: "46%", borderTopLeftRadius: 12, borderTopRightRadius: 16, borderBottomLeftRadius: 11, borderBottomRightRadius: 18, transformOrigin: "left center" },
  digest: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2, paddingHorizontal: 9, marginTop: 3, borderRadius: 999, borderWidth: 1 },
});
