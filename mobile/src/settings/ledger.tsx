/**
 * The web's shared `.sc-*` section layer (app/paper-settings.css), for the Phase 9b
 * sections that are built from it rather than from their own CSS:
 *
 *   Lede       `.sc-lede`           GrpLabel  `.sc-grp-label` (+ the note under it)
 *   ScCard     `.sc-card` (+ `-pad`) ScRow     `.sc-row` (key, sub, right side)
 *   Locked     `.sc-locked` / `.sc-reorder-hidden`
 *   ScPill     `.sc-pill` (+ vio / ok / muted)
 *   ScCheck    `.sc-check` (inked box, key, sub)
 *   ScBtn      `.sc-btn` primary / ghost / danger / accent, normal and small
 *   Dirty      `.sc-dirty` ("UNSAVED")
 *   Actions    `.sc-actions` (Save, Reset, the Unsaved chip)
 *   Empty      `.sc-empty`
 *   ScInput    `.sc-input` with its `.sc-mlabel`
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function Lede({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <T v="body" size={13.8} lh={1.55} color={c.ink2}>{children}</T>;
}

export function Note({ children, style }: { children: ReactNode; style?: object }) {
  const { c } = useTheme();
  return <T v="meta" size={12.8} lh={1.5} color={c.ink3} style={style}>{children}</T>;
}

export function GrpLabel({ label, note }: { label: string; note?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginLeft: 2, marginBottom: note ? 9 : 8, gap: 4 }}>
      <T v="label" size={10.2} ls={0.09} color={c.ink3} accessibilityRole="header">{label.toUpperCase()}</T>
      {note ? <Note>{note}</Note> : null}
    </View>
  );
}

export function ScCard({ children, pad, style }: { children: ReactNode; pad?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { borderColor: c.line, backgroundColor: c.paper }, pad && { paddingHorizontal: 14 }, style]}>{children}</View>;
}

export function ScRow({ last, children, style }: { last?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.card2 }, style]}>{children}</View>;
}

export function Locked({ label }: { label: string }) {
  const { c } = useTheme();
  return <T v="label" size={9.6} ls={0.09} color={c.ink3}>{label.toUpperCase()}</T>;
}

export type PillTone = "vio" | "ok" | "muted";
export function ScPill({ label, tone = "muted" }: { label: string; tone?: PillTone }) {
  const { c } = useTheme();
  const p = tone === "vio" ? c.pastel.lilac : tone === "ok" ? c.pastel.mint : null;
  return (
    <View style={[styles.pill, { backgroundColor: p?.soft ?? c.paper2, borderColor: p?.border ?? c.line }]}>
      <T v="mono" size={9.3} ls={0.08} color={p?.ink ?? c.ink3} style={{ fontWeight: "700" }}>{label.toUpperCase()}</T>
    </View>
  );
}

export function ScCheck({ on, onChange, label, sub, dim, disabled }: { on: boolean; onChange: () => void; label: string; sub?: string; dim?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.tap(); onChange(); }} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label} accessibilityHint={sub} style={({ pressed }) => [styles.check, pressed && { backgroundColor: c.card2 }]}>
      <View style={[styles.box, { borderColor: on ? c.ink : c.ink3, backgroundColor: on ? c.ink : c.card }]}>
        {on ? <Icon name="check" size={12} color={c.paper} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="bodyStrong" size={14} color={dim ? c.ink2 : c.ink}>{label}</T>
        {sub ? <T v="meta" size={12.5} color={c.ink3}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

export type BtnKind = "primary" | "ghost" | "danger" | "accent";
export function ScBtn({ label, onPress, kind = "ghost", small, disabled, icon, accessibilityLabel }: {
  label: string; onPress: () => void; kind?: BtnKind; small?: boolean; disabled?: boolean; icon?: IconName; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const look = {
    primary: { bg: c.ink, fg: c.paper, bd: c.ink },
    ghost: { bg: c.card, fg: c.ink, bd: c.line2 },
    danger: { bg: c.card, fg: c.pastel.rose.ink, bd: c.pastel.rose.border },
    accent: { bg: c.card, fg: c.ink2, bd: c.line2 },
  }[kind];
  const sm = small || kind === "accent";
  // A disabled primary is a pale sheet, not dimmed ink (paper-overlays.css .sc-btn-primary:disabled).
  const off = disabled && kind === "primary" ? { bg: c.card2, fg: c.ink3, bd: c.line2 } : null;
  const l = off ?? look;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} hitSlop={6}
      style={({ pressed }) => [sm ? styles.btnSm : styles.btn, { backgroundColor: l.bg, borderColor: l.bd, opacity: disabled && !off ? 0.4 : 1 },
        kind === "primary" && !disabled && { boxShadow: `2px 2px 0 ${c.note.fill.mint}` }, pressed && pressedDim]}>
      {icon ? <Icon name={icon} size={13} color={l.fg} /> : null}
      <T v="buttonSm" size={sm ? 12.2 : 13.4} color={l.fg}>{label}</T>
    </Pressable>
  );
}

export function Dirty({ label }: { label: string }) {
  const { c } = useTheme();
  const p = c.pastel.butter;
  return (
    <View style={[styles.dirty, { borderColor: p.border, backgroundColor: p.soft }]} accessibilityLiveRegion="polite">
      <View style={[styles.dirtyDot, { backgroundColor: p.ink }]} />
      <T v="label" size={9.9} ls={0.08} color={p.ink}>{label.toUpperCase()}</T>
    </View>
  );
}

export function Actions({ save, reset, dirty }: { save: { label: string; onPress: () => void; disabled: boolean }; reset: { label: string; onPress: () => void; disabled: boolean }; dirty?: string | null }) {
  return (
    <View style={styles.actions}>
      <ScBtn kind="primary" label={save.label} onPress={save.onPress} disabled={save.disabled} />
      <ScBtn kind="ghost" label={reset.label} onPress={reset.onPress} disabled={reset.disabled} />
      {dirty ? <Dirty label={dirty} /> : null}
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.line2, backgroundColor: c.paper }]}>
      <T v="title" size={15}>{title}</T>
      <T v="meta" size={12.8} color={c.ink3} style={{ textAlign: "center" }}>{hint}</T>
    </View>
  );
}

export function ScInput({ label, mono, invalid, style, ...rest }: TextInputProps & { label?: string; mono?: boolean; invalid?: boolean }) {
  const { c } = useTheme();
  const input = (
    <TextInput placeholderTextColor={c.ink3} accessibilityLabel={label} {...rest}
      style={[styles.input, { borderColor: invalid ? alpha(c.pastel.rose.ink, 0.6) : c.line2, backgroundColor: c.card, color: c.ink }, mono && styles.mono, style]} />
  );
  if (!label) return input;
  return (
    <View style={{ gap: 4 }}>
      <T v="meta" size={11.8} color={c.ink2} style={{ fontWeight: "600" }}>{label}</T>
      {input}
    </View>
  );
}

/** A row of mutually exclusive choices (stands in for the web's <select>). */
export function Choices<V extends string>({ value, options, onChange, label }: { value: V; options: { id: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <T v="meta" size={11.8} color={c.ink2} style={{ fontWeight: "600" }}>{label}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map(o => {
          const on = o.id === value;
          return (
            <Pressable key={o.id} onPress={() => { if (!on) { haptics.select(); onChange(o.id); } }} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[styles.opt, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
              <T v="buttonSm" size={12.5} color={on ? c.paper : c.ink2}>{o.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const scStyles = StyleSheet.create({
  stack: { gap: 18 },
});

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 52 },
  pill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 15, alignSelf: "flex-start", minHeight: 38 },
  btnSm: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11, alignSelf: "flex-start", minHeight: 30 },
  dirty: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  dirtyDot: { width: 6, height: 6, borderRadius: 3 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 22, paddingHorizontal: 16, alignItems: "center", gap: 4 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 11, height: 42, fontSize: 15 },
  mono: { fontFamily: "PlexMono-500", fontSize: 14 },
  opt: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
});
