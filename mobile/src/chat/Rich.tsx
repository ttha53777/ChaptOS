/**
 * Ask Chapt text, rendered (never injected):
 *  - Verdict: the answer's headline. One *emphasis* span is drawn with the highlighter in
 *    the answer's tone; everything else is plain.
 *  - Prose: a plain-text reply, MarkdownLite-ish like the web: paragraphs, "- " / "1. "
 *    lists, **bold** and *italic*. Names the server tagged (note_refs) become links that
 *    open the record sheet.
 */
import type { EntityRef } from "@/lib/api-types";
import { Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { alpha, type Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { haptics } from "~/motion/haptics";
import { T } from "~/ui/T";
import { usableRef } from "./shapes/common";

export function Verdict({ text, tone }: { text: string; tone: Tone }) {
  const { c } = useTheme();
  const m = /^([\s\S]*?)\*([^*]+)\*([\s\S]*)$/.exec(text);
  const plain = text.replace(/\*/g, "");
  return (
    <T v="title" accessibilityRole="header" accessibilityLabel={plain} style={{ fontSize: 21, lineHeight: 26 }}>
      {m ? <>{m[1]}<T v="title" style={{ fontSize: 21, lineHeight: 26, backgroundColor: alpha(c.pastel[tone].fill, c.markOp) }}>{m[2]}</T>{m[3]!.replace(/\*/g, "")}</> : plain}
    </T>
  );
}

type Ref = { text: string; ref: EntityRef };

function inline(s: string, refs: Ref[], onRef: ((r: EntityRef) => void) | undefined, ink: string, key: string): ReactNode[] {
  // **bold**, *italic*, then tagged names inside the plain runs.
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <T key={`${key}b${i}`} v="body" style={{ fontWeight: "700" }}>{p.slice(2, -2)}</T>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <T key={`${key}i${i}`} v="body" style={{ fontStyle: "italic" }}>{p.slice(1, -1)}</T>;
    if (!refs.length || !onRef) return <Fragment key={`${key}t${i}`}>{p}</Fragment>;
    const names = refs.map(r => r.text).filter(Boolean).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!names.length) return <Fragment key={`${key}t${i}`}>{p}</Fragment>;
    const bits = p.split(new RegExp(`(${names.join("|")})`, "g"));
    return bits.map((b, j) => {
      const r = refs.find(x => x.text === b);
      return r
        ? <T key={`${key}r${i}.${j}`} v="body" color={ink} onPress={() => { const ok = usableRef(r.ref); if (ok) { haptics.select(); onRef(ok); } }} accessibilityRole="link" style={{ textDecorationLine: "underline" }}>{b}</T>
        : <Fragment key={`${key}p${i}.${j}`}>{b}</Fragment>;
    });
  });
}

export function Prose({ text, refs = [], onRef }: { text: string; refs?: Ref[]; onRef?: (r: EntityRef) => void }) {
  const { c } = useTheme();
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        const list = lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (list) {
          return (
            <View key={bi} style={{ gap: 6 }}>
              {lines.map((l, li) => {
                const mk = /^\s*(\d+[.)]|[-*•])\s+(.*)$/.exec(l)!;
                return (
                  <View key={li} style={styles.li}>
                    <T v="body" color={c.ink3} style={{ minWidth: 16 }}>{/\d/.test(mk[1]!) ? mk[1] : "•"}</T>
                    <T v="body" style={{ flex: 1 }}>{inline(mk[2]!, refs, onRef, c.pastel.sky.ink, `${bi}.${li}`)}</T>
                  </View>
                );
              })}
            </View>
          );
        }
        return <T key={bi} v="body">{inline(lines.join("\n"), refs, onRef, c.pastel.sky.ink, `${bi}`)}</T>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({ li: { flexDirection: "row", gap: 6 } });
