/**
 * Settings → Workflows (the web's sections/WorkflowsSection.tsx + workflows.css at phone
 * width). Every word and rule from @/lib/settings/workflows:
 *
 *   lede · Always included (locked rows) · Dues (one switch, the jar tile) ·
 *   Dashboard widgets (checkboxes) · Optional pages (each a pick card; its sections
 *   nest under it while it's on) · Sidebar order (per group, up/down, hidden pages dimmed)
 *   · Save changes / Reset / Unsaved
 *
 * One PATCH /api/orgs/config, then /me: More's page grid, the tab bar and Home follow.
 * MANAGE_SETTINGS only (the index hides the row otherwise; this renders nothing too).
 */
import type { WorkflowId } from "@/lib/org-types";
import { NAV_GROUPS } from "@/lib/nav-order";
import {
  ALWAYS_ON_LABELS, DUES_FEATURE, PICKER_ITEMS, WORKFLOWS_COPY as C,
  cloneDisabled, disabledMapKey, disabledMapOf, enabledLabels, featureOn, featuresOf, hasFeatures, moveItem, navDirty as orderDirty,
  navDisplayName, saveErrorOf, seedOrder, toggleFeature, toggleWorkflow, workflowsDirty, workflowsPatch, DASHBOARD_FEATURES,
  type DisabledMap, type NavOrderMap,
} from "@/lib/settings/workflows";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { saveWorkflows } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { plural } from "~/more/model";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { useDirtyGuard } from "./dirty";
import { Actions, GrpLabel, Lede, Locked, Note, ScCard, ScCheck, ScRow } from "./ledger";
import { can } from "./model";

