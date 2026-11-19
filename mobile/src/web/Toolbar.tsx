/**
 * The web's phone toolbar (`header.dash-toolbar`, every org page's top strip), minus
 * the sidebar: where the web has a hamburger, the app has nothing (no sidebar, by
 * decision), so the org's tile leads.
 *
 *   [org tile] KICKER            (right slot, from Screen)
 *              Title
 *
 * The tile is the web's `.sb-logo.sm` (butter, ink border, peach hard shadow, −2°). With
 * more than one chapter it opens the switcher (the web sidebar's OrgSwitcher, which now
 * lives here). On a pushed page a back chevron replaces the tile.
 *
 * Type: kicker `.tb-org` (Inter 600, .62rem, .1em tracked caps, muted); title `.tb-title`
 * (display 600, 1rem, −.02em).
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { OrgSheet, StampFace } from "~/shell/OrgStamp";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function WebToolbar({ kicker, title, back, onBack }: { kicker?: string; title: string; back?: string; onBack?: () => void }) {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const [open, setOpen] = useState(false);
  const me = entry?.me ?? null;
  const many = (me?.memberships.length ?? 0) > 1;
  const org = { name: me?.org?.name ?? "", logoUrl: me?.org?.logoUrl ?? null };

  return (
    <View style={styles.row}>
      {back ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={`Back to ${back}`} hitSlop={10} style={styles.back}>
          <Icon name="chev-l" size={20} color={c.ink2} />
        </Pressable>
      ) : (
        <Pressable onPress={() => setOpen(true)} disabled={!many} hitSlop={8}
          accessibilityRole={many ? "button" : "image"} accessibilityLabel={many ? `${org.name}. Switch chapter` : org.name}>
          <StampFace org={org} size={30} tilt={-2} />
        </Pressable>
      )}
      <View style={styles.stack}>
        {kicker ? <T v="label" size={9.9} ls={0.1} lh={1.2} color={c.ink3} numberOfLines={1} style={styles.kicker}>{kicker}</T> : null}
        <T v="subhead" size={16} ls={-0.02} lh={1.15} numberOfLines={1} accessibilityRole="header">{title}</T>
      </View>
      {me && many ? <OrgSheet me={me} open={open} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 32, height: 34, alignItems: "flex-start", justifyContent: "center" },
  stack: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: "Inter-600" },
});
