/**
 * Blocking "Update ChaptOS" screen. Shown instead of everything else once any
 * request answers 426 APP_UPDATE_REQUIRED, or when /api/mobile/config's
 * minVersion is above this build at launch.
 */
import { Linking, Platform } from "react-native";
import { config } from "~/config";
import { useMobileConfig } from "~/data/hooks";
import { Button } from "~/paper/Button";
import { Fine, Page } from "~/ui/Page";

export function UpdateScreen({ minVersion }: { minVersion: string }) {
  const mobileConfig = useMobileConfig();
  const store = Platform.OS === "ios" ? mobileConfig.data?.iosStoreUrl : mobileConfig.data?.androidStoreUrl;
  return (
    <Page
      kicker="Update needed"
      tone="peach"
      title="Update ChaptOS."
      lede={`This version (${config.appVersion}) can't talk to your chapter any more. Version ${minVersion} or newer can.`}
      footer={store ? (
        <Button label={Platform.OS === "ios" ? "Open the App Store" : "Open Google Play"} icon="arrow-r" block onPress={() => void Linking.openURL(store)} />
      ) : (
        <Fine>Update from wherever you installed this build (TestFlight or your build link).</Fine>
      )}
    />
  );
}
