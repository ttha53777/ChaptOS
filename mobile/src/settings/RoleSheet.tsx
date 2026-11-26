/**
 * Create, edit or (roles at or above your own rank) view a role: the web's
 * roles/RoleSheet.tsx with PermissionShelf, RankLadder and RoleColorPicker, stacked
 * for a phone (the web's side column, "How it'll look", follows the steps).
 *
 *   1 Start from      (create, when the org type has templates) Blank + templates
 *   2 Name + color    the name (60), clash / system notes, ten swatches + a hex field
 *   3 What can they change?  a shelf per group: tiles (Can see → Can change), Pick all /
 *                     Clear, the group's line (the last tapped tile explains itself,
 *                     as hover/focus does on the web)
 *   4 Where does it sit?  the ladder of real roles: "Put it here" gaps, "Level with"
 *                     rungs; locked at or above your rank
 *   preview           member card, "A … can…", the careful note, holders
 *   foot              summary · Delete / Cancel / Save (confirm states for discard, delete)
 *
 * Saves send only what changed (rolePatch): an unchanged bitfield can carry bits the
 * editor doesn't hold, which the server would refuse to re-assign.
 */
import type { RoleDetail } from "@/lib/api-types";
import { PERMISSIONS, PERMISSION_LIST, type Permission } from "@/lib/permissions";
import {
  DEFAULT_COLOR, HEX3, HEX6, NEUTRAL_ROLE_COLOR, PERM_GROUPS, PERM_META, SWATCHES, bitsOf, defaultRank, draftDirty, draftFromRole, gapRank,
  heldPermissions, hexOf, ladderRungs, ladderWhy, neighbours, permLabel, rolePatch, shelfLine, swatchName, templatesFor, type Draft,
} from "@/lib/settings/roles";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { createRole, deleteRole, updateRole } from "~/data/settings";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { PillBtn, RoleChip, Step } from "./bits";

export type SheetMode = "create" | "edit" | "view";

