/**
 * Settings → Activity log (the web's sections/ActivityLogSection.tsx at phone width).
 * Every word and rule from @/lib/settings/activity-log:
 *
 *   All / Info / Success / Warning · one card of rows (type dot, message, when) or the
 *   empty state · the officer-access card when the server says 403
 *
 * GET /api/activity/full is platform-admin only, so most people see the card, as on the
 * web. Everyone reaches the page (the web lists it for everyone).
 */
import type { ActivityLogRow } from "@/lib/api-types";
import { ACTIVITY_FILTERS, ACTIVITY_LOG_COPY as C, formatActivityTime, type ActivityFilter } from "@/lib/settings/activity-log";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useActivityLog } from "~/data/settings";
import { haptics } from "~/motion/haptics";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Empty, Note, ScBtn, ScCard } from "./ledger";

export function ActivityLogSection() {
  const { c } = useTheme();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const q = useActivityLog(filter);
  const dot = (t: string) => (t === "success" ? c.pastel.mint.ink : t === "warning" ? c.pastel.butter.ink : c.pastel.lilac.ink);

  if (q.data === null) {
    const p = c.pastel.butter;
    return (
      <View style={[styles.forbidden, { backgroundColor: p.soft, borderColor: p.soft }]} accessibilityRole="alert">
        <T v="title" size={15} color={p.ink}>{C.forbiddenTitle}</T>
        <T v="meta" size={12.8} color={c.ink3} style={{ textAlign: "center" }}>{C.forbiddenHint}</T>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.filters} accessibilityRole="tablist">
        {ACTIVITY_FILTERS.map(f => (
          <ScBtn key={f.id} small kind={filter === f.id ? "accent" : "ghost"} label={f.label}
            onPress={() => { if (filter !== f.id) { haptics.select(); setFilter(f.id); } }} />
        ))}
      </View>
      {q.isPending ? (
        <Note style={{ textAlign: "center", paddingVertical: 24 }}>{C.loading}</Note>
      ) : q.isError ? (
        <T v="meta" size={12.8} color={c.pastel.rose.ink} accessibilityRole="alert">{errorMessage(q.error)}</T>
      ) : q.data.length === 0 ? (
        <Empty title={C.empty} hint="" />
      ) : (
        <ScCard>
          {q.data.map((r: ActivityLogRow, i) => (
            <View key={r.id} style={[styles.row, i < q.data!.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.card2 }]}>
              <View style={[styles.dot, { backgroundColor: dot(r.type) }]} />
              <T v="meta" size={12.5} lh={1.35} color={c.ink2} style={{ flex: 1 }}>{r.message}</T>
              <T v="mono" size={10.5} color={c.faint}>{formatActivityTime(r.timestamp)}</T>
            </View>
          ))}
        </ScCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  forbidden: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 16, alignItems: "center", gap: 4 },
});
