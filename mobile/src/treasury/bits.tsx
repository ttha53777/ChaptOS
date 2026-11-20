/**
 * The Treasury page's paper pieces, as app/paper-treasury.css draws them on a phone:
 *
 *   TrBtn      the ink pill on a hard pastel shadow (.tr-add), the card one (.tr-add-reimb),
 *              the dashed "Ask about the books" (.tr-ask), and the small calm buttons
 *   TrCard     a FinanceCard with its .card-h (tile, title, a mono note or a control)
 *   Calm       the mock's .calm empty card: a tilted pastel tile, a title, a line, buttons
 *   DateBlock  the .tr-dd day block (Thu / 19 / Nov)
 *   SecNote    "Recent entries" with the dashed rule and a mono sum
 *   Leader     a statement line with a dotted leader (.line / .ldr)
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { Tile } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

export function TrBtn({ label, icon, kind = "ink", tone = "lilac", onPress, small, disabled, kbd, hint, block }: {
  label: string; icon?: IconName;
  /** ink: .tr-add · card: .tr-add-reimb · ask: .tr-ask · ghost: .tz-calm-btn.ghost */
  kind?: "ink" | "card" | "ask" | "ghost";
  tone?: Tone; onPress: () => void; small?: boolean; disabled?: boolean; kbd?: string; hint?: string;
  /** Full width: the label centred, or (with a kbd) the key pushed to the far edge. */
  block?: boolean;
}) {
  const { c } = useTheme();
  const ink = kind === "ink";
  const fg = ink ? c.paper : kind === "card" ? c.ink : kind === "ghost" ? c.ink2 : c.ink3;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityHint={hint} accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSm, block && { alignSelf: "stretch", justifyContent: kbd ? "flex-start" : "center" },
        ink ? { backgroundColor: c.ink, borderColor: c.ink } : kind === "card" ? { backgroundColor: c.card, borderColor: c.ink }
          : { backgroundColor: kind === "ask" && pressed ? c.pastel.lilac.soft : "transparent", borderColor: c.line2, borderStyle: "dashed" },
        (ink || kind === "card") && !pressed && hard(c.pastel[tone].fill, small ? 2 : 2.5),
        pressed && (ink || kind === "card") && { transform: [{ translateX: 1 }, { translateY: 1 }] },
        disabled && { opacity: 0.5 },
      ]}>
      {icon ? <Icon name={icon} size={small ? 14 : kind === "ask" ? 13 : 15} color={kind === "ask" ? c.pastel.lilac.ink : fg} /> : null}
      <T v={kind === "ask" ? "callout" : "button"} size={small ? 13 : 14} color={fg} numberOfLines={1}>{label}</T>
      {kbd && block ? <View style={{ flex: 1 }} /> : null}
      {kbd ? <View style={[styles.kbd, { borderColor: c.line2, backgroundColor: c.paper2 }]}><T v="mono" size={10.5} color={c.ink3}>{kbd}</T></View> : null}
    </Pressable>
  );
}

export function TrCard({ icon, tone, title, note, right, children, style, inked }: {
  icon?: IconName; tone?: Tone; title?: string; note?: string | null; right?: ReactNode; children: ReactNode;
  style?: StyleProp<ViewStyle>; inked?: Tone;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: inked ? c.ink : c.line }, inked ? hard(c.pastel[inked].fill, 5) : { boxShadow: c.sh1 }, style]}>
      {title ? (
        <View style={styles.cardH}>
          {icon && tone ? <Tile icon={icon} tone={tone} size={34} /> : null}
          <T v="subhead" size={17.5} style={{ flexShrink: 1 }} accessibilityRole="header">{title}</T>
          <View style={{ flex: 1 }} />
          {note ? <T v="mono" size={11.5} color={c.ink3}>{note}</T> : null}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Calm({ icon, tone, title, children, actions }: { icon: IconName; tone: Tone; title: string; children: ReactNode; actions?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.calm}>
      <View style={[styles.art, { backgroundColor: c.note.fill[tone], borderColor: c.note.ink }]}>
        <Icon name={icon} size={22} color={c.note.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="subhead" size={17.5}>{title}</T>
        <T v="body" size={14} lh={1.5} color={c.ink2} style={{ marginTop: 4 }}>{children}</T>
        {actions ? <View style={styles.calmActs}>{actions}</View> : null}
      </View>
    </View>
  );
}

export function DateBlock({ w, d, m, size = 44 }: { w?: string; d: number; m: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.dd, { width: size, borderColor: c.line, backgroundColor: c.paper }]}>
      {w ? <T v="kicker" size={9} ls={0.08} color={c.ink3}>{w}</T> : null}
      <T v="title" size={18} lh={1.05} ls={-0.03}>{String(d)}</T>
      <T v="kicker" size={9} ls={0.08} color={c.ink3}>{m}</T>
    </View>
  );
}