export function RoleSheet({ open, mode, role, roles, holders, myMaxRank, myRoleIds, canGrant, orgType, previewName, onClose, onDirtyChange }: {
  open: boolean; mode: SheetMode; role?: RoleDetail; roles: RoleDetail[]; holders?: { id: number; name: string }[];
  myMaxRank: number; myRoleIds: Set<number>; canGrant: (p: Permission) => boolean; orgType: string | null; previewName: string;
  onClose: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const { c } = useTheme();
  const creating = mode === "create";
  const readOnly = mode === "view";
  const others = useMemo(() => roles.filter(r => r.id !== role?.id), [roles, role?.id]);
  const initial = useMemo<Draft>(
    () => (role ? draftFromRole(role) : { name: "", color: DEFAULT_COLOR, rank: defaultRank(roles, myMaxRank), permissions: 0, colorTouched: true }),
    // Snapshot once per sheet: a roles refresh underneath must not reset edits.
    [role?.id, open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [tpl, setTpl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "close" | "delete">(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(initial); setTpl(null); setConfirm(null); }, [initial]);

  const templates = useMemo(() => (creating ? templatesFor(orgType, roles.map(r => r.name)) : []), [creating, orgType, roles]);
  const name = draft.name.trim();
  const label = name || (creating ? "New role" : role?.name ?? "This role");
  const nameLocked = readOnly || (mode === "edit" && !!role?.isSystem);
  const clash = !nameLocked && name !== "" && others.some(r => r.name.trim().toLowerCase() === name.toLowerCase());
  const held = heldPermissions(draft.permissions);
  const bigs = held.filter(p => PERM_META[p].big).map(permLabel);
  const dirty = open && draftDirty(mode, draft, initial, role);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const rankInvalid = !readOnly && draft.rank >= myMaxRank;
  const canSave = !readOnly && !saving && name !== "" && !clash && !rankInvalid && (creating || dirty);
  const requestClose = () => { if (dirty && !saving) { haptics.warn(); setConfirm("close"); } else onClose(); };

  const applyTemplate = (id: string) => {
    haptics.tap();
    setTpl(id);
    if (id === "blank") { setDraft(d => ({ ...d, name: "", permissions: 0 })); return; }
    const t = templates.find(x => x.id === id);
    if (!t) return;
    // Only the bits this officer can hand out; the rest would 403 on save.
    setDraft(d => ({ ...d, name: t.name, color: t.color, colorTouched: true, permissions: bitsOf(t.perms.filter(canGrant)) }));
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const d = { ...draft, name };
    try {
      if (creating) {
        const created = await createRole({ name: d.name, color: d.color, rank: d.rank, permissions: d.permissions });
        haptics.success();
        toast.show(`Created role "${created.name}".`);
      } else if (role) {
        await updateRole(role.id, rolePatch(role, d));
        haptics.success();
        toast.show(`Saved "${!role.isSystem ? d.name : role.name}".`);
      }
      onDirtyChange(false);
      onClose();
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, "Failed to save role."));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await deleteRole(role.id);
      haptics.success();
      toast.show(`Deleted role "${role.name}".`);
      onDirtyChange(false);
      onClose();
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, "Failed to delete role."));
    } finally {
      setSaving(false);
    }
  };
  const canDelete = !!role && !role.isSystem && mode === "edit";

  const chipColor = draft.colorTouched ? draft.color : NEUTRAL_ROLE_COLOR;
  const sample = holders?.[0]?.name ?? previewName;
  const initials = sample.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
  const title = creating ? "Make a new role" : readOnly ? role?.name ?? "Role" : `Edit ${role?.name ?? "role"}`;

  let n = 0;
  const foot = confirm === "close" ? (
    <View style={{ gap: 10 }}>
      <T v="meta" size={13} color={c.ink2}><T v="bodyStrong" size={13}>{`Discard ${creating ? "this new role" : "your changes"}?`}</T>{` ${creating ? "Nothing has been saved yet." : "The role keeps what it had."}`}</T>
      <View style={styles.btns}>
        <PillBtn label="Keep editing" onPress={() => setConfirm(null)} />
        <PillBtn label="Discard" kind="roseSolid" onPress={() => { onDirtyChange(false); onClose(); }} />
      </View>
    </View>
  ) : confirm === "delete" ? (
    <View style={{ gap: 10 }}>
      <T v="meta" size={13} color={c.ink2}>
        <T v="bodyStrong" size={13}>{`Delete ${role?.name}?`}</T>
        {` ${role && role.memberCount > 0 ? `It comes off ${role.memberCount} ${role.memberCount === 1 ? "person" : "people"}. ` : ""}This can't be undone.`}
      </T>
      <View style={styles.btns}>
        <PillBtn label="Keep it" disabled={saving} onPress={() => setConfirm(null)} />
        <PillBtn label={saving ? "Deleting…" : "Delete role"} kind="roseSolid" disabled={saving} onPress={() => void doDelete()} />
      </View>
    </View>
  ) : (
    <View style={{ gap: 10 }}>
      <T v="meta" size={12.5} color={c.ink3}>
        {readOnly ? "Ranked at or above you · view only"
          : name ? <><T v="bodyStrong" size={12.5}>{name}</T>{` · ${held.length ? `changes ${held.length} ${held.length === 1 ? "page" : "pages"}` : "no extra access"} · rank ${draft.rank}`}</>
          : "Give it a name to save it."}
      </T>
      <View style={styles.btns}>
        {canDelete && !readOnly ? <PillBtn label="Delete" kind="rose" disabled={saving} onPress={() => { haptics.warn(); setConfirm("delete"); }} /> : null}
        <PillBtn label={readOnly ? "Close" : "Cancel"} onPress={requestClose} />
        {!readOnly ? (
          <PillBtn label={saving ? "Saving…" : creating ? (held.length ? "Create role" : "Create as a label") : "Save changes"} kind="ink" disabled={!canSave} onPress={() => void save()} />
        ) : null}
      </View>
    </View>
  );

  return (
    <Sheet open={open} onClose={requestClose} size="tall" tone="lilac" accessibilityLabel={title} footer={foot}>
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <T v="kicker" color={c.ink3}>Settings · Roles</T>
          <T v="title" size={26}>{title}</T>
          <T v="body" size={14.5} color={c.ink2}>
            {readOnly ? "This role ranks at or above your own, so you can see what it grants but not change it." : "A role is a title plus the parts of the app that person can change."}
          </T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <RoleChip name={label} color={chipColor} />
            <T v="meta" size={12.5} color={c.ink3}>{held.length ? `can change ${held.length} ${held.length === 1 ? "page" : "pages"}` : "just a title"}</T>
          </View>
        </View>

        {creating && templates.length > 0 ? (
          <Step n={++n} tone="lilac" done={tpl !== null} title="Start from" sub="Pick the closest one. It fills everything below, and you can change any of it.">
            <View style={styles.tpls}>
              <Tpl on={tpl === "blank"} name="Blank" desc="Start empty" color={c.ink3} dashed onPress={() => applyTemplate("blank")} />
              {templates.map(t => (
                <Tpl key={t.id} on={tpl === t.id} name={t.name} color={t.color} desc={`${t.blurb} · ${t.perms.length} ${t.perms.length === 1 ? "page" : "pages"}`} onPress={() => applyTemplate(t.id)} />
              ))}
            </View>
          </Step>
        ) : null}

        <Step n={++n} tone="lilac" done={name !== ""} title={readOnly ? "Name and color" : "Name it and pick a color"} sub="The name and color show on the roster, member cards and task assignments.">
          <View style={{ gap: 10 }}>
            <TextInput value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} maxLength={60} editable={!nameLocked}
              placeholder={templates[0] ? `e.g. ${templates[0].name}` : "e.g. Secretary"} placeholderTextColor={c.ink3} autoFocus={creating && templates.length === 0}
              accessibilityLabel="Role name" style={[styles.name, { color: c.ink, borderBottomColor: c.ink, opacity: nameLocked ? 0.7 : 1 }]} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <T v="meta" size={12} color={clash ? c.pastel.rose.ink : c.ink3} style={{ flex: 1 }}>
                {clash ? `You already have a role called ${name}.` : mode === "edit" && role?.isSystem ? "System roles keep their name." : ""}
              </T>
              {!nameLocked ? <T v="mono" size={11} color={c.ink3}>{`${draft.name.length}/60`}</T> : null}
            </View>
            <T v="label" color={c.ink3}>Color</T>
            <ColorPicker color={draft.color} touched={draft.colorTouched} readOnly={readOnly} onChange={hex => setDraft(d => ({ ...d, color: hex, colorTouched: true }))} />
          </View>
        </Step>

        <Step n={++n} tone="lilac" done={draft.permissions !== 0} title="What can they change?"
          sub={readOnly ? "What holding this role lets someone change. Everyone can already see every page." : "Tap the pages this role looks after. Each one says what it unlocks."}>
          <Shelf bits={draft.permissions} onChange={bits => setDraft(d => ({ ...d, permissions: bits }))} canGrant={canGrant} readOnly={readOnly} roleLabel={label} />
        </Step>

        <Step n={++n} tone="lilac" done={!rankInvalid} title="Where does it sit?" sub="Higher roles can hand out and edit the ones below them.">
          <Ladder others={others} rank={draft.rank} onChange={rank => { haptics.tap(); setDraft(d => ({ ...d, rank })); }} myMaxRank={myMaxRank} myRoleIds={myRoleIds}
            name={label} color={chipColor} readOnly={readOnly} />
          {rankInvalid ? <T v="meta" size={12.5} color={c.pastel.rose.ink} style={{ marginTop: 8 }}>This role sits at or above your own. Pick a spot below you.</T> : null}
        </Step>

        {/* how it'll look */}
        <View style={[styles.side, { backgroundColor: c.paper2, borderColor: c.line2 }]}>
          <T v="kicker" color={c.ink3}>How it'll look</T>
          <View style={[styles.mcard, { backgroundColor: c.card, borderColor: c.ink }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.av, { backgroundColor: c.note.fill.sky, borderColor: c.ink }]}><T v="buttonSm" size={13} color={c.note.ink}>{initials}</T></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={14} numberOfLines={1}>{sample}</T>
                <T v="meta" size={12} color={c.ink3}>{holders?.length ? "Holds this role" : "Preview on a member card"}</T>
              </View>
            </View>
            <RoleChip name={label} color={chipColor} />
          </View>
          <View style={{ gap: 6 }}>
            <T v="subhead" size={15}>{`${/^[aeiou]/i.test(label) ? "An" : "A"} `}<T v="subhead" size={15} style={{ fontStyle: "italic" }}>{label}</T>{" can…"}</T>
            {held.length === 0 ? <T v="meta" size={13} color={c.ink3}>{"Nothing extra yet. It's just a title."}</T> : null}
            {held.map(p => (
              <View key={p} style={styles.canRow}><Icon name="thumb" size={12} color={c.pastel.mint.ink} /><T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>{PERM_META[p].can.charAt(0).toUpperCase() + PERM_META[p].can.slice(1)}</T></View>
            ))}
            <View style={styles.canRow}><Icon name="eye" size={12} color={c.ink3} /><T v="meta" size={13} color={c.ink3} style={{ flex: 1 }}>See everything else, like every member</T></View>
            {bigs.length > 0 ? (
              <View style={[styles.careful, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
                <T v="meta" size={12.5} color={c.ink2}><T v="bodyStrong" size={12.5}>Give this one to people you trust.</T>{` ${bigs.join(", ")} ${bigs.length > 1 ? "are" : "is"} hard to undo by mistake.`}</T>
              </View>
            ) : null}
          </View>
          {mode !== "create" && holders ? (
            <View style={{ gap: 6 }}>
              <T v="kicker" color={c.ink3}>{`Held by ${holders.length}`}</T>
              {holders.length === 0 ? <T v="meta" size={13} color={c.ink3}>No one holds this role yet.</T>
                : <View style={styles.holders}>{holders.map(h => <View key={h.id} style={[styles.holder, { borderColor: c.line2, backgroundColor: c.card }]}><T v="pill" size={12}>{h.name}</T></View>)}</View>}
            </View>
          ) : null}
          <T v="meta" size={12.5} color={c.ink3}>{`${creating ? "After you create it, give" : "Give"} it to people from `}<T v="bodyStrong" size={12.5}>Accounts</T>{" or from anyone's card on the roster."}</T>
        </View>
      </View>
    </Sheet>
  );
}

