import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { T } from "~/ui/T";

/** A labelled single-line field in the paper look. 16px+ text, so iOS never zooms. */
export function Field({ label, error, style, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <View style={styles.wrap}>
      <T v="label" color={c.ink2}>{label}</T>
      <TextInput
        placeholderTextColor={c.faint}
        selectionColor={c.ink}
        allowFontScaling={false}
        accessibilityLabel={label}
        {...rest}
        style={[resolveType("body", scale), styles.input, { color: c.ink, backgroundColor: c.card, borderColor: error ? c.risk : c.line2 }, style]}
      />
      {error ? <T v="meta" color={c.risk}>{error}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, minHeight: 48 },
});
