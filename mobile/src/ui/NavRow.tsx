/**
 * A tappable row on a card: tile, title, a meta line, chevron. Pushes a page or opens a
 * sheet. Press = face dips to .985 (transform), no haptic (navigation).
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "~/icons/Icon";
import { Tile } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "./T";

export function NavRow({ icon, tone = "sky", title, meta, onPress, danger, last }: {
  icon: IconName; tone?: Tone; title: string; meta?: string; onPress: () => void; danger?: boolean; last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}. ${meta}` : title}
      style={({ pressed }) => [styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.line }, pressed && { backgroundColor: c.paper2 }]}
    >
      <Tile icon={icon} tone={danger ? "rose" : tone} size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="callout" color={danger ? c.danger : c.ink} numberOfLines={1}>{title}</T>
        {meta ? <T v="meta" color={c.ink3} numberOfLines={1}>{meta}</T> : null}
      </View>
      <Icon name="chev-r" size={16} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, minHeight: 56 },
});
