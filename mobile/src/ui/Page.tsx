/**
 * The frame every entry screen (sign-in, terms, join, awaiting, update, error)
 * shares: paper ground, safe areas, a kicker, a title, a lede. U1 redesigns
 * these screens; this keeps them consistent until then.
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Kicker } from "~/paper/bits";
import { useTheme } from "~/theme/PaperProvider";
import type { Tone } from "~/theme/palette";
import { T } from "~/ui/T";

export function Page({ kicker, tone, title, lede, children, footer }: {
  kicker: string; tone?: Tone; title: string; lede?: string; children?: ReactNode; footer?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: c.paper }]}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Kicker label={kicker} tone={tone} />
          <T v="hero" accessibilityRole="header">{title}</T>
          {lede ? <T v="body" color={c.ink2}>{lede}</T> : null}
          <View style={styles.content}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A quiet line under the main action: sign out, the server in use, etc. */
export function Fine({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <T v="meta" color={c.ink3} align="center">{children}</T>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { padding: 20, paddingTop: 32, gap: 14 },
  content: { gap: 14, marginTop: 6 },
  footer: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
});
