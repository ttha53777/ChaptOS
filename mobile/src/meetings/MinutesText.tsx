/**
 * The minutes as written, on a legal pad: the markdown the notes editor keeps
 * (lib/agenda-template.ts reads the same lines): `#` headings, `-`/`*`/`•` bullets,
 * `1.` numbers, `[ ]` / `[x]` checklists, and **bold** runs. Read-only: writing minutes
 * is the web's collaborative editor.
 */
import { StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { LegalPad } from "~/paper/stationery";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const CHECK = /^\s*(?:[-*•]\s*)?\[([ xX])\]\s*(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;

function Inline({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <T v="body" color={color} style={{ flex: 1 }}>
      {parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
        ? <T key={i} v="body" color={color} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</T>
        : p)}
    </T>
  );
}

export function MinutesText({ text }: { text: string }) {
  const { c } = useTheme();
  const ink = c.note.ink;
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <LegalPad>
      <View style={{ gap: 4 }}>
        {lines.map((raw, i) => {
          if (!raw.trim()) return <View key={i} style={{ height: 8 }} />;
          const h = HEADING.exec(raw);
          if (h) return <T key={i} v="subhead" color={ink} style={[styles.h, i === 0 && { marginTop: 0 }]}>{h[2]!.replace(/\*\*/g, "")}</T>;
          const ck = CHECK.exec(raw);
          if (ck) {
            const done = ck[1] !== " ";
            return (
              <View key={i} style={styles.item}>
                <View style={[styles.box, { borderColor: ink }]}>{done ? <Icon name="check" size={11} color={ink} /> : null}</View>
                <Inline text={ck[2]!} color={done ? c.ink3 : ink} />
              </View>
            );
          }
          const b = BULLET.exec(raw);
          if (b) return <View key={i} style={styles.item}><T v="body" color={ink} style={styles.mark}>•</T><Inline text={b[1]!} color={ink} /></View>;
          const n = NUMBER.exec(raw);
          if (n) return <View key={i} style={styles.item}><T v="mono" color={ink} style={styles.mark}>{`${n[1]}.`}</T><Inline text={n[2]!} color={ink} /></View>;
          return <View key={i} style={styles.item}><Inline text={raw.trim()} color={ink} /></View>;
        })}
      </View>
    </LegalPad>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: 10, fontSize: 16 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  mark: { width: 18, textAlign: "right" },
  box: { width: 15, height: 15, borderRadius: 4, borderWidth: 1.5, marginTop: 4, alignItems: "center", justifyContent: "center" },
});