function Tpl({ on, name, desc, color, dashed, onPress }: { on: boolean; name: string; desc: string; color: string; dashed?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={name}
      style={[styles.tpl, { borderColor: on ? c.ink : c.line2, borderStyle: dashed && !on ? "dashed" : "solid", backgroundColor: on ? alpha(color, 0.12) : c.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <T v="bodyStrong" size={14} style={{ flex: 1 }}>{name}</T>
        {on ? <T v="pill" size={12}>✓</T> : null}
      </View>
      <T v="meta" size={12} color={c.ink3}>{desc}</T>
    </Pressable>
  );
}

function ColorPicker({ color, touched, readOnly, onChange }: { color: string; touched: boolean; readOnly: boolean; onChange: (hex: string) => void }) {
  const { c } = useTheme();
  const preset = touched ? swatchName(color) : null;
  const [hex, setHex] = useState(color.slice(1).toUpperCase());
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setHex(color.slice(1).toUpperCase()); }, [color, editing]);
  const bad = hex.length > 0 && !HEX6.test(hex) && !HEX3.test(hex);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sws} accessibilityRole="radiogroup" accessibilityLabel="Role color">
        {SWATCHES.map(s => {
          const on = touched && s.hex.toLowerCase() === color.toLowerCase();
          return (
            <Pressable key={s.hex} onPress={() => { haptics.tap(); onChange(s.hex); }} disabled={readOnly} accessibilityRole="radio" accessibilityState={{ selected: on }}
              accessibilityLabel={s.name} hitSlop={4} style={[styles.sw, { backgroundColor: s.hex, borderColor: on ? c.ink : "transparent" }]}>
              {on ? <View style={[styles.swIn, { borderColor: c.card }]} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.hex, { borderColor: bad ? c.pastel.rose.ink : c.line2, backgroundColor: c.card }]}>
        <View style={[styles.dot, { backgroundColor: color, width: 14, height: 14, borderRadius: 7 }]} />
        <T v="mono" size={14} color={c.ink3}>#</T>
        <TextInput value={hex} maxLength={6} autoCapitalize="characters" autoCorrect={false} editable={!readOnly} accessibilityLabel="Hex color code"
          onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
          onChangeText={v => { const clean = v.replace(/[^0-9a-f]/gi, "").toUpperCase(); setHex(clean); const full = hexOf(clean); if (full) onChange(full); }}
          style={[styles.hexInput, { color: c.ink }]} />
      </View>
      <T v="meta" size={12.5} color={c.ink3}>{!touched ? "No color yet. The role shows as neutral grey until you pick one." : preset ?? `Custom · ${color.toUpperCase()}`}</T>
    </View>
  );
}

function Shelf({ bits, onChange, canGrant, readOnly, roleLabel }: { bits: number; onChange: (b: number) => void; canGrant: (p: Permission) => boolean; readOnly: boolean; roleLabel: string }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState<Permission | null>(null);
  const heldN = PERMISSION_LIST.filter(p => (bits & p.bit) !== 0).length;
  const line = (perms: Permission[]) => {
    if (focus && perms.includes(focus)) {
      const m = PERM_META[focus];
      const on = (bits & PERMISSIONS[focus]) !== 0;
      const locked = !readOnly && !canGrant(focus);
      return (
        <T v="meta" size={12.5} color={c.ink2}>
          <T v="bodyStrong" size={12.5}>{permLabel(focus)}</T>
          <T v="pill" size={12} color={on ? c.pastel.mint.ink : c.ink3}>{` ${on ? "Can change" : "Can see"} `}</T>
          {locked ? `You don't hold ${permLabel(focus)} yourself, so you can't hand it out.` : `${m.desc}.`}
          {m.big ? <T v="pill" size={12} color={c.pastel.rose.ink}>{"  Big one"}</T> : null}
        </T>
      );
    }
    const l = shelfLine(perms, bits, roleLabel);
    return <T v="meta" size={12.5} color={c.ink2}>{l.lead}{l.bold != null ? <T v="bodyStrong" size={12.5}>{l.bold}</T> : null}{l.tail}</T>;
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.legend}>
        <View style={styles.lg}><Icon name="eye" size={12} color={c.ink3} /><T v="meta" size={12} color={c.ink3}><T v="bodyStrong" size={12}>Can see </T>Everyone, already</T></View>
        <View style={styles.lg}><Icon name="pencil" size={12} color={c.ink2} /><T v="meta" size={12} color={c.ink3}><T v="bodyStrong" size={12}>Can change </T>Add, edit, delete</T></View>
        <View style={styles.lg}><View style={[styles.dot, { backgroundColor: c.pastel.rose.ink }]} /><T v="meta" size={12} color={c.ink3}><T v="bodyStrong" size={12}>Big one </T>Give carefully</T></View>
        <View style={styles.lg} accessibilityLabel={`${heldN} of ${PERMISSION_LIST.length} pages`}>
          <View style={{ flexDirection: "row", gap: 2 }}>{PERMISSION_LIST.map(p => <View key={p.name} style={[styles.tdot, { backgroundColor: bits & p.bit ? c.ink : c.line2 }]} />)}</View>
          <T v="mono" size={11} color={c.ink3}>{`${heldN} of ${PERMISSION_LIST.length}`}</T>
        </View>
      </View>
      {PERM_GROUPS.map(g => {
        const on = g.perms.filter(p => (bits & PERMISSIONS[p]) !== 0).length;
        const grantable = g.perms.filter(canGrant);
        const gBits = bitsOf(grantable);
        const allOn = grantable.length > 0 && (bits & gBits) === gBits;
        return (
          <View key={g.label} style={[styles.shelf, { borderColor: c.line2, backgroundColor: c.card }]} accessibilityLabel={g.label}>
            <View style={[styles.shelfTab, { backgroundColor: c.pastel[g.tone].soft, borderBottomColor: c.line2 }]}>
              <T v="bodyStrong" size={13.5} style={{ flex: 1 }}>{g.label}</T>
              <T v="mono" size={11} color={c.ink3}>{`${on} of ${g.perms.length}`}</T>
              {!readOnly && grantable.length > 0 ? (
                <Pressable onPress={() => { haptics.tap(); onChange(allOn ? bits & ~gBits : bits | gBits); }} hitSlop={8} accessibilityRole="button">
                  <T v="buttonSm" size={12} color={c.pastel[g.tone].ink}>{allOn ? "Clear" : "Pick all"}</T>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.pgs}>
              {g.perms.map(p => {
                const m = PERM_META[p];
                const is = (bits & PERMISSIONS[p]) !== 0;
                const locked = !readOnly && !canGrant(p);
                return (
                  <Pressable key={p} disabled={readOnly || locked} onPress={() => { haptics.tap(); setFocus(p); onChange(bits ^ PERMISSIONS[p]); }}
                    onLongPress={() => setFocus(p)} accessibilityRole="checkbox" accessibilityState={{ checked: is, disabled: readOnly || locked }}
                    accessibilityLabel={`${permLabel(p)}: ${m.desc}${m.big ? " (big one)" : ""}${locked ? " (you can't hand this out)" : ""}`}
                    style={[styles.pg, { borderColor: is ? c.ink : c.line2, backgroundColor: is ? c.note.fill[g.tone] : c.paper2, opacity: locked ? 0.5 : 1 }]}>
                    {m.big ? <View style={[styles.big, { backgroundColor: c.pastel.rose.ink }]} /> : null}
                    <Icon name={locked ? "lock" : m.icon} size={16} color={is ? c.note.ink : c.ink3} />
                    <T v="buttonSm" size={12} color={is ? c.note.ink : c.ink2} numberOfLines={1}>{permLabel(p)}</T>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }} accessibilityLiveRegion="polite">{line(g.perms)}</View>
          </View>
        );
      })}
    </View>
  );
}

function Ladder({ others, rank, onChange, myMaxRank, myRoleIds, name, color, readOnly }: {
  others: RoleDetail[]; rank: number; onChange: (r: number) => void; myMaxRank: number; myRoleIds: Set<number>; name: string; color: string; readOnly: boolean;
}) {
  const { c } = useTheme();
  const rungs = ladderRungs(others);
  const top = rungs[0];
  const isLevel = rungs.some(r => r.rank === rank);
  const inGap = (hi: number | null, lo: number) => !isLevel && rank > lo && (hi === null || rank < hi);
  const gap = (hi: number | null, lo: number) => {
    if (inGap(hi, lo)) {
      return (
        <View key={`slot-${lo}`} style={[styles.slot, { borderColor: color, backgroundColor: alpha(color, 0.1) }]}>
          <RoleChip name={name} color={color} />
          <T v="meta" size={12} color={c.ink2} style={{ flex: 1 }}>{neighbours(rungs, hi, lo)}</T>
          <T v="mono" size={11} color={c.ink3}>{`Rank ${rank}`}</T>
        </View>
      );
    }
    const target = gapRank(hi, lo, myMaxRank);
    if (readOnly || target === null) return hi === null ? null : <View key={`gap-${lo}`} style={{ height: 8 }} />;
    return (
      <Pressable key={`gap-${lo}`} onPress={() => onChange(target)} accessibilityRole="button" accessibilityLabel={`Put it ${neighbours(rungs, hi, lo)}`}
        style={({ pressed }) => [styles.gap, { borderColor: c.line2 }, pressed && { backgroundColor: c.paper2 }]}>
        <Icon name="plus" size={11} color={c.ink3} />
        <T v="buttonSm" size={12} color={c.ink3}>Put it here</T>
      </Pressable>
    );
  };
  const why = ladderWhy(others, rank, name);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        {top ? gap(null, top.rank) : null}
        {rungs.map((r, i) => {
          const locked = r.rank >= myMaxRank;
          const mine = r.roles.some(x => myRoleIds.has(x.id) && x.rank === myMaxRank);
          const sel = r.rank === rank;
          const next = rungs[i + 1];
          const base = r.rank === 0;
          return (
            <View key={r.rank} style={{ gap: 4 }}>
              <Pressable onPress={() => onChange(r.rank)} disabled={readOnly || locked} accessibilityRole="radio" accessibilityState={{ selected: sel, disabled: readOnly || locked }}
                accessibilityLabel={`Level with ${base && !r.roles.length ? "members with no role" : r.roles.map(x => x.name).join(", ")} (rank ${r.rank})`}
                style={[styles.rung, { borderColor: sel ? color : c.line2, backgroundColor: sel ? alpha(color, 0.1) : base ? c.paper2 : c.card }]}>
                <View style={styles.rungChips}>
                  {r.roles.map(x => <RoleChip key={x.id} name={x.name} color={x.color ?? NEUTRAL_ROLE_COLOR} />)}
                  {base ? <T v="meta" size={12} color={c.ink3}>{r.roles.length ? "and members with no role" : "Members with no role"}</T> : null}
                  {sel ? <RoleChip name={name} color={color} /> : null}
                </View>
                {mine ? <T v="pill" size={10.5} color={c.ink2}>You</T> : null}
                {locked && !mine ? <Icon name="lock" size={12} color={c.ink3} /> : null}
                {!sel && !locked && !readOnly ? <T v="meta" size={11} color={c.ink3}>Level with</T> : null}
                <T v="mono" size={11} color={c.ink3}>{String(r.rank)}</T>
              </Pressable>
              {next ? gap(r.rank, next.rank) : null}
            </View>
          );
        })}
      </View>
      <View style={{ gap: 6 }}>
        <T v="meta" size={12.5} color={c.ink2}><T v="bodyStrong" size={12.5}>{"Who can give it out  "}</T>{why.givers}</T>
        <T v="meta" size={12.5} color={c.ink2}><T v="bodyStrong" size={12.5}>{"Who it can manage  "}</T>{why.manages}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  btns: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  tpls: { gap: 8 },
  tpl: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 4 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { fontSize: 24, fontFamily: "Bricolage-600", paddingVertical: 6, borderBottomWidth: 2 },
  sws: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sw: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swIn: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  hex: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 42, alignSelf: "flex-start", minWidth: 150 },
  hexInput: { fontSize: 14, fontFamily: "PlexMono-500", minWidth: 80, paddingVertical: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lg: { flexDirection: "row", alignItems: "center", gap: 5 },
  tdot: { width: 5, height: 5, borderRadius: 3 },
  shelf: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  shelfTab: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1 },
  pgs: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  pg: { width: "47%", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, flexGrow: 1 },
  big: { position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: 3 },
  slot: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, padding: 10 },
  gap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 10, paddingVertical: 6 },
  rung: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, minHeight: 46 },
  rungChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 },
  side: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 14 },
  mcard: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 10 },
  av: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  canRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  careful: { borderWidth: 1.5, borderRadius: 12, padding: 10, marginTop: 4 },
  holders: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  holder: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
});
