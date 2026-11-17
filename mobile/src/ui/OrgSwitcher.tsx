/**
 * The org header: the active chapter's logo and name; tap to switch between
 * the chapters in MeResponse.memberships. The choice is remembered (state/org).
 */
import type { MeResponse } from "@/lib/api-types";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Avatar, Surface } from "~/paper/bits";
import { setActiveOrg } from "~/state/org";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function OrgSwitcher({ me, switching }: { me: MeResponse; switching?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const many = me.memberships.length > 1;
  const name = me.org?.name ?? "Your chapter";

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={many ? `${name}. Switch chapter` : name}
        disabled={!many}
        onPress={() => setOpen(o => !o)}
        style={styles.head}
        hitSlop={8}
      >
        <Avatar name={name} uri={me.org?.logoUrl} tone="butter" size="md" />
        <View style={{ flex: 1 }}>
          <T v="subhead" numberOfLines={1}>{name}</T>
          <T v="meta" color={c.ink3} numberOfLines={1}>{switching ? "Switching…" : me.memberships.find(m => m.orgSlug === me.org?.slug)?.title ?? me.role}</T>
        </View>
        {many ? <Icon name={open ? "chev-u" : "chev-d"} color={c.ink3} /> : null}
      </Pressable>

      {open ? (
        <Surface style={styles.menu}>
          {me.memberships.map(m => {
            const current = m.orgSlug === me.org?.slug;
            return (
              <Pressable
                key={m.organizationId}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                onPress={() => { setOpen(false); if (!current) { haptics.select(); setActiveOrg(m.orgSlug); } }}
                style={[styles.item, current && { backgroundColor: c.paper2 }]}
              >
                <Avatar name={m.orgName} uri={m.orgLogoUrl} tone="sky" size="sm" />
                <View style={{ flex: 1 }}>
                  <T v="callout" numberOfLines={1}>{m.orgName}</T>
                  <T v="meta" color={c.ink3} numberOfLines={1}>{m.title}</T>
                </View>
                {current ? <Icon name="star" size={14} color={c.ink3} /> : null}
              </Pressable>
            );
          })}
        </Surface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  menu: { marginTop: 10, padding: 6, gap: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, minHeight: 44 },
});
