/**
 * Motion Lab: U6 Members & profile. The photo developing, on a bundled image (nothing
 * here calls the API): the print goes in under the sepia wash, breathes while "uploading",
 * then clears to colour (success) or fades off the old photo (failure).
 */
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { DEVELOP_MS, DevelopingPrint, type DevelopState } from "~/moments/Develop";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { initials } from "~/paper/bits";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Section } from "./sections";

const NEW_PRINT = Image.resolveAssetSource(require("../../assets/icon.png"))?.uri ?? null;
const SIZE = 132;

export function DevelopLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [state, setState] = useState<DevelopState>("idle");
  const [have, setHave] = useState(false);

  const run = (ok: boolean) => {
    if (state === "developing") return;
    haptics.tap();
    setState("developing");
    setTimeout(() => {
      if (ok) setState("developed");
      else { haptics.error(); toast.error("Couldn't change your photo", { detail: "Image must be under 2 MB" }); setState("failed"); }
    }, m.t(1800));
  };
  const done = () => {
    if (state === "developed") { haptics.success(); setHave(true); }
    setState("idle");
  };

  return (
    <Section title="Photo develops" note={`The new print goes in under a paper veil + warm tint that breathes (.62 ↔ .48, 900ms) while it uploads; on success the wash clears in ${DEVELOP_MS}ms and the success haptic lands. On failure the print fades (300ms) off the old photo. Reduced: no breathing, 180ms fades.`}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={[styles.frame, { backgroundColor: c.card, borderColor: c.ink }]}>
          <View style={{ width: SIZE, height: SIZE, overflow: "hidden", backgroundColor: c.note.fill.lilac }}>
            <DevelopingPrint size={SIZE} state={state} next={NEW_PRINT} onDone={done}>
              {have
                ? <Image source={{ uri: NEW_PRINT ?? undefined }} style={{ width: SIZE, height: SIZE }} />
                : <View style={styles.init}><T v="hero" color={c.avInk} style={{ fontSize: 46, lineHeight: 54 }}>{initials("Thalha Thabish")}</T></View>}
            </DevelopingPrint>
          </View>
          <T v="mono" color={c.ink3} style={{ fontSize: 10.5, marginTop: 6 }}>{state === "developing" ? "developing…" : " "}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Upload" icon="upload" tone="peach" onPress={() => run(true)} style={{ flex: 1 }} />
        <Button label="Upload, then fail" variant="ghost" tone="rose" onPress={() => run(false)} style={{ flex: 1 }} />
      </View>
      {have ? <Button label="Back to initials" variant="ghost" size="sm" onPress={() => setHave(false)} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  frame: { padding: 9, borderWidth: 1.5, borderRadius: 6, alignItems: "center", transform: [{ rotate: "-2deg" }] },
  init: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
});
