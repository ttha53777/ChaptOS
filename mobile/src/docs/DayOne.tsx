/**
 * Docs day one (app/org/[slug]/docs/DayOne.tsx, docs-dayone.css): no docs and no folders.
 * Three pictures (a pasted link with ⌘V, a named index card, the shelf everyone opens)
 * with the web's captions, then "Add your first doc" for officers, or the line saying an
 * officer can add the first one. Until /me lands the web shows neither; the app always
 * has /me here.
 *
 * Motion: the pictures rise in turn (80ms apart); reduced: they fade together.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { Fav, KindChip } from "./bits";

export function DocsDayOne({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 18, marginTop: 22 }}>
      <View style={[styles.card, { borderColor: c.line2, backgroundColor: c.card }]} accessibilityLabel="How Docs works">
        <Figure i={0} title="1 · Paste a link" line="Any Google Doc, Sheet, Form or website."><PastePic /></Figure>
        <Figure i={1} title="2 · Give it a name" line="What would a new member call it?"><NamePic /></Figure>
        <Figure i={2} title="3 · Everyone can open it" line="It sits here as a card. One tap opens it."><ShelfPic /></Figure>
      </View>
      {canManage ? (
        <View style={{ alignItems: "center" }}>
          <Pressable onPress={onAdd} accessibilityRole="button"
            style={({ pressed }) => [styles.btn, { backgroundColor: c.ink, borderColor: c.ink }, !pressed && hard(c.pastel.lilac.fill, 3), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
            <Icon name="plus" size={15} color={c.paper} />
            <T v="button" size={14} color={c.paper}>Add your first doc</T>
          </Pressable>
        </View>
      ) : (
        <T v="callout" color={c.ink3} align="center">Nothing here yet. An officer can add the first one.</T>
      )}
    </View>
  );
}

function Figure({ i, title, line, children }: { i: number; title: string; line: string; children: ReactNode }) {
  const { c } = useTheme();
  const m = useMotion();
  return (
    <Animated.View entering={FadeInDown.duration(m.t(360)).delay(m.reduced ? 0 : m.t(120 + i * 80)).reduceMotion(ReduceMotion.System)} style={styles.fig}>
      <View style={styles.pic} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
      <T v="heading" size={16.5} align="center">{title}</T>
      <T v="meta" color={c.ink3} align="center">{line}</T>
    </Animated.View>
  );
}

function PastePic() {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingTop: 22 }}>
      <View style={[styles.key, { backgroundColor: c.note.fill.butter, borderColor: c.note.ink }]}><T v="mono" size={10.5} color={c.note.ink}>⌘V</T></View>
      <View style={[styles.url, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.sky.fill, 3)]}>
        <View style={[styles.urlIc, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}><Icon name="link" size={12} color={c.pastel.lilac.ink} /></View>
        <T v="mono" size={11.5} color={c.ink2}>docs.google.com/…</T>
      </View>
    </View>
  );
}

function IndexCard({ kind, label, name, rot, tone, small }: { kind: "doc" | "sheet" | "form"; label: string; name?: string; rot: number; tone: "sky" | "mint" | "lilac"; small?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[small ? styles.mini : styles.index, { backgroundColor: c.card, borderColor: c.ink, transform: [{ rotate: `${rot}deg` }] }, hard(c.pastel[tone].fill, 3)]}>
      <View style={[styles.tape, { backgroundColor: c.pastel[tone].fill }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Fav kind={kind} size={small ? 20 : 24} />
        {small ? <T v="kicker" size={8} color={c.ink3}>{label}</T> : <KindChip kind={kind} />}
      </View>
      {name && !small ? <>
        <View style={[styles.ln, { backgroundColor: c.pastel.rose.fill, marginTop: 9 }]} />
        <View style={{ alignSelf: "flex-start", marginTop: 8 }}>
          <View style={[styles.hl, { backgroundColor: c.pastel.butter.fill, opacity: c.markOp }]} />
          <T v="subhead" size={14.5}>{name}</T>
        </View>
      </> : null}
      {name && small ? <T v="subhead" size={12} style={{ marginTop: 6 }}>{name}</T> : null}
      {small && name ? <View style={{ flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-end", marginTop: 4 }}><T v="buttonSm" size={9.5} color={c.ink2}>Open</T><Icon name="out" size={9} color={c.ink2} /></View> : null}
      {!name ? <>
        <View style={[styles.ln, { backgroundColor: c.pastel.rose.fill }]} />
        <View style={[styles.ln, { backgroundColor: c.pastel.butter.border }]} />
      </> : !small ? <>
        <View style={[styles.ln, { backgroundColor: c.pastel.sky.border }]} />
        <View style={[styles.ln, { backgroundColor: c.pastel.sky.border, width: "55%" }]} />
      </> : null}
    </View>
  );
}

function NamePic() {
  return <View style={{ alignItems: "center", paddingTop: 10 }}><IndexCard kind="doc" label="Doc" name="Chapter bylaws" rot={-1.5} tone="sky" /></View>;
}

function ShelfPic() {
  const { c } = useTheme();
  const av = [["JP", c.pastel.lilac.fill], ["AK", c.pastel.mint.fill], ["SL", c.pastel.peach.fill]] as const;
  return (
    <View style={{ width: 200, height: 110, alignSelf: "center" }}>
      <View style={{ position: "absolute", left: 0, top: 16 }}><IndexCard small kind="sheet" label="Sheet" rot={-6} tone="mint" /></View>
      <View style={{ position: "absolute", left: 38, top: 4 }}><IndexCard small kind="form" label="Form" rot={-2} tone="lilac" /></View>
      <View style={{ position: "absolute", left: 84, top: 10 }}><IndexCard small kind="doc" label="Doc" name="Bylaws" rot={3} tone="sky" /></View>
      <View style={styles.avs}>
        {av.map(([t, bg], i) => (
          <View key={t} style={[styles.av, { backgroundColor: bg, borderColor: c.paper, marginLeft: i ? -5 : 0 }]}><T v="pill" size={8.5} color={c.note.ink}>{t}</T></View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 24, paddingVertical: 22, paddingHorizontal: 16, gap: 26 },
  fig: { alignItems: "center", gap: 5 },
  pic: { height: 130, alignSelf: "stretch", justifyContent: "center", marginBottom: 6 },
  key: { position: "absolute", top: 0, right: 40, borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, transform: [{ rotate: "8deg" }] },
  url: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 7, paddingLeft: 7, paddingRight: 14 },
  urlIc: { width: 22, height: 22, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  index: { width: 190, borderWidth: 1.5, borderRadius: 8, padding: 12, gap: 4 },
  mini: { width: 92, minHeight: 78, borderWidth: 1.5, borderRadius: 7, padding: 8 },
  tape: { position: "absolute", top: -7, alignSelf: "center", left: "50%", marginLeft: -18, width: 36, height: 12, opacity: 0.75 },
  hl: { position: "absolute", left: -2, right: -2, bottom: 1, height: "45%", borderRadius: 6, transform: [{ rotate: "-0.8deg" }] },
  ln: { height: 1.5, marginTop: 7, borderRadius: 1 },
  avs: { position: "absolute", left: 6, bottom: 0, flexDirection: "row" },
  av: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18 },
});
