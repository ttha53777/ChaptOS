/**
 * Settings pieces, one per web class family so a diff against the web is mechanical:
 *
 *   PathIcon      the index's heroicon paths (`PathIcon` in settings/page.tsx)
 *   DividerTab    `.set-ix-grp .grp-label` / `.set-detail-head .kicker` (the binder tab)
 *   IxSheet/IxRow `.ix-ledger` + `.ix-row` (paper-settings.css)
 *   DetailHead    `.set-detail-head` (tab, h2, italic lede)
 *   Step          `.id-step` / `.rs-step` (numbered disc, title, sub, body)
 *   Face          accounts/Face.tsx + roles/HolderAvatar.tsx (photo or pastel initials, key badge)
 *   RoleChip      `.rs-chip` (tinted pill with the role's dot)
 *   PillBtn       `.id-btn sm` / `.ac-btn sm` / `.sc-btn` (ghost, ink, rose, gold, butter)
 *   SearchBox     `.ac-search` / `.rp-search`
 *   ViewSwitch    `.ac-views` / `.rp-views` (two pressed-state buttons)
 *   CheckRow      `.sc-check` (the paper checkbox)
 */
import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { alpha, TONES, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

/** A heroicons-style stroke path (24×24), as the web index draws it. */
export function PathIcon({ d, size = 16, color }: { d: string; size?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? c.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} />
    </Svg>
  );
}

/** The binder tab: a pastel tab with an inked top and sides. */
export function DividerTab({ label, tone, onPress, small }: { label: string; tone: Tone; onPress?: () => void; small?: boolean }) {
  const { c } = useTheme();
  const body = (
    <View style={[small ? styles.tabSm : styles.tab, { backgroundColor: c.note.fill[tone], borderColor: c.ink }]}>
      <T v={small ? "kicker" : "subhead"} size={small ? 10 : 15} color={c.note.ink}>{label}</T>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => pressed && { transform: [{ translateY: -2 }] }}>
      {body}
    </Pressable>
  );
}

