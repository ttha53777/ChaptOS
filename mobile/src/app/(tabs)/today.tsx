/**
 * Today, shell only: the org header (with the switcher) and who the server
 * says you are in this chapter, straight from /api/auth/me. Up next, On your
 * plate and the live check-in come from GET /api/home in U1.
 */
import { StyleSheet, View } from "react-native";
import { useEntryOf } from "~/entry/EntryContext";
import { Kicker, Pill, Surface } from "~/paper/bits";
import { useActiveOrg } from "~/state/org";
import { useTheme } from "~/theme/PaperProvider";
import { OrgSwitcher } from "~/ui/OrgSwitcher";
import { TabPlaceholder } from "~/ui/TabPlaceholder";
import { T } from "~/ui/T";

export default function Today() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const { slug } = useActiveOrg();
  if (!entry) return null;
  const { me } = entry;
  const first = me.name.split(" ")[0] || me.name;
  const switching = !!slug && me.org?.slug !== slug;

  return (
    <TabPlaceholder title={`Hi, ${first}.`}>
      <OrgSwitcher me={me} switching={switching} />
      <Surface inked="lilac" style={styles.card}>
        <Kicker label="You, in this chapter" tone="lilac" />
        <Row label="Name" value={me.name} />
        <Row label="Role" value={me.memberships.find(m => m.orgSlug === me.org?.slug)?.title ?? me.role} />
        <Row label="Email" value={me.email} />
        <View style={styles.pills}>
          {me.roles.map(r => <Pill key={r.id} label={r.name} tone="sky" />)}
          {me.isAdmin ? <Pill label="Admin" tone="peach" /> : null}
        </View>
      </Surface>
      <T v="meta" color={c.ink3}>Up next, On your plate and check-in land here next.</T>
    </TabPlaceholder>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <T v="label" color={c.ink3} style={styles.label}>{label}</T>
      <T v="callout" style={{ flex: 1 }} numberOfLines={1}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { width: 56 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
