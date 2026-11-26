/**
 * Settings → Identity → Danger zone (the web's sections/DangerZone.tsx at phone width).
 * Every word and rule from @/lib/settings/danger:
 *
 *   the rose card (trash tile, "Delete this chapter", who it removes, Delete chapter…) →
 *   the Delete organization sheet: what goes, who keeps their account, the counts (or the
 *   summary-failed line), "Type <name> to confirm", Cancel / Delete forever
 *
 * Org admins only; renders nothing for anyone else. Delete arms on the exact name and
 * confirms with the slug. Afterwards the app moves to another chapter you belong to, or
 * to the start when none remain (as Leave does).
 */
import { DANGER_COPY as C, deleteArmed, deletionStats } from "@/lib/settings/danger";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { resetCache } from "~/data/query";
import { deleteOrg, useDeletionSummary } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Button } from "~/paper/Button";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { setActiveOrg } from "~/state/org";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { isOrgAdmin } from "./model";

export function DangerZone({ memberCount }: { memberCount: number }) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const [open, setOpen] = useState(false);
  if (!me || !me.org || !isOrgAdmin(me)) return null;
  const rose = c.pastel.rose;
  return (
    <>
      <View style={[styles.card, { backgroundColor: rose.soft, borderColor: rose.ink, boxShadow: `4px 4px 0 ${c.note.fill.rose}` }]}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
          <View style={[styles.ic, { backgroundColor: c.card, borderColor: rose.ink }]}><Icon name="trash" size={19} color={rose.ink} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="title" size={16.5} color={rose.ink} accessibilityRole="header">{C.title}</T>
            <T v="body" size={13.8} color={c.ink2}>{C.body(memberCount)}</T>
          </View>
        </View>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={C.open}
          style={({ pressed }) => [styles.btn, { backgroundColor: rose.ink, borderColor: rose.ink, boxShadow: `2.5px 2.5px 0 ${c.ink}` }, pressed && pressedDim]}>
          <T v="buttonSm" size={14} color="#fff">{C.open}</T>
        </Pressable>
      </View>
      <DeleteSheet open={open} onClose={() => setOpen(false)} orgName={me.org.name} orgSlug={me.org.slug}
        next={me.memberships.find(m => m.organizationId !== me.orgId) ?? null} />
    </>
  );
}

function DeleteSheet({ open, onClose, orgName, orgSlug, next }: {
  open: boolean; onClose: () => void; orgName: string; orgSlug: string; next: { orgSlug: string; orgName: string } | null;
}) {
  const { c } = useTheme();
  const summary = useDeletionSummary(open);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const armed = deleteArmed(typed, orgName, deleting);
  const close = () => { if (deleting) return; setTyped(""); onClose(); };

  const remove = async () => {
    if (!armed) return;
    setDeleting(true);
    try {
      await deleteOrg(orgSlug);
      haptics.success();
      setActiveOrg(next?.orgSlug ?? null);
      await resetCache();
      router.replace("/");
    } catch (e) {
      haptics.error();
      const m = errorMessage(e, "");
      toast.error(m.includes("403") || /forbidden|only an org admin/i.test(m) ? C.forbidden : C.failed);
      setDeleting(false);
      setTyped("");
      onClose();
    }
  };

  const lead = C.lead(orgName);
  const who = C.typeToConfirm(orgName);
  return (
    <Sheet open={open} onClose={close} size="fit" tone="rose" icon="trash" title={C.modalTitle}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label={C.cancel} variant="ghost" disabled={deleting} onPress={close} />
          <Button label={deleting ? C.deleting : C.confirm} tone="rose" block disabled={!armed} onPress={() => void remove()} style={{ flex: 1 }} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        <T v="body" size={14} lh={1.55} color={c.ink2}>
          {lead[0]}<T v="bodyStrong" size={14} color={c.ink}>{orgName}</T>{lead[2]}<T v="body" size={14} color={c.pastel.rose.ink}>{lead[3]}</T>
        </T>
        <T v="meta" size={12} lh={1.5} color={c.faint}>{C.who}</T>
        {summary.data ? (
          <View style={styles.stats}>
            {deletionStats(summary.data).map(([label, n]) => (
              <View key={label} style={[styles.stat, { backgroundColor: c.card2 }]}>
                <T v="title" size={17} style={{ fontVariant: ["tabular-nums"] }}>{String(n)}</T>
                <T v="meta" size={10.5} color={c.faint}>{label}</T>
              </View>
            ))}
          </View>
        ) : null}
        {summary.isError ? <T v="meta" size={12} color={c.pastel.butter.ink}>{C.summaryFailed}</T> : null}
        <View style={{ gap: 6 }}>
          <T v="meta" size={12} color={c.ink2} style={{ fontWeight: "500" }}>
            {who[0]}<T v="meta" size={12} color={c.ink} style={{ fontWeight: "700" }}>{orgName}</T>{who[2]}
          </T>
          <TextInput value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} spellCheck={false} placeholder={orgName}
            placeholderTextColor={c.ink3} accessibilityLabel={who.join("")} editable={!deleting}
            style={[styles.input, { borderColor: c.line, backgroundColor: c.paper2, color: c.ink }]} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 16, padding: 18, gap: 14 },
  ic: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  btn: { alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 17 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "31%", flexGrow: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 15 },
});