export function SecNote({ title, sum }: { title: string; sum?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.sec}>
      <T v="title" size={22} ls={-0.03} accessibilityRole="header">{title}</T>
      {sum ? <T v="mono" size={11.5} color={c.ink3}>{sum}</T> : null}
      <View style={[styles.secRule, { borderTopColor: c.line2 }]} />
    </View>
  );
}

/** A statement line: label, dotted leader, value. */
export function Leader({ k, v, color, total, sub, strong, note }: {
  k: string; v: string; color?: string; total?: boolean; sub?: boolean; strong?: boolean; note?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.ldr, sub && { paddingLeft: 16 }, total && [styles.ldrTot, { borderTopColor: c.ink }]]}>
      <T v={total || strong ? "bodyStrong" : "body"} size={sub ? 13.5 : 14} color={total || strong ? c.ink : c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>
        {k}{note ? <T v="meta" size={11.5} color={c.ink3}>{`  · ${note}`}</T> : null}
      </T>
      <View style={[styles.dots, { borderBottomColor: c.line2 }]} />
      {total
        ? <T v="title" size={19} ls={-0.03} color={color ?? c.ink}>{v}</T>
        : <T v="mono" size={13} color={color ?? c.ink}>{v}</T>}
    </View>
  );
}

/** A two-option pill toggle (.tr-ranges, .tr-donut-toggle, .tr-txtabs). */
export function PillToggle<K extends string>({ value, options, onChange, mono, inkOn, label }: {
  value: K; options: readonly (readonly [K, string])[]; onChange: (k: K) => void; mono?: boolean; inkOn?: boolean; label: string;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.toggle, { backgroundColor: inkOn ? c.card : c.paper2, borderColor: c.line }]} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={4}
            style={[styles.toggleB, on && (inkOn ? { backgroundColor: c.ink } : { backgroundColor: c.card, borderColor: c.ink, borderWidth: 1.5 })]}>
            {mono
              ? <T v="mono" size={11} color={on ? c.ink : c.ink3}>{l}</T>
              : <T v="buttonSm" size={12.5} color={on ? (inkOn ? c.paper : c.ink) : c.ink3}>{l}</T>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 17, borderRadius: 999, borderWidth: 1.5, alignSelf: "flex-start" },
  btnSm: { paddingVertical: 6, paddingHorizontal: 13, gap: 7 },
  kbd: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  card: { borderWidth: 1.5, borderRadius: 22, overflow: "visible" },
  cardH: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  calm: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  art: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }], marginTop: 2 },
  calmActs: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dd: { borderWidth: 1.5, borderRadius: 11, alignItems: "center", paddingTop: 4, paddingBottom: 5 },
  sec: { flexDirection: "row", alignItems: "baseline", gap: 14, marginTop: 40, marginBottom: 14 },
  secRule: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", transform: [{ translateY: -6 }] },
  ldr: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 6 },
  ldrTot: { marginTop: 8, paddingTop: 10, borderTopWidth: 1.5 },
  dots: { flex: 1, minWidth: 16, borderBottomWidth: 2, borderStyle: "dotted", transform: [{ translateY: -4 }] },
  toggle: { flexDirection: "row", gap: 2, padding: 3, borderRadius: 999, borderWidth: 1.5 },
  toggleB: { paddingVertical: 4, paddingHorizontal: 11, borderRadius: 999, borderWidth: 0, borderColor: "transparent" },
});
