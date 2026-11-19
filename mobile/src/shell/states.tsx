/**
 * Loading, empty, error and offline: the four non-happy states every screen needs, as
 * reusable pieces so no screen improvises them.
 *
 *   SkeletonCard   first load: faint ruled lines in the card's own shape. Never a spinner
 *                  in a card. Appears after 140ms so a fast answer never flashes it.
 *   EmptyState     the web's day-one pattern: three small pictures, one line, and a button
 *                  only when the member can actually act.
 *   ErrorState     nothing to show and the server didn't answer: says so, Try again.
 *   StaleNote      showing last-known data (offline, or the refresh failed): one quiet line.
 *   QueryState     picks between them for a TanStack query.
 *
 * Motion: content and skeletons cross-fade in (180ms, opacity only). Reduced motion keeps
 * the same fades: they carry no travel.
 */
import { onlineManager, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { Icon, type IconName } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { Button } from "~/paper/Button";
import { Tape } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { soft } from "~/theme/shadow";
import { T } from "~/ui/T";

/* ── fade-in wrapper ──────────────────────────────────────────────────────────── */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const m = useMotion();
  const op = useSharedValue(0);
  useEffect(() => { op.value = withDelay(m.t(delay), withTiming(1, m.timing(DUR.fade, "out"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.View style={[s, style]}>{children}</Animated.View>;
}

/* ── skeletons ────────────────────────────────────────────────────────────────── */
export interface SkeletonCardProps {
  /** Ruled lines of body text to suggest. */
  lines?: number;
  /** A title bar on the first line. */
  title?: boolean;
  /** A leading square (row-style cards: icon/date tile). */
  lead?: boolean;
  /** Fixed height for hero shapes (the Up next ticket, the check-in band). */
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

const SK_LINE = 26;

export function SkeletonCard({ lines = 3, title = true, lead, height, radius = 22, style }: SkeletonCardProps) {
  const { c } = useTheme();
  const rule = alpha(c.pastel.sky.ink, 0.1);
  const widths = [0.92, 0.78, 0.64, 0.86, 0.5];
  return (
    <FadeIn delay={140}>
      <View
        accessibilityLabel="Loading"
        style={[styles.sk, { borderRadius: radius, borderColor: c.line, backgroundColor: c.card, minHeight: height }, soft(c.sh1), style]}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          {lead ? <View style={[styles.skLead, { backgroundColor: c.skel }]} /> : null}
          <View style={{ flex: 1, gap: 0 }}>
            {title ? <View style={[styles.skTitle, { backgroundColor: c.skel }]} /> : null}
            {Array.from({ length: lines }, (_, i) => (
              <View key={i} style={[styles.skRow, { borderBottomColor: rule }]}>
                <View style={[styles.skBar, { backgroundColor: c.skel, width: `${Math.round((widths[i % widths.length] ?? 0.7) * 100)}%` }]} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </FadeIn>
  );
}

/** A few skeleton rows for a list screen. */
export function SkeletonList({ count = 3, lead = true }: { count?: number; lead?: boolean }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: count }, (_, i) => <SkeletonCard key={i} lines={2} lead={lead} />)}</View>;
}

/* ── empty / day one ──────────────────────────────────────────────────────────── */
export interface Picture { icon: IconName; tone: Tone; label: string }

export function EmptyState({ pictures, title, line, action, compact }: {
  /** Exactly the three things this place will hold once it's in use. */
  pictures?: readonly [Picture, Picture, Picture];
  title: string;
  line?: string;
  /** Only when the member can act on it. */
  action?: { label: string; onPress: () => void; icon?: IconName };
  /** A card-sized empty (inside a section) rather than a whole page. */
  compact?: boolean;
}) {
  const { c } = useTheme();
  const tilt = [-4, 2, -1.5];
  return (
    <FadeIn>
      <View style={[styles.empty, compact && styles.emptyCompact, compact && { borderColor: c.line2 }]}>
        {pictures && !compact ? (
          <View style={styles.pics} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {pictures.map((p, i) => (
              <View key={p.label} style={[styles.pic, { backgroundColor: c.card, borderColor: c.line2, transform: [{ rotate: `${tilt[i]}deg` }] }, soft(c.sh1)]}>
                <Tape width={30} rotate={i % 2 ? 4 : -5} style={styles.picTape} />
                <View style={[styles.picArt, { backgroundColor: c.pastel[p.tone].soft, borderColor: c.pastel[p.tone].border }]}>
                  <Icon name={p.icon} size={24} color={c.pastel[p.tone].ink} />
                </View>
                <T v="pill" color={c.ink2} align="center" numberOfLines={2}>{p.label}</T>
              </View>
            ))}
          </View>
        ) : null}
        <T v={compact ? "subhead" : "heading"} align="center" color={compact ? c.ink2 : c.ink}>{title}</T>
        {line ? <T v="meta" align="center" color={c.ink3} style={{ maxWidth: 300 }}>{line}</T> : null}
        {action ? <Button label={action.label} icon={action.icon} onPress={action.onPress} style={{ alignSelf: "center", marginTop: 6 }} /> : null}
      </View>
    </FadeIn>
  );
}

/* ── error ────────────────────────────────────────────────────────────────────── */
export function ErrorState({ title = "Couldn't load this.", error, onRetry, compact }: {
  title?: string; error?: unknown; onRetry?: () => void; compact?: boolean;
}) {
  const { c } = useTheme();
  const online = useOnline();
  const why = !online ? "You're offline, and there's no saved copy on this phone yet." : error ? errorMessage(error) : null;
  return (
    <FadeIn>
      <View style={[styles.err, compact && { paddingVertical: 16 }, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]} accessibilityRole="alert">
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Icon name="alert" size={16} color={c.pastel.rose.ink} />
          <T v="subhead" style={{ flex: 1 }}>{title}</T>
        </View>
        {why ? <T v="meta" color={c.ink2}>{why}</T> : null}
        {onRetry ? <Button label="Try again" icon="refresh" variant="ghost" tone="rose" size="sm" onPress={onRetry} /> : null}
      </View>
    </FadeIn>
  );
}

/* ── stale / offline ──────────────────────────────────────────────────────────── */
export function useOnline(): boolean {
  return useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline(), () => true);
}

function clock(ms: number): string {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${t}`;
}

/** One line over last-known data. Renders nothing when the data is current. */
export function StaleNote({ updatedAt, failed, onRetry }: { updatedAt: number; failed?: boolean; onRetry?: () => void }) {
  const { c } = useTheme();
  const online = useOnline();
  if (online && !failed) return null;
  const msg = online ? `Couldn't refresh · showing ${clock(updatedAt)}` : `Offline · showing what you saw ${clock(updatedAt)}`;
  return (
    <FadeIn>
      <View style={[styles.stale, { borderColor: c.line2, backgroundColor: c.paper2 }]} accessibilityRole="text">
        <Icon name={online ? "alert" : "clock"} size={13} color={c.ink3} />
        <T v="meta" color={c.ink2} style={{ flex: 1 }}>{msg}</T>
        {online && onRetry ? <T v="buttonSm" color={c.ink} onPress={onRetry} accessibilityRole="button">Retry</T> : null}
      </View>
    </FadeIn>
  );
}

/* ── query → state ────────────────────────────────────────────────────────────── */
export function QueryState<D>({ query, skeleton, isEmpty, empty, errorTitle, children }: {
  query: UseQueryResult<D>;
  skeleton: ReactNode;
  isEmpty?: (d: D) => boolean;
  empty?: ReactNode;
  errorTitle?: string;
  children: (d: D) => ReactNode;
}) {
  const { data, isError, error, refetch, dataUpdatedAt } = query;
  if (data === undefined) {
    if (isError) return <ErrorState title={errorTitle} error={error} onRetry={() => void refetch()} />;
    return <>{skeleton}</>;
  }
  return (
    <>
      <StaleNote updatedAt={dataUpdatedAt} failed={isError} onRetry={() => void refetch()} />
      {isEmpty?.(data) && empty ? empty : <FadeIn>{children(data)}</FadeIn>}
    </>
  );
}

const styles = StyleSheet.create({
  sk: { borderWidth: 1.5, padding: 16 },
  skLead: { width: 44, height: 44, borderRadius: 12 },
  skTitle: { height: 14, width: "55%", borderRadius: 7, marginBottom: 6 },
  skRow: { height: SK_LINE, justifyContent: "center", borderBottomWidth: 1 },
  skBar: { height: 8, borderRadius: 4 },

  empty: { alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
  emptyCompact: { paddingVertical: 22, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16 },
  pics: { flexDirection: "row", gap: 12, marginBottom: 14 },
  pic: { width: 92, alignItems: "center", gap: 8, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 8, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  picTape: { position: "absolute", top: -7, alignSelf: "center" },
  picArt: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },

  err: { gap: 8, padding: 16, borderRadius: 18, borderWidth: 1.5 },
  stale: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
});
