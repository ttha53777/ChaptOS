/**
 * A chapter's logo on a tilted butter tile, or its initials when it has none (the same
 * face as the header's OrgStamp, sized for entry screens: the invite ticket's stub, the
 * postmark, the approved card).
 */
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { initials } from "~/paper/bits";
import { hard } from "~/theme/shadow";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function ChapterMark({ name, logoUrl, size = 48, rotate = -4, style }: {
  name: string; logoUrl: string | null; size?: number; rotate?: number; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{
      width: size, height: size, borderRadius: size * 0.22, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.note.fill.butter,
      alignItems: "center", justifyContent: "center", overflow: "hidden", transform: [{ rotate: `${rotate}deg` }],
    }, hard(c.pastel.peach.fill, 2), style]}>
      {logoUrl
        ? <Image source={{ uri: logoUrl }} style={{ width: size - 3, height: size - 3 }} />
        : <T v="pill" color={c.note.ink} style={{ fontSize: size * 0.34, lineHeight: size * 0.42 }}>{initials(name)}</T>}
    </View>
  );
}
