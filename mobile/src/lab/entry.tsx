/**
 * Motion Lab: U2 entry. The invite ticket getting stamped (SENT, or why a link is dead)
 * and the sealed letter opening into the "Join approved" card. Nothing here calls the API.
 */
import { useState } from "react";
import { View } from "react-native";
import { ChapterMark } from "~/entry/ChapterMark";
import { LETTER_OPEN_MS, SealedLetter } from "~/moments/Letter";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Ticket } from "~/paper/Ticket";
import { hard } from "~/theme/shadow";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Section } from "./sections";

export function InviteTicketLab() {
  const { c } = useTheme();
  const [stamp, setStamp] = useState<{ label: string; tone: "mint" | "rose"; state: StampState }>({ label: "Sent", tone: "mint", state: "hidden" });
  return (
    <Section title="Invite ticket" note="A pasted link becomes a ticket (fades down in, 320ms). Ask to join stamps it SENT (the stamp's 340ms drop + splat, success haptic on impact); the app moves on 700ms after. A dead link is stamped with why, in rose.">
      <View>
        <Ticket tone={stamp.tone} stub={<ChapterMark name="Oozma Kappa" logoUrl={null} size={44} />}
          body={<View style={{ gap: 2 }}>
            <T v="label" color={c.ink3}>Invite</T>
            <T v="title" style={{ fontSize: 20 }}>Oozma Kappa</T>
            <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>chaptos.com/org/ok-today</T>
          </View>} />
        {stamp.state !== "hidden" ? <Stamp label={stamp.label} tone={stamp.tone} state={stamp.state} rotate={-8} style={{ position: "absolute", right: 22, top: 18 }}
          onImpact={() => (stamp.tone === "mint" ? haptics.success() : haptics.warn())} /> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Sent" tone="mint" onPress={() => setStamp({ label: "Sent", tone: "mint", state: "in" })} style={{ flex: 1 }} />
        <Button label="Expired" variant="ghost" tone="rose" onPress={() => setStamp({ label: "Expired", tone: "rose", state: "in" })} style={{ flex: 1 }} />
        <Button label="Reset" variant="soft" onPress={() => setStamp(s => ({ ...s, state: "hidden" }))} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

export function LetterLab() {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  const card = (
    <View style={[{ alignItems: "center", gap: 8, paddingVertical: 20, paddingHorizontal: 16, borderWidth: 1.5, borderRadius: 14, backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.mint.fill, 4)]}>
      <ChapterMark name="Oozma Kappa" logoUrl={null} size={56} />
      <Kicker label="Approved" tone="mint" />
      <T v="title" align="center">Oozma Kappa</T>
      <T v="body" color={c.ink2} align="center">You're in, Thalha. Welcome to the chapter.</T>
    </View>
  );
  return (
    <Section title="Join approved" note={`Sealed letter, postmarked. Opening (${LETTER_OPEN_MS}ms): seal lifts and fades (200), flap folds back about its top (150–520, fading edge-on), the card slides up out of the pocket (480–1080, spring; success haptic), the envelope drops and fades (1000–1300). Reduced: cross-fade, haptic kept.`}>
      <SealedLetter key={k} chapter="Oozma Kappa" logoUrl={null} to="Thalha Thabish" requestedAt="2026-11-18" open={open} card={card} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Open" icon="envelope" tone="mint" onPress={() => setOpen(true)} style={{ flex: 1 }} />
        <Button label="Seal again" variant="ghost" onPress={() => { setOpen(false); setK(x => x + 1); }} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}
