/**
 * Settings → Semesters (the web's sections/SemestersSection.tsx at phone width). Every
 * word and rule from @/lib/settings/semesters:
 *
 *   lede + New semester · rows (label, Active pill, dates; the active one tinted) with
 *   Edit and Set active (MANAGE_SEMESTERS) · empty state · the form sheet (Label, Start
 *   date, End date; "Create & activate" or "Save"), which is the web's Modal
 *
 * Open to everyone (the web gates only the buttons). Writes refresh Treasury's terms,
 * the dashboard, the Timeline and dues (data/settings termsChanged).
 */
import type { SemesterRow } from "@/lib/api-types";
import { SEMESTERS_COPY as C, checkSemester, semesterBody, semesterRange } from "@/lib/settings/semesters";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "~/api/errors";
import { activateSemester, createSemester, editSemester, useSettingsSemesters } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { haptics } from "~/motion/haptics";
import { DateField } from "~/settings/DateField";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { Button } from "~/paper/Button";
import { T } from "~/ui/T";
import { Empty, Lede, Note, ScBtn, ScCard, ScInput, ScPill, ScRow } from "./ledger";
import { can } from "./model";

export function SemestersSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useSettingsSemesters();
  const [form, setForm] = useState<{ editing: SemesterRow | null } | null>(null);
  const [activating, setActivating] = useState<number | null>(null);
  if (!me) return null;
  const canManage = can(me, "MANAGE_SEMESTERS");
  const list = q.data ?? [];

  const setActive = async (id: number) => {
    setActivating(id);
    try {
      await activateSemester(id);
      haptics.success();
      toast.show(C.activated);
    } catch {
      haptics.error();
      toast.error(C.activateFailed);
    } finally {
      setActivating(null);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}><Lede>{C.lede}</Lede></View>
        {canManage ? <ScBtn kind="accent" icon="plus" label={C.newSemester} onPress={() => setForm({ editing: null })} /> : null}
      </View>

      {q.isPending ? (
        <Note style={{ textAlign: "center", paddingVertical: 24 }}>{C.loading}</Note>
      ) : q.isError ? (
        <T v="meta" color={c.pastel.rose.ink}>{C.loadFailed}</T>
      ) : list.length === 0 ? (
        <Empty title={C.emptyTitle} hint={C.emptyHint} />
      ) : (
        <ScCard>
          {list.map((s, i) => (
            <ScRow key={s.id} last={i === list.length - 1} style={[{ paddingHorizontal: 14, justifyContent: "space-between" }, s.isActive && { backgroundColor: c.pastel.lilac.soft }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T v="bodyStrong" size={14.4} numberOfLines={1} style={{ flexShrink: 1 }}>{s.label}</T>
                  {s.isActive ? <ScPill tone="vio" label={C.active} /> : null}
                </View>
                <T v="meta" size={12.5} color={c.ink3}>{semesterRange(s).join("")}</T>
              </View>
              {canManage ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ScBtn small label={C.edit} onPress={() => setForm({ editing: s })} />
                  {!s.isActive ? <ScBtn small label={activating === s.id ? C.setting : C.setActive} disabled={activating === s.id} onPress={() => void setActive(s.id)} /> : null}
                </View>
              ) : null}
            </ScRow>
          ))}
        </ScCard>
      )}

      <SemesterSheet open={form != null} editing={form?.editing ?? null} onClose={() => setForm(null)} />
    </View>
  );
}

function SemesterSheet({ open, editing, onClose }: { open: boolean; editing: SemesterRow | null; onClose: () => void }) {
  const { c } = useTheme();
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  const key = open ? `${editing?.id ?? "new"}` : null;
  if (key !== seeded) {
    setSeeded(key);
    setLabel(editing?.label ?? ""); setStart(editing?.startDate ?? ""); setEnd(editing?.endDate ?? ""); setErr(null);
  }

  const submit = async () => {
    const problem = checkSemester(label, start, end);
    if (problem) { haptics.warn(); setErr(problem); return; }
    setSaving(true); setErr(null);
    try {
      const body = semesterBody(label, start, end, !!editing);
      const s = editing ? await editSemester(editing.id, body) : await createSemester(body);
      haptics.success();
      toast.show(editing ? C.saved(s.label) : C.created(s.label));
      onClose();
    } catch (e) {
      haptics.error();
      setErr(errorMessage(e, editing ? C.saveFailed : C.createFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="fit" tone="mint" icon="cal" title={editing ? C.editSemester : C.newSemester}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label={C.cancel} variant="ghost" onPress={onClose} />
          <Button label={editing ? (saving ? C.saving : C.save) : (saving ? C.creating : C.create)} tone="mint" block disabled={saving} onPress={() => void submit()} style={{ flex: 1 }} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        {err ? (
          <View style={{ borderWidth: 1, borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }} accessibilityRole="alert">
            <T v="meta" size={12.5} color={c.pastel.rose.ink}>{err}</T>
          </View>
        ) : null}
        <ScInput label={C.label} value={label} onChangeText={setLabel} placeholder={C.labelPlaceholder} />
        <DateField label={C.start} value={start} onChange={setStart} />
        <DateField label={C.end} value={end} onChange={setEnd} min={start || undefined} />
      </View>
    </Sheet>
  );
}
