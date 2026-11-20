/**
 * The Dues tab's small parts, drawn as app/paper-dues.css draws them at phone width:
 * standing colours ([data-s]), the punch strip (13 squares a row), avatar stacks,
 * .du-btn / .du-link / .du-seg / .du-sg / .du-money / .du-srch.
 */
import type { DuesStanding } from "@/lib/api-types";
import type { DuesPerson } from "@/lib/treasury/dues";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { pressedDim } from "~/motion/press";

export type Swatch = { fill: string; ink: string; soft: string; border: string; dashed: boolean };

/** .du [data-s] */
export function useStanding() {
  const { c } = useTheme();
  return (s: DuesStanding | "role"): Swatch => {
    if (s === "paid") return { ...c.pastel.mint, dashed: false };
    if (s === "due") return { ...c.pastel.butter, dashed: false };
    if (s === "overdue") return { ...c.pastel.rose, dashed: false };
    if (s === "role") return { ...c.pastel.lilac, dashed: false };
    return { fill: "transparent", ink: c.ink3, soft: c.paper2, border: c.line, dashed: true };
  };
}

/** One square per member, 13 to a row. */
export function Strip({ items, dim, onPress, cols = 13 }: {
  items: { id: number | string; s: DuesStanding; label?: string; on?: boolean }[]; dim?: boolean; onPress?: (id: number) => void;
  /** 13 on the tab at phone width; the Overview card packs 18 (.du-dq .du-strip). */
  cols?: number;
}) {
  const { c } = useTheme();
  const sw = useStanding();
  return (
    <View style={styles.strip}>
      {items.map(it => {
        const x = sw(it.s);
        const fine = cols > 13;
        const cell = [styles.cell, { width: `${100 / cols}%` as const, padding: fine ? 1.5 : 2 }];
        const sq = [styles.sq, fine && { borderRadius: 3, borderWidth: 1 }, { backgroundColor: x.fill, borderColor: it.s === "none" ? c.line2 : x.ink, borderStyle: it.s === "none" ? "dashed" as const : "solid" as const },
          dim && !it.on && { opacity: 0.18 }];
        return onPress && typeof it.id === "number"
          ? <Pressable key={it.id} onPress={() => { haptics.select(); onPress(it.id as number); }} accessibilityRole="button" accessibilityLabel={it.label} hitSlop={2} style={cell}><View style={sq} /></Pressable>
          : <View key={it.id} style={cell}><View style={sq} /></View>;
      })}
    </View>
  );
}

export function Stack({ ps, max }: { ps: readonly DuesPerson[]; max: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.stack}>
      {ps.slice(0, max).map((p, i) => <Avatar key={p.id} name={p.name} uri={p.avatarUrl} px={22} style={i ? { marginLeft: -7 } : null} />)}
      {ps.length > max ? <T v="mono" size={10.5} color={c.ink3} style={{ marginLeft: 4 }}>+{ps.length - max}</T> : null}
    </View>
  );
}

/** .du-btn (ink, lilac hard shadow) / .du-ghost (card, peach). */
export function DuBtn({ label, icon, ghost, small, onPress, disabled, danger, style }: {
  label: string; icon?: IconName; ghost?: boolean; small?: boolean; onPress: () => void; disabled?: boolean; danger?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = ghost ? c.card : danger ? c.pastel.rose.ink : c.ink;
  const fg = ghost ? (danger ? c.pastel.rose.ink : c.ink) : c.paper;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.btn, small && styles.btnSm, { backgroundColor: bg, borderColor: danger ? c.pastel.rose.ink : c.ink },
        hard(ghost ? c.pastel.peach.fill : c.pastel.lilac.fill, pressed ? 1 : 2.5), disabled && { opacity: 0.4 }, style]}>
      {icon ? <Icon name={icon} size={15} color={fg} /> : null}
      <T v="button" size={small ? 13 : 14} color={fg} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

export function DuLink({ label, onPress, rose, icon }: { label: string; onPress: () => void; rose?: boolean; icon?: IconName }) {
  const { c } = useTheme();
  const col = rose ? c.pastel.rose.ink : c.ink2;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && pressedDim]}>
      {icon ? <Icon name={icon} size={13} color={col} /> : null}
      <T v="buttonSm" size={13} color={col} style={{ textDecorationLine: "underline", textDecorationColor: c.line2 }}>{label}</T>
    </Pressable>
  );
}

