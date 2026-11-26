/**
 * The soft ask, shown once, right after the first check-in: the moment a buzz
 * would have helped. "Turn on" goes to the OS prompt; "Not now" just stops it
 * showing. Either way it never comes back here; Notifications in More has the
 * switch from then on.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Surface } from "~/paper/bits";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { askForPush, markAsked, shouldOfferPush } from "./index";

export function PushOffer({ when }: { when: boolean }) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!when) return;
    let live = true;
    void shouldOfferPush().then(ok => { if (live) setShow(ok); });
    return () => { live = false; };
  }, [when]);
  if (!show) return null;

  const turnOn = async () => {
    setShow(false);
    const p = await askForPush();
    if (p === "granted") { haptics.success(); toast.show("Notifications on", { detail: "You'll get a buzz when check-in opens.", tone: "mint" }); }
  };
  const notNow = () => { setShow(false); void markAsked(); };

  return (
    <Surface style={{ padding: 16, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T v="callout">Get a buzz when check-in opens?</T>
        <T v="meta" color={c.ink3}>Also when a task, poll or dues charge is yours. Choose which in More, Notifications.</T>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Turn on" size="sm" onPress={() => void turnOn()} />
        <Button label="Not now" size="sm" variant="ghost" onPress={notNow} />
      </View>
    </Surface>
  );
}
