/**
 * Pieces every answer block shares: what a block can do (open a record, ask a follow-up,
 * open a screen on the web), the kicker line, and the plain row list, which is also the
 * fallback for any shape this build doesn't draw (the server always sends `rows` for it).
 */
import type { AnswerCitation, AnswerRow, AnswerTone, EntityRef, RefType } from "@/lib/api-types";
import { createContext, useContext } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export interface AnswerActions {
  peek: (ref: EntityRef) => void;
  ask: (q: string) => void;
  /** A screen path relative to the org, opened on the web (the app doesn't have every screen). */
  screen: (path: string) => void;
  /** Open a cited passage of an attached file. */
  cite: (c: AnswerCitation) => void;
}
export const ActionsContext = createContext<AnswerActions>({ peek: () => {}, ask: () => {}, screen: () => {}, cite: () => {} });
export const useActions = () => useContext(ActionsContext);

const KNOWN_REFS: RefType[] = ["member", "event", "task", "transaction"];
/** A ref whose type this build doesn't know is no ref at all (lib/api-types/chat.ts). */
export const usableRef = (r: EntityRef | undefined | null): EntityRef | null => (r && KNOWN_REFS.includes(r.type) && typeof r.id === "number" ? r : null);

export const TONE_OF: Record<AnswerTone, Tone> = { good: "mint", watch: "butter", now: "rose", yours: "sky", chapt: "lilac" };

export function Kicker({ text }: { text: string }) {
  const { c } = useTheme();
  return <T v="kicker" color={c.ink3} style={{ fontSize: 10 }}>{text}</T>;
}

const KIND_ICON: Record<AnswerRow["kind"], IconName> = { person: "people", money: "cash", event: "cal", task: "check", generic: "note" };
const TIER_LABEL = { high: "High", medium: "Medium", later: "Later" } as const;

export function Rows({ rows, start = 0 }: { rows: AnswerRow[]; start?: number }) {
  const { c } = useTheme();
  const a = useActions();
  if (!rows.length) return null;
  return (
    <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
      {rows.map((r, i) => {
        const ref = usableRef(r.ref);
        const tap = ref ? () => a.peek(ref) : r.ask ? () => a.ask(r.ask!) : r.screen ? () => a.screen(r.screen!.path) : null;
        const body = (
          <>
            <Icon name={KIND_ICON[r.kind] ?? "note"} size={15} color={c.ink3} />
            <View style={{ flex: 1 }}>
              <T v="callout" numberOfLines={2}>{r.title}</T>
              {r.subtitle ? <T v="meta" color={c.ink3} numberOfLines={2}>{r.subtitle}</T> : null}
              {r.citations?.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {r.citations.map((ct, j) => (
                    <Pressable key={j} onPress={() => { haptics.select(); a.cite(ct); }} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Open ${ct.name}, ${ct.locator}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.pastel.sky.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Icon name="doc" size={10} color={c.pastel.sky.ink} />
                      <T v="pill" color={c.pastel.sky.ink} numberOfLines={1}>{ct.name} · {ct.locator}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {r.value ? <T v="mono" style={{ fontSize: 13 }}>{r.value}</T> : r.tier ? <T v="pill" color={c.ink2}>{TIER_LABEL[r.tier]}</T> : null}
            {tap ? <Icon name={ref ? "chev-r" : r.screen && !r.ask ? "out" : "arrow-r"} size={13} color={c.ink3} /> : null}
          </>
        );
        const style = [styles.row, (start + i) > start && { borderTopColor: c.line, borderTopWidth: 1 }];
        return tap ? (
          <Pressable key={i} onPress={() => { haptics.select(); tap(); }} accessibilityRole="button" style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}>{body}</Pressable>
        ) : <View key={i} style={style}>{body}</View>;
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  list: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
});