/** .du-sg: a small pressed/unpressed pill. */
export function Sg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={[styles.sg, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.paper }]}>
      <T v="pill" size={12} color={on ? c.paper : c.ink2}>{label}</T>
    </Pressable>
  );
}

/** .du-seg */
export function Seg<K extends string>({ value, options, onChange, label }: { value: K; options: readonly { k: K; l?: string; icon?: IconName; a11y?: string }[]; onChange: (k: K) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.seg, { borderColor: c.line2, backgroundColor: c.paper2 }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(o => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} onPress={() => { if (!on) { haptics.select(); onChange(o.k); } }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.a11y ?? o.l}
            style={[styles.segB, on && { backgroundColor: c.card, borderColor: c.ink }]}>
            {o.icon ? <Icon name={o.icon} size={14} color={on ? c.ink : c.ink3} /> : null}
            {o.l ? <T v="buttonSm" size={12.5} color={on ? c.ink : c.ink3}>{o.l}</T> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** .du-money */
export function Money({ value, onChangeText, placeholder = "0", label, lg, ea, disabled, style, ...rest }: TextInputProps & {
  label: string; lg?: boolean; ea?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.money, lg && styles.moneyLg, { borderColor: c.line2, backgroundColor: c.card }, disabled && { opacity: 0.4 }, style]} pointerEvents={disabled ? "none" : "auto"}>
      <T v="mono" size={lg ? 20 : 14} color={c.ink3}>$</T>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.ink3} keyboardType="decimal-pad"
        accessibilityLabel={label} editable={!disabled} {...rest}
        style={[lg ? styles.moneyInLg : styles.moneyIn, { color: c.ink }]} />
      {ea ? <T v="mono" size={11} color={c.ink3}>ea</T> : null}
    </View>
  );
}

/** .du-srch */
export function Search({ value, onChangeText, placeholder, style }: { value: string; onChangeText: (s: string) => void; placeholder: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[styles.srch, { borderColor: c.line2, backgroundColor: c.card }, style]}>
      <Icon name="search" size={15} color={c.ink3} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.ink3} accessibilityLabel={placeholder}
        style={[styles.srchIn, { color: c.ink }]} autoCorrect={false} />
    </View>
  );
}

export function DuCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, style]}>{children}</View>;
}

/** .du-k: the small uppercase kicker. */
export function Kicker({ icon, children }: { icon?: IconName; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.k}>
      {icon ? <Icon name={icon} size={14} color={c.ink3} /> : null}
      <T v="label" size={11} ls={0.1} color={c.ink3} style={{ flexShrink: 1 }}>{children}</T>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.empty, { borderColor: c.line2 }]}>{typeof children === "string" ? <T v="body" size={14} color={c.ink3} align="center">{children}</T> : children}</View>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, marginHorizontal: -2 },
  cell: { aspectRatio: 1 },
  sq: { flex: 1, borderRadius: 5, borderWidth: 1.5 },
  stack: { flexDirection: "row", alignItems: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5 },
  btnSm: { paddingHorizontal: 13, paddingVertical: 7 },
  link: { flexDirection: "row", alignItems: "center", gap: 4 },
  sg: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  seg: { flexDirection: "row", padding: 3, borderWidth: 1.5, borderRadius: 999 },
  segB: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: "transparent" },
  money: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, borderRadius: 11 },
  moneyLg: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, maxWidth: 220 },
  moneyIn: { flex: 1, minWidth: 0, fontFamily: "PlexMono-600", fontSize: 15, textAlign: "right", padding: 0 },
  moneyInLg: { flex: 1, minWidth: 0, fontFamily: "Bricolage-600", fontSize: 26, letterSpacing: -0.8, padding: 0 },
  srch: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderWidth: 1.5, borderRadius: 999 },
  srchIn: { flex: 1, paddingVertical: 8, fontFamily: "Inter-400", fontSize: 14 },
  card: { borderWidth: 1.5, borderRadius: 22 },
  k: { flexDirection: "row", alignItems: "center", gap: 7 },
  empty: { padding: 40, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 18, marginTop: 18 },
});
