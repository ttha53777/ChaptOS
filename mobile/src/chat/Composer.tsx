/**
 * The Ask Chapt dock (mock `.composer`): attached-file chips above a rounded field
 * (16pt so iOS never zooms, grows to ~5 lines), the paper-clip when this chapter lets
 * members attach files, and one round button that is Send, or Stop while a turn runs.
 *
 * File chips: an uploading chip fills left to right as bytes leave (scaleX on a fill
 * layer), "Reading…" while the server extracts, then ready. A refused file shakes once
 * and keeps the server's reason in a line under the chip row (reduced motion: the chip
 * blushes instead of shaking). Tap × to drop a file.
 */
import type { FileLimits } from "@/lib/api-types";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { addFiles, filesBusy, removeFile, useFiles, type FileChip } from "./files";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export function Composer({ value, onChange, onSend, onStop, streaming, limits, onFocus, onBlur, inputRef }: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  limits: FileLimits | null;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: RefObject<ComponentRef<typeof TextInput> | null>;
}) {
  const { c } = useTheme();
  const files = useFiles();
  const [focused, setFocused] = useState(false);
  const busy = filesBusy(files.chips);
  const canSend = !streaming && !busy && value.trim().length > 0;
  const failed = files.chips.filter(f => f.status === "failed");

  const pick = async () => {
    if (!limits) return;
    haptics.select();
    const types = limits.extensions.map(e => MIME[e]).filter((x): x is string => !!x);
    const res = await DocumentPicker.getDocumentAsync({ type: types.length ? types : "*/*", multiple: true, copyToCacheDirectory: true }).catch(() => null);
    if (!res || res.canceled) return;
    addFiles(res.assets.map(a => ({ uri: a.uri, name: a.name, size: a.size ?? null, mimeType: a.mimeType ?? null })), limits);
  };

  return (
    <View style={{ gap: 8 }}>
      {files.chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
          {files.chips.map(f => <Chip key={f.key} f={f} />)}
        </ScrollView>
      ) : null}
      {failed.length ? <T v="meta" color={c.pastel.rose.ink} accessibilityLiveRegion="polite">{failed[failed.length - 1]!.error}</T> : null}
      <View style={[styles.box, { borderColor: focused ? c.ink : c.line2, backgroundColor: c.paper2 }, focused && { boxShadow: [{ offsetX: 2, offsetY: 2, blurRadius: 0, spreadDistance: 0, color: c.pastel.lilac.fill }] }]}>
        {limits ? (
          <Pressable onPress={() => void pick()} disabled={streaming} accessibilityRole="button" accessibilityLabel="Attach a file" hitSlop={6} style={styles.clip}>
            <Icon name="clip" size={18} color={c.ink2} />
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder="Ask the chapter anything…"
          placeholderTextColor={c.faint}
          multiline
          submitBehavior="submit"
          returnKeyType="send"
          enablesReturnKeyAutomatically
          onSubmitEditing={() => { if (canSend) onSend(); }}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          accessibilityLabel="Ask Chapt"
          style={[styles.input, { color: c.ink, paddingLeft: limits ? 2 : 15 }]}
        />
        {streaming ? (
          <Pressable onPress={() => { haptics.tap(); onStop(); }} accessibilityRole="button" accessibilityLabel="Stop" style={[styles.send, { backgroundColor: c.ink }]}>
            <View style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: c.paper }} />
          </Pressable>
        ) : (
          <Pressable onPress={() => { if (canSend) { haptics.tap(); onSend(); } }} disabled={!canSend} accessibilityRole="button" accessibilityLabel="Ask" accessibilityState={{ disabled: !canSend }}
            style={[styles.send, { backgroundColor: canSend ? c.ink : c.paper3 }]}>
            <View style={{ transform: [{ rotate: "-90deg" }] }}><Icon name="arrow-r" size={16} color={canSend ? c.paper : c.faint} /></View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Chip({ f }: { f: FileChip }) {
  const { c } = useTheme();
  const m = useMotion();
  const fill = useSharedValue(f.progress);
  const shake = useSharedValue(0);
  const blush = useSharedValue(0);
  const wasFailed = useRef(f.status === "failed");

  useEffect(() => { fill.value = withTiming(f.progress, { duration: m.t(160) }); }, [f.progress, fill, m]);
  useEffect(() => {
    if (f.status === "failed" && !wasFailed.current) {
      haptics.error();
      if (m.reduced) blush.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0.4, { duration: 600 }));
      else shake.value = withSequence(...[-6, 6, -4, 4, -2, 0].map(x => withTiming(x, { duration: 55 })));
    }
    wasFailed.current = f.status === "failed";
  }, [f.status, m.reduced, shake, blush]);

  const fillSt = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const shakeSt = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const blushSt = useAnimatedStyle(() => ({ opacity: blush.value }));
  const failed = f.status === "failed";
  const p = failed ? c.pastel.rose : f.status === "ready" ? c.pastel.sky : c.pastel.lilac;
  const label = failed ? "Not attached" : f.status === "uploading" ? `${Math.round(f.progress * 100)}%` : f.status === "reading" ? "Reading…" : null;

  return (
    <Animated.View style={[styles.chip, { borderColor: p.border, backgroundColor: c.card }, shakeSt]}
      accessible accessibilityLabel={`${f.name}${label ? `, ${label}` : ", attached"}`}>
      {f.status === "uploading" ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.soft, transformOrigin: "0% 50%" }, fillSt]} /> : null}
      {failed ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.pastel.rose.soft }, blushSt]} /> : null}
      <Icon name={failed ? "alert" : "doc"} size={13} color={p.ink} />
      <T v="pill" numberOfLines={1} style={{ maxWidth: 140 }}>{f.name}</T>
      {label ? <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>{label}</T> : null}
      <Pressable onPress={() => { haptics.select(); removeFile(f.key); }} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
        <Icon name="x" size={12} color={c.ink3} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "flex-end", gap: 6, borderWidth: 1.5, borderRadius: 22, padding: 4 },
  clip: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22, maxHeight: 122, paddingTop: 8, paddingBottom: 8, fontFamily: "Inter-400" },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" },
});