export function WorkflowsSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const org = me?.org ?? null;
  const canManage = !!me && can(me, "MANAGE_SETTINGS");

  const persisted = useMemo(() => new Set<WorkflowId>((org?.enabledWorkflows ?? []) as WorkflowId[]), [org?.enabledWorkflows]);
  const persistedKey = [...persisted].sort().join(",");
  const persistedDisabled = useMemo(() => disabledMapOf(org?.disabledFeatures), [org?.disabledFeatures]);
  const persistedDisabledKey = disabledMapKey(persistedDisabled);
  const persistedOrder = useMemo(() => org?.navOrder ?? [], [org?.navOrder]);
  const persistedOrderKey = persistedOrder.join("|");

  const [selected, setSelected] = useState<Set<WorkflowId>>(() => new Set(persisted));
  const [disabled, setDisabled] = useState<DisabledMap>(() => cloneDisabled(persistedDisabled));
  const [order, setOrder] = useState<NavOrderMap>(() => seedOrder(persistedOrder));
  const [saving, setSaving] = useState(false);

  // Re-seed when the STORED value changes (our own save normalizes it; another admin
  // may change it), never on an equal /me refresh.
  const synced = useRef({ persistedKey, persistedDisabledKey, persistedOrderKey });
  useEffect(() => {
    const s = synced.current;
    if (s.persistedKey !== persistedKey) setSelected(new Set(persisted));
    if (s.persistedDisabledKey !== persistedDisabledKey) setDisabled(cloneDisabled(persistedDisabled));
    if (s.persistedOrderKey !== persistedOrderKey) setOrder(seedOrder(persistedOrder));
    synced.current = { persistedKey, persistedDisabledKey, persistedOrderKey };
  }, [persistedKey, persistedDisabledKey, persistedOrderKey, persisted, persistedDisabled, persistedOrder]);

  const navDirty = orderDirty(order, persistedOrder);
  const dirty = workflowsDirty({ selected, persisted, disabled, persistedDisabledKey, navDirty });
  useDirtyGuard("workflows", dirty);

  if (!me || !org || !canManage) return null;

  const vocab = (k: string) => org.vocabularyOverrides[k] || k;
  const dues = vocab("Dues");
  const duesOn = featureOn(disabled, "operations", DUES_FEATURE);
  const enabled = enabledLabels(persisted);

  const reset = () => {
    setSelected(new Set(persisted));
    setDisabled(cloneDisabled(persistedDisabled));
    setOrder(seedOrder(persistedOrder));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveWorkflows(workflowsPatch({ persisted, selected, disabled, order, navDirty }));
      haptics.success();
      toast.show(C.saved);
    } catch (e) {
      haptics.error();
      toast.error(saveErrorOf(errorMessage(e, ""), C.forbidden));
    } finally {
      setSaving(false);
    }
  };

  const features = (workflow: WorkflowId) => {
    const list = featuresOf(workflow);
    if (!list.length) return null;
    return (
      <View style={[styles.features, { borderLeftColor: c.line2 }]}>
        {list.map(f => (
          <ScCheck key={f.id} on={featureOn(disabled, workflow, f.id)} label={f.label} sub={f.description}
            onChange={() => setDisabled(prev => toggleFeature(prev, workflow, f.id))} />
        ))}
      </View>
    );
  };

  return (
    <View style={{ gap: 18 }}>
      <Lede>{C.lede}</Lede>

      <View>
        <GrpLabel label={C.alwaysIncluded} note={C.alwaysNote} />
        <ScCard pad>
          {ALWAYS_ON_LABELS.map((label, i) => (
            <ScRow key={label} last={i === ALWAYS_ON_LABELS.length - 1} style={{ justifyContent: "space-between" }}>
              <T v="bodyStrong" size={14.4}>{label}</T>
              <Locked label={C.locked} />
            </ScRow>
          ))}
        </ScCard>
      </View>

      <View>
        <GrpLabel label={dues} />
        <View style={[styles.dues, duesOn
          ? { borderStyle: "solid", borderColor: c.ink, backgroundColor: c.pastel.butter.soft }
          : { borderStyle: "dashed", borderColor: c.line2, backgroundColor: c.paper }]}>
          <View style={[styles.duesTile, { backgroundColor: duesOn ? c.note.fill.butter : c.card2, borderColor: c.ink }]}>
            <Icon name="jar" size={18} color={c.note.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T v="bodyStrong" size={14.4}>{C.duesTitle(dues).join("")}</T>
            <T v="meta" size={12.5} color={c.ink3}>{C.duesSub(duesOn, { dues, members: plural(vocab("Member")), treasury: vocab("Treasury") })}</T>
          </View>
          <Switch value={duesOn} tone="butter" label={C.duesLabel(dues)} disabled={saving}
            onChange={() => setDisabled(prev => toggleFeature(prev, "operations", DUES_FEATURE))} />
        </View>
      </View>

      {DASHBOARD_FEATURES.length > 0 ? (
        <View>
          <GrpLabel label={C.dashboardWidgets} note={C.dashboardNote} />
          <ScCard style={{ padding: 8 }}>{features("operations")}</ScCard>
        </View>
      ) : null}

      <View accessibilityRole="list">
        <GrpLabel label={C.optionalPages} note={C.optionalNote} />
        <View style={{ gap: 8 }}>
          {PICKER_ITEMS.map(item => {
            const on = selected.has(item.workflow);
            return (
              <View key={item.workflow} style={[styles.pick, on
                ? { backgroundColor: c.card, borderColor: c.line2, borderStyle: "solid", boxShadow: c.sh1 }
                : { backgroundColor: c.paper, borderColor: c.line2, borderStyle: "dashed" }]}>
                <ScCheck on={on} dim={!on} label={navDisplayName(item.label)} sub={item.description} onChange={() => setSelected(prev => toggleWorkflow(prev, item.workflow))} />
                {on && hasFeatures(item.workflow) ? features(item.workflow) : null}
              </View>
            );
          })}
        </View>
      </View>

      <View>
        <GrpLabel label={C.sidebarOrder} note={C.orderNote} />
        <View style={{ gap: 16 }}>
          {NAV_GROUPS.map(group => {
            const items = order.get(group.label) ?? [...group.items];
            return (
              <View key={group.label}>
                <Note style={{ marginLeft: 2, marginBottom: 5, fontWeight: "600" }}>{group.label}</Note>
                <ScCard pad>
                  {items.map((label, i) => {
                    const off = !enabled.has(label);
                    return (
                      <ScRow key={label} last={i === items.length - 1} style={{ justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                          <T v="bodyStrong" size={14.4} color={off ? c.ink3 : c.ink}>{navDisplayName(label)}</T>
                          {off ? <Locked label={C.hidden} /> : null}
                        </View>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <MoveBtn up label={C.moveUp(label)} disabled={i === 0 || saving} onPress={() => setOrder(prev => moveItem(prev, group.label, i, -1))} />
                          <MoveBtn label={C.moveDown(label)} disabled={i === items.length - 1 || saving} onPress={() => setOrder(prev => moveItem(prev, group.label, i, 1))} />
                        </View>
                      </ScRow>
                    );
                  })}
                </ScCard>
              </View>
            );
          })}
        </View>
      </View>

      <Actions
        save={{ label: saving ? C.saving : C.save, onPress: () => void save(), disabled: !dirty || saving }}
        reset={{ label: C.reset, onPress: reset, disabled: !dirty || saving }}
        dirty={dirty ? C.unsaved : null} />
    </View>
  );
}

function MoveBtn({ up, label, disabled, onPress }: { up?: boolean; label: string; disabled: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} hitSlop={6}
      style={({ pressed }) => [styles.move, { borderColor: c.line, backgroundColor: c.card, opacity: disabled ? 0.4 : 1 }, pressed && { borderColor: c.ink3 }]}>
      <Icon name={up ? "chev-u" : "chev-d"} size={14} color={c.ink2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dues: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5 },
  duesTile: { width: 34, height: 34, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pick: { borderWidth: 1.5, borderRadius: 14, padding: 6 },
  features: { marginLeft: 14, marginTop: 4, paddingLeft: 8, borderLeftWidth: 1.5, borderStyle: "dashed", gap: 2 },
  move: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