/** The ruled sheet behind a tab (`.ix-ledger`): card, inked edge, the tab's hard shadow. */
export function IxSheet({ tone, lede, children }: { tone: Tone; lede?: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.note.fill[tone]}` }]}>
      {lede ? (
        <View style={[styles.ixLede, { borderBottomColor: c.pastel[tone].soft }]}>
          <T v="meta" size={13.5} color={c.ink3}>{lede}</T>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function IxRow({ icon, label, blurb, tone, last, onPress, dot }: {
  icon: string; label: string; blurb: string; tone: Tone; last?: boolean; onPress: () => void; dot?: boolean;
}) {
  const { c } = useTheme();
  const p = c.pastel[tone];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={blurb}
      style={({ pressed }) => [styles.ixRow, !last && { borderBottomWidth: 1, borderBottomColor: p.border }, pressed && { backgroundColor: p.soft }]}>
      <View style={[styles.ixIc, { backgroundColor: p.soft, borderColor: alpha(p.ink, 0.35) }]}><PathIcon d={icon} color={p.ink} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T v="bodyStrong" size={15} ls={-0.01}>{label}</T>
          {dot ? <View style={[styles.dot, { backgroundColor: c.pastel.rose.ink, boxShadow: `0 0 0 3px ${c.pastel.rose.soft}` }]} /> : null}
        </View>
        <T v="meta" size={12.8} color={c.ink3}>{blurb}</T>
      </View>
      <Icon name="chev-r" size={16} color={c.ink3} />
    </Pressable>
  );
}

/** A page's head: the tab it was pulled from, the title, the italic lede. */
export function DetailHead({ kicker, tone, title, lede }: { kicker?: string; tone: Tone; title: string; lede: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {kicker ? <View style={{ alignSelf: "flex-start" }}><DividerTab label={kicker} tone={tone} small /></View> : null}
      <T v="hero" size={34} accessibilityRole="header">{title}</T>
      <T v="body" size={17} lh={1.45} color={c.ink2} style={{ fontStyle: "italic" }}>{lede}</T>
    </View>
  );
}

/** One numbered step: disc, title, the sub line, then its body. */
export function Step({ n, tone, title, sub, done, children }: { n: number; tone: Tone; title: string; sub?: string; done?: boolean; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.step}>
      <View style={styles.stepH}>
        <View style={[styles.stepN, { backgroundColor: done ? c.ink : c.note.fill[tone], borderColor: c.ink }]}>
          <T v="buttonSm" size={13} color={done ? c.paper : c.note.ink}>{String(n)}</T>
        </View>
        <T v="title" size={22} accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
      </View>
      {sub ? <T v="body" size={15} color={c.ink3}>{sub}</T> : null}
      {children ? <View style={{ marginTop: 6 }}>{children}</View> : null}
    </View>
  );
}

const FACE_TONES: readonly Tone[] = ["peach", "sky", "mint", "butter", "lilac", "rose"];
const faceInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
/** accounts/Face.tsx tints by the name's char codes; roles/HolderAvatar by id. */
export const toneForName = (name: string): Tone => FACE_TONES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % FACE_TONES.length]!;
export const toneForId = (id: number): Tone => FACE_TONES[Math.abs(id) % FACE_TONES.length]!;

/** A member's photo or pastel initials, with a key badge for admins. */
export function Face({ name, uri, admin, size = 40, tone }: { name: string; uri?: string | null; admin?: boolean; size?: number; tone?: Tone }) {
  const { c } = useTheme();
  const t = tone ?? toneForName(name);
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.note.fill[t], borderColor: c.ink }]}>
        {uri
          ? <Image source={{ uri }} style={{ width: size, height: size }} />
          : <T v="buttonSm" size={Math.max(10, size * 0.32)} color={c.note.ink}>{faceInitials(name)}</T>}
      </View>
      {admin ? (
        <View style={[styles.key, { backgroundColor: c.note.fill.butter, borderColor: c.ink }]}><Icon name="key" size={10} color={c.note.ink} /></View>
      ) : null}
    </View>
  );
}

/** A role as every surface draws it: tinted pill, color dot, name. */
export function RoleChip({ name, color, ghost, onRemove, removeLabel }: { name: string; color: string; ghost?: boolean; onRemove?: () => void; removeLabel?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: ghost ? "transparent" : alpha(color, 0.14), borderColor: alpha(color, 0.55), borderStyle: ghost ? "dashed" : "solid" }]}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <T v="pill" size={12} color={c.ink}>{name}</T>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={removeLabel} style={({ pressed }) => pressed && pressedDim}>
          <Icon name="x" size={11} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type PillKind = "ghost" | "ink" | "rose" | "roseSolid" | "gold" | "butter" | "dashed";

export function PillBtn({ label, onPress, kind = "ghost", icon, disabled, small = true, accessibilityLabel, style }: {
  label: string; onPress: () => void; kind?: PillKind; icon?: IconName; disabled?: boolean; small?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const look: Record<PillKind, { bg: string; fg: string; bd: string; dashed?: boolean }> = {
    ghost: { bg: c.card, fg: c.ink, bd: c.line2 },
    ink: { bg: c.ink, fg: c.paper, bd: c.ink },
    rose: { bg: c.card, fg: c.pastel.rose.ink, bd: alpha(c.pastel.rose.ink, 0.5) },
    roseSolid: { bg: c.pastel.rose.ink, fg: c.paper, bd: c.pastel.rose.ink },
    gold: { bg: c.card, fg: c.pastel.butter.ink, bd: alpha(c.pastel.butter.ink, 0.55) },
    butter: { bg: c.note.fill.butter, fg: c.note.ink, bd: c.ink },
    dashed: { bg: "transparent", fg: c.ink2, bd: c.line2, dashed: true },
  };
  const l = look[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} hitSlop={6}
      style={({ pressed }) => [small ? styles.pillSm : styles.pill, { backgroundColor: l.bg, borderColor: l.bd, borderStyle: l.dashed ? "dashed" : "solid", opacity: disabled ? 0.5 : 1 }, pressed && pressedDim, style]}>
      {icon ? <Icon name={icon} size={small ? 13 : 15} color={l.fg} /> : null}
      <T v="buttonSm" size={small ? 13 : 14} color={l.fg}>{label}</T>
    </Pressable>
  );
}

export function SearchBox({ value, onChange, placeholder, label, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; autoFocus?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.search, { borderColor: c.line2, backgroundColor: c.card }]}>
      <Icon name="search" size={15} color={c.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.ink3} autoCorrect={false} autoCapitalize="none"
        autoFocus={autoFocus} returnKeyType="search" accessibilityLabel={label ?? placeholder} style={[styles.searchInput, { color: c.ink }]} />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityLabel="Clear search" style={({ pressed }) => pressed && pressedDim}>
          <Icon name="x" size={14} color={c.ink3} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ViewSwitch<V extends string>({ value, options, onChange, label }: {
  value: V; options: { id: V; label: string; icon: IconName; n?: number }[]; onChange: (v: V) => void; label: string;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.views, { borderColor: c.line, backgroundColor: c.paper2 }]} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => { if (!on) { haptics.select(); onChange(o.id); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[styles.viewBtn, on && { backgroundColor: c.card, borderColor: c.ink }]}>
            <Icon name={o.icon} size={14} color={on ? c.ink : c.ink3} />
            <T v="buttonSm" size={13} color={on ? c.ink : c.ink3}>{o.label}</T>
            {o.n != null ? <T v="mono" size={11} color={on ? c.ink2 : c.ink3}>{String(o.n)}</T> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function CheckRow({ on, onChange, label, small }: { on: boolean; onChange: (v: boolean) => void; label: string; small?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.tap(); onChange(!on); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={6}
      style={styles.check}>
      <View style={[styles.box, { borderColor: c.ink, backgroundColor: on ? c.ink : c.card }]}>{on ? <T v="pill" size={11} color={c.paper}>✓</T> : null}</View>
      <T v="meta" size={small ? 12.5 : 13} color={c.ink2} style={{ flexShrink: 1 }}>{label}</T>
    </Pressable>
  );
}

/** A small group heading with a coloured square (`.ac-grp-h`, `.id-w-group-h`). */
export function GroupHead({ label, tone, n }: { label: string; tone: Tone; n?: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.grpH}>
      <View style={[styles.grpSq, { backgroundColor: c.note.fill[tone], borderColor: c.ink }]} />
      <T v="label" color={c.ink2} style={{ flex: 1 }}>{label}</T>
      {n != null ? <T v="mono" size={11} color={c.ink3}>{String(n)}</T> : null}
    </View>
  );
}

export const isTone = (t: string): t is Tone => (TONES as readonly string[]).includes(t);

const styles = StyleSheet.create({
  tab: { height: 30, paddingHorizontal: 16, paddingBottom: 3, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 12, borderTopRightRadius: 12, justifyContent: "center" },
  tabSm: { paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1.5, borderBottomWidth: 3, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  sheet: { borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 18, borderBottomRightRadius: 10, borderBottomLeftRadius: 16, overflow: "hidden" },
  ixLede: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1.5 },
  ixRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 11, paddingHorizontal: 18, minHeight: 56 },
  ixIc: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  step: { gap: 6 },
  stepH: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepN: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  face: { borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  key: { position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, alignSelf: "flex-start" },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  pillSm: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, alignSelf: "flex-start", minHeight: 32 },
  pill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, alignSelf: "flex-start", minHeight: 40 },
  search: { flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, paddingRight: 10, borderRadius: 999, borderWidth: 1.5, height: 42 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  views: { flexDirection: "row", borderWidth: 1.5, borderRadius: 999, padding: 3, alignSelf: "flex-start" },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1.5, borderColor: "transparent" },
  check: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 32 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  grpH: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  grpSq: { width: 11, height: 11, borderRadius: 3, borderWidth: 1.5 },
});
