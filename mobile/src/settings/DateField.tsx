/**
 * A date field for forms whose dates can be months apart (Semesters): the web's
 * <input type="date">. Tap the field and a month grid unfolds under it (‹ › page the
 * months); tap a day to set it and fold it away. Value is YYYY-MM-DD, "" when unset.
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

export function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (v: string) => void; min?: string }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const base = value || min || todayIso();
  const [cursor, setCursor] = useState(() => ({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }));
  const shown = value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Choose a date";

  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const page = (n: number) => { haptics.select(); setCursor(p => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };
  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <View style={{ gap: 4 }}>
      <T v="meta" size={11.8} color={c.ink2} style={{ fontWeight: "600" }}>{label}</T>
      <Pressable onPress={() => { if (!open) setCursor({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }); setOpen(o => !o); }} accessibilityRole="button" accessibilityLabel={`${label}, ${value ? shown : "not chosen"}`} accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.field, { borderColor: open ? c.ink : c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
        <T v="body" size={15} color={value ? c.ink : c.ink3} style={{ flex: 1 }}>{shown}</T>
        <Icon name="cal" size={15} color={c.ink3} />
      </Pressable>
      {open ? (
        <View style={[styles.grid, { borderColor: c.line2, backgroundColor: c.card }]}>
          <View style={styles.head}>
            <Pressable onPress={() => page(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month" style={({ pressed }) => pressed && pressedDim}>
              <Icon name="chev-l" size={16} color={c.ink2} />
            </Pressable>
            <T v="bodyStrong" size={14}>{monthName}</T>
            <Pressable onPress={() => page(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month" style={({ pressed }) => pressed && pressedDim}>
              <Icon name="chev-r" size={16} color={c.ink2} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {WEEK.map((w, i) => <T key={i} v="label" size={10} color={c.ink3} style={styles.cellText}>{w}</T>)}
          </View>
          <View style={styles.cells}>
            {cells.map((d, i) => {
              if (d == null) return <View key={i} style={styles.cell} />;
              const v = iso(cursor.y, cursor.m, d);
              const on = v === value;
              const blocked = !!min && v < min;
              return (
                <Pressable key={i} disabled={blocked} onPress={() => { haptics.select(); onChange(v); setOpen(false); }}
                  accessibilityRole="button" accessibilityState={{ selected: on, disabled: blocked }}
                  accessibilityLabel={new Date(`${v}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  style={styles.cell}>
                  <View style={[styles.day, on && { backgroundColor: c.ink }]}>
                    <T v="body" size={14} color={on ? c.paper : blocked ? c.faint : c.ink}>{String(d)}</T>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 11, height: 42 },
  grid: { borderWidth: 1.5, borderRadius: 12, padding: 10, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  week: { flexDirection: "row" },
  cells: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 2 },
  cellText: { width: `${100 / 7}%`, textAlign: "center" },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
