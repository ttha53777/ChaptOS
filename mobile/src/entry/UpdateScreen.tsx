/**
 * Blocking "Update ChaptOS" screen (U2: a plain, calm sheet with the store button; no
 * motion). Shown instead of everything else once any request answers 426
 * APP_UPDATE_REQUIRED, or when /api/mobile/config's minVersion is above this build at
 * launch. It sits outside the entry/tabs tree, so it uses nothing that needs a signed-in
 * person.
 */
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "~/config";
import { useMobileConfig } from "~/data/hooks";
import { Button } from "~/paper/Button";
import { Kicker } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function UpdateScreen({ minVersion }: { minVersion: string }) {
  const { c } = useTheme();
  const mobileConfig = useMobileConfig();
  const store = Platform.OS === "ios" ? mobileConfig.data?.iosStoreUrl : mobileConfig.data?.androidStoreUrl;
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: c.paper }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line2 }]}>
          <Kicker label="Update needed" tone="peach" />
          <T v="title" accessibilityRole="header">There's a newer ChaptOS.</T>
          <T v="body" color={c.ink2}>
            {`This version (${config.appVersion}) can't talk to your chapter any more. Version ${minVersion} or newer can. Nothing you've done is lost; it's all on the chapter's side.`}
          </T>
          {store ? (
            <Button label={Platform.OS === "ios" ? "Open the App Store" : "Open Google Play"} icon="arrow-r" block onPress={() => void Linking.openURL(store)} />
          ) : (
            <T v="meta" color={c.ink3}>Update from wherever you installed this build (TestFlight or your build link).</T>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { flexGrow: 1, justifyContent: "center", padding: 20 },
  sheet: { gap: 14, padding: 20, borderWidth: 1.5, borderRadius: 16 },
});
