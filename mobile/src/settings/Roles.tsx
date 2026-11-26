/**
 * Settings → Roles (the web's sections/RolesSection.tsx + roles/RoleCards, PeopleRegister,
 * HolderPicker at phone width). MANAGE_ROLES only.
 *
 *   bar        By role N / By person N, "Find a role or person", + New role
 *   by role    an index card per role: tinted head (name → the role sheet, page tags,
 *              tally or "Above your rank" stamp), one holder per ruled line (× to take),
 *              "Give it to someone" / "Add someone else"; then the New role card
 *   by person  Everyone / Has a role / No role, each person with their role chips (×)
 *              and "+ Role" / "+ Give a role"
 *   picker     "Who's a Treasurer?" (people for a role) or a person's roles: each tap
 *              grants/revokes at once, the tick is the confirmation
 *
 * Every pair reads the cached /api/auth/accounts (setHolds flips it first and back on a
 * refusal), so both views and the picker redraw together. Toasts carry Undo, except
 * inside the picker (the tick already says it), as on the web.
 */
import type { AccountRow, RoleDetail } from "@/lib/api-types";
import { firstName, grantToast, permTags, roleColor, sortRoles, whoTitle } from "@/lib/settings/roles";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { setHolds, useAccounts, useSettingsRoles } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { Face, PillBtn, RoleChip, SearchBox, ViewSwitch, toneForId } from "./bits";
import { useDirtyGuard } from "./dirty";
import { can, maxRankOf } from "./model";
import { RoleSheet, type SheetMode } from "./RoleSheet";

type Person = Pick<AccountRow, "id" | "name" | "avatarUrl" | "isSelf" | "isAdmin">;
type Pick_ = { kind: "role"; roleId: number } | { kind: "person"; personId: number };
type SheetState = { mode: "create" } | { mode: "edit" | "view"; roleId: number };

export function RolesSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const ok = !!me && can(me, "MANAGE_ROLES");
  const rolesQ = useSettingsRoles(ok);
  const accountsQ = useAccounts(ok);
  const [view, setView] = useState<"role" | "person">("role");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<Pick_ | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  useDirtyGuard("roles", sheetDirty);

  const roles = useMemo(() => sortRoles((rolesQ.data ?? []) as RoleDetail[]), [rolesQ.data]);
  const accounts = accountsQ.data ?? [];
  const people: Person[] = accounts;
  const myMaxRank = me ? maxRankOf(me) : 0;
  const myRoleIds = useMemo(() => new Set((me?.roles ?? []).map(r => r.id)), [me?.roles]);
  const editable = (r: RoleDetail) => ok && r.rank < myMaxRank;
  const holds = (roleId: number, personId: number) => !!accounts.find(a => a.id === personId)?.roles.some(r => r.id === roleId);
  const holdersOf = (roleId: number) => people.filter(p => holds(roleId, p.id));
  const rolesOf = (personId: number) => roles.filter(r => holds(r.id, personId));

  const pickRef = useRef(pick);
  pickRef.current = pick;
  const toggle = async (roleId: number, personId: number, quiet = false) => {
    const role = roles.find(r => r.id === roleId);
    const person = people.find(p => p.id === personId);
    const k = `${roleId}:${personId}`;
    if (!role || !person || !editable(role) || busy.has(k)) return;
    const adding = !holds(roleId, personId);
    setBusy(s => new Set(s).add(k));
    haptics.tap();
    try {
      await setHolds(personId, role, adding);
      if (!quiet && !pickRef.current) {
        toast.show(grantToast(person, role.name, adding), { undo: () => void toggle(roleId, personId, true) });
      }
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, adding ? `Couldn't give ${role.name} to ${person.name}.` : `Couldn't take ${role.name} from ${person.name}.`));
    } finally {
      setBusy(s => { const n = new Set(s); n.delete(k); return n; });
    }
  };

  if (!me || !ok) return null;

  const sheetRole = sheet && sheet.mode !== "create" ? roles.find(r => r.id === sheet.roleId) : undefined;
  const mode: SheetMode | null = sheet ? (sheet.mode === "create" ? "create" : sheetRole ? sheet.mode : null) : null;
  const canGrantAny = roles.some(editable);
  const open = (r: RoleDetail) => setSheet({ mode: editable(r) ? "edit" : "view", roleId: r.id });

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 10 }}>
        <ViewSwitch label="View" value={view} onChange={setView}
          options={[{ id: "role", label: "By role", icon: "board", n: roles.length }, { id: "person", label: "By person", icon: "people", n: people.length }]} />
        <PillBtn label="New role" icon="plus" kind="ink" small={false} style={{ alignSelf: "flex-end" }} onPress={() => setSheet({ mode: "create" })} />
        <SearchBox value={query} onChange={setQuery} placeholder="Find a role or person" />
      </View>

      {(rolesQ.isPending || accountsQ.isPending) && roles.length === 0 ? (
        <T v="meta" color={c.ink3}>Loading roles…</T>
      ) : rolesQ.isError || accountsQ.isError ? (
        <T v="meta" color={c.pastel.rose.ink}>Could not load roles.</T>
      ) : view === "role" ? (
        <RoleCards roles={roles} holdersOf={holdersOf} rolesOf={rolesOf} editable={editable} query={query}
          onAdd={roleId => setPick({ kind: "role", roleId })} onRemove={(roleId, p) => void toggle(roleId, p.id)} onOpen={open}
          onNew={() => setSheet({ mode: "create" })} />
      ) : (
        <PeopleRegister people={people} rolesOf={rolesOf} editable={editable} canGrantAny={canGrantAny} query={query}
          onAdd={personId => setPick({ kind: "person", personId })} onRemove={(roleId, p) => void toggle(roleId, p.id)} />
      )}

      <HolderPicker target={pick} roles={roles} people={people} holds={holds} busy={busy} editable={editable} rolesOf={rolesOf}
        onToggle={(r, p) => void toggle(r, p)} onClose={() => setPick(null)} />

      <RoleSheet open={!!mode} key={sheet?.mode === "create" ? "new" : String(sheetRole?.id ?? "none")} mode={mode ?? "view"} role={sheetRole} roles={roles}
        holders={sheetRole ? holdersOf(sheetRole.id).map(p => ({ id: p.id, name: p.name })) : undefined}
        myMaxRank={myMaxRank} myRoleIds={myRoleIds} canGrant={p => can(me, p)} orgType={me.org?.orgType ?? null}
        previewName={me.name ?? "A member"} onClose={() => { setSheet(null); setSheetDirty(false); }} onDirtyChange={setSheetDirty} />
    </View>
  );
}

/* ── by role ──────────────────────────────────────────────────────────────── */

function RoleCards({ roles, holdersOf, rolesOf, editable, query, onAdd, onRemove, onOpen, onNew }: {
  roles: RoleDetail[]; holdersOf: (id: number) => Person[]; rolesOf: (id: number) => RoleDetail[]; editable: (r: RoleDetail) => boolean; query: string;
  onAdd: (roleId: number) => void; onRemove: (roleId: number, p: Person) => void; onOpen: (r: RoleDetail) => void; onNew: () => void;
}) {
  const { c } = useTheme();
  const q = query.trim().toLowerCase();
  const shown = q ? roles.filter(r => r.name.toLowerCase().includes(q) || holdersOf(r.id).some(p => p.name.toLowerCase().includes(q))) : roles;
  return (
    <View style={{ gap: 14 }}>
      {shown.map(r => {
        const holders = holdersOf(r.id);
        const ok = editable(r);
        const rc = roleColor(r);
        return (
          <View key={r.id} style={[styles.card, { borderColor: c.ink, backgroundColor: c.card, boxShadow: `3px 3px 0 ${alpha(rc, 0.45)}` }]}>
            <View style={[styles.cardHead, { backgroundColor: alpha(rc, 0.14), borderBottomColor: alpha(rc, 0.45) }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Pressable onPress={() => onOpen(r)} accessibilityRole="button" accessibilityLabel={r.name} hitSlop={6}
                  style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4 }, pressed && pressedDim]}>
                  <T v="subhead" size={18} numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</T>
                  <Icon name="chev-r" size={14} color={c.ink2} />
                </Pressable>
                <View style={styles.tags}>
                  {permTags(r.permissions).map(t => (
                    <View key={t} style={[styles.tag, { borderColor: alpha(rc, 0.5), backgroundColor: c.card }]}><T v="pill" size={11}>{t}</T></View>
                  ))}
                </View>
              </View>
              {ok ? (
                <View style={[styles.tally, { borderColor: c.ink, backgroundColor: c.card }]}>
                  <T v="monoLg" size={20} color={holders.length ? c.ink : c.ink3}>{String(holders.length)}</T>
                  <T v="label" size={9} color={c.ink3}>{holders.length === 1 ? "person" : "people"}</T>
                </View>
              ) : (
                <View style={[styles.stamp, { borderColor: c.ink3 }]}>
                  <Icon name="lock" size={11} color={c.ink3} />
                  <T v="stamp" size={10} color={c.ink3}>Locked</T>
                </View>
              )}
            </View>
            {holders.length === 0 ? (
              <View style={[styles.line, { borderBottomColor: c.line }]}>
                <T v="mono" size={11} color={c.ink3} style={styles.no}>—</T>
                <T v="meta" size={13} color={c.ink3}>Nobody has this role yet.</T>
              </View>
            ) : null}
            {holders.map((p, i) => {
              const others = rolesOf(p.id).filter(x => x.id !== r.id).map(x => x.name);
              return (
                <View key={p.id} style={[styles.line, { borderBottomColor: c.line }]}>
                  <T v="mono" size={11} color={c.ink3} style={styles.no}>{String(i + 1).padStart(2, "0")}</T>
                  <Face name={p.name} uri={p.avatarUrl} size={28} tone={toneForId(p.id)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T v="bodyStrong" size={14} numberOfLines={1}>{p.name}</T>
                    <T v="meta" size={11.5} color={c.ink3} numberOfLines={1}>{others.length ? `Also ${others.join(", ")}` : "Just this role"}</T>
                  </View>
                  {p.isSelf ? <T v="pill" size={10.5} color={c.ink3}>You</T> : null}
                  {ok ? (
                    <Pressable onPress={() => onRemove(r.id, p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Take ${r.name} from ${p.name}`}
                      style={({ pressed }) => [styles.x, { borderColor: c.line2 }, pressed && pressedDim]}>
                      <Icon name="x" size={11} color={c.ink3} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {ok ? (
              <Pressable onPress={() => onAdd(r.id)} accessibilityRole="button" style={({ pressed }) => [styles.line, { borderBottomWidth: 0 }, pressed && { backgroundColor: c.paper2 }]}>
                <View style={styles.no} />
                <View style={[styles.plus, { borderColor: c.line2 }]}><Icon name="plus" size={11} color={c.ink2} /></View>
                <T v="buttonSm" size={13} color={c.ink2}>{holders.length ? "Add someone else" : "Give it to someone"}</T>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {!q ? (
        <Pressable onPress={onNew} accessibilityRole="button" style={({ pressed }) => [styles.newCard, { borderColor: c.line2 }, pressed && { backgroundColor: c.paper2 }]}>
          <View style={[styles.plus, styles.plusBig, { borderColor: c.ink2 }]}><Icon name="plus" size={15} color={c.ink2} /></View>
          <T v="subhead" size={16}>New role</T>
          <T v="meta" size={12.5} color={c.ink3}>Pick what it can do, then who holds it</T>
        </Pressable>
      ) : null}
      {q && shown.length === 0 ? <T v="meta" color={c.ink3}>{`No role or person matches “${query.trim()}”.`}</T> : null}
    </View>
  );
}

/* ── by person ────────────────────────────────────────────────────────────── */

type Filter = "all" | "some" | "none";
function PeopleRegister({ people, rolesOf, editable, canGrantAny, query, onAdd, onRemove }: {
  people: Person[]; rolesOf: (id: number) => RoleDetail[]; editable: (r: RoleDetail) => boolean; canGrantAny: boolean; query: string;
  onAdd: (personId: number) => void; onRemove: (roleId: number, p: Person) => void;
}) {
  const { c } = useTheme();
  const [filter, setFilter] = useState<Filter>("all");
  const q = query.trim().toLowerCase();
  const some = people.filter(p => rolesOf(p.id).length > 0).length;
  const counts = { all: people.length, some, none: people.length - some };
  const rows = people
    .filter(p => filter === "all" || (filter === "some") === (rolesOf(p.id).length > 0))
    .filter(p => !q || p.name.toLowerCase().includes(q) || rolesOf(p.id).some(r => r.name.toLowerCase().includes(q)))
    .map(p => ({ p, roles: rolesOf(p.id) }))
    .sort((a, b) => (b.roles[0]?.rank ?? -1) - (a.roles[0]?.rank ?? -1) || a.p.name.localeCompare(b.p.name));
  const FILTERS: { id: Filter; label: string }[] = [{ id: "all", label: "Everyone" }, { id: "some", label: "Has a role" }, { id: "none", label: "No role" }];

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Show">
        {FILTERS.map(f => {
          const on = filter === f.id;
          return (
            <Pressable key={f.id} onPress={() => { haptics.tap(); setFilter(f.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[styles.fpill, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.ink : c.card }]}>
              <T v="buttonSm" size={12.5} color={on ? c.paper : c.ink2}>{`${f.label} `}<T v="buttonSm" size={12.5} color={on ? c.paper : c.ink}>{String(counts[f.id])}</T></T>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.register, { borderColor: c.ink, backgroundColor: c.card }]}>
        {rows.map(({ p, roles }, i) => (
          <View key={p.id} style={[styles.prow, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Face name={p.name} uri={p.avatarUrl} size={34} tone={toneForId(p.id)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={14} numberOfLines={1}>{`${p.name}${p.isSelf ? " · You" : ""}`}</T>
                <T v="meta" size={12} color={c.ink3}>{p.isAdmin ? "Org admin · full access" : roles.length ? `${roles.length} ${roles.length === 1 ? "role" : "roles"}` : "Member"}</T>
              </View>
            </View>
            <View style={styles.chips}>
              {roles.map(r => (
                <RoleChip key={r.id} name={r.name} color={roleColor(r)}
                  onRemove={editable(r) ? () => onRemove(r.id, p) : undefined} removeLabel={`Take ${r.name} from ${p.name}`} />
              ))}
              {roles.length === 0 ? <T v="meta" size={12} color={c.ink3}>No role</T> : null}
              {canGrantAny ? <PillBtn label={roles.length ? "Role" : "Give a role"} icon="plus" kind="dashed" onPress={() => onAdd(p.id)} /> : null}
            </View>
          </View>
        ))}
        {rows.length === 0 ? <T v="meta" color={c.ink3} style={{ padding: 16 }}>{q ? `No one matches “${query.trim()}”.` : "No one here."}</T> : null}
      </View>
    </View>
  );
}

/* ── the picker ───────────────────────────────────────────────────────────── */

function HolderPicker({ target, roles, people, holds, busy, editable, rolesOf, onToggle, onClose }: {
  target: Pick_ | null; roles: RoleDetail[]; people: Person[]; holds: (r: number, p: number) => boolean; busy: ReadonlySet<string>;
  editable: (r: RoleDetail) => boolean; rolesOf: (id: number) => RoleDetail[]; onToggle: (r: number, p: number) => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const [q, setQ] = useState("");
  // Who held the role when the sheet opened: sections draw from this, so a tapped row
  // ticks in place instead of jumping to the other section.
  const [had, setHad] = useState<{ key: string; ids: Set<number> }>({ key: "", ids: new Set() });
  const [last, setLast] = useState<Pick_ | null>(target);
  if (target && target !== last) setLast(target);
  const t = target ?? last;
  const key = t ? (t.kind === "role" ? `r${t.roleId}` : `p${t.personId}`) : "";
  if (t && had.key !== key) {
    setHad({ key, ids: new Set(t.kind === "role" ? people.filter(p => holds(t.roleId, p.id)).map(p => p.id) : []) });
    setQ("");
  }
  const role = t?.kind === "role" ? roles.find(r => r.id === t.roleId) : undefined;
  const person = t?.kind === "person" ? people.find(p => p.id === t.personId) : undefined;
  if (!role && !person) return <Sheet open={false} onClose={onClose} />;

  const needle = q.trim().toLowerCase();
  const tick = (on: boolean, color: string) => (
    <View style={[styles.tick, { borderColor: on ? color : c.line2, backgroundColor: on ? color : c.card }]}>{on ? <T v="pill" size={11} color="#fff">✓</T> : null}</View>
  );
  const close = () => { setHad({ key: "", ids: new Set() }); onClose(); };

  let list: React.ReactNode;
  let summary: React.ReactNode;
  if (role) {
    const rc = roleColor(role);
    const matches = people.filter(p => !needle || p.name.toLowerCase().includes(needle));
    const option = (p: Person) => {
      const on = holds(role.id, p.id);
      const others = rolesOf(p.id).filter(x => x.id !== role.id).map(x => x.name);
      return (
        <Pressable key={p.id} onPress={() => onToggle(role.id, p.id)} disabled={busy.has(`${role.id}:${p.id}`)} accessibilityRole="checkbox"
          accessibilityState={{ checked: on }} accessibilityLabel={p.name} style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.paper2 }]}>
          <Face name={p.name} uri={p.avatarUrl} size={32} tone={toneForId(p.id)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="bodyStrong" size={14} numberOfLines={1}>{`${p.name}${p.isSelf ? " · You" : ""}`}</T>
            <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{others.length ? others.join(" · ") : "No other role"}</T>
          </View>
          {tick(on, rc)}
        </Pressable>
      );
    };
    const before = matches.filter(p => had.ids.has(p.id));
    const rest = matches.filter(p => !had.ids.has(p.id));
    list = (
      <>
        {before.length > 0 ? <T v="kicker" color={c.ink3} style={styles.sec}>{`Has it · ${before.length}`}</T> : null}
        {before.map(option)}
        {rest.length > 0 ? <T v="kicker" color={c.ink3} style={styles.sec}>{before.length ? "Everyone else" : "Everyone"}</T> : null}
        {rest.map(option)}
        {matches.length === 0 ? <T v="meta" color={c.ink3} style={styles.sec}>{`No one called “${q.trim()}”.`}</T> : null}
      </>
    );
    const n = people.filter(p => holds(role.id, p.id)).length;
    summary = n ? <><T v="bodyStrong" size={13}>{String(n)}</T>{` ${n === 1 ? "person has" : "people have"} this role`}</> : "No one has this role yet";
  } else {
    const p = person!;
    const matches = roles.filter(r => !needle || r.name.toLowerCase().includes(needle));
    list = (
      <>
        {matches.map(r => {
          const on = holds(r.id, p.id);
          const ok = editable(r);
          const rc = roleColor(r);
          return (
            <Pressable key={r.id} onPress={() => onToggle(r.id, p.id)} disabled={!ok || busy.has(`${r.id}:${p.id}`)} accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !ok }} accessibilityLabel={r.name}
              style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.paper2 }, !ok && { opacity: 0.6 }]}>
              <View style={[styles.dot, { backgroundColor: rc }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={14}>{r.name}</T>
                {ok
                  ? <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{permTags(r.permissions).join(" · ")}</T>
                  : <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="lock" size={11} color={c.ink3} /><T v="meta" size={12} color={c.ink3}>Ranked at or above your role</T></View>}
              </View>
              {tick(on, rc)}
            </Pressable>
          );
        })}
        {matches.length === 0 ? <T v="meta" color={c.ink3} style={styles.sec}>{`No role called “${q.trim()}”.`}</T> : null}
      </>
    );
    const n = rolesOf(p.id).length;
    summary = n ? <><T v="bodyStrong" size={13}>{firstName(p.name)}</T>{` holds ${n} ${n === 1 ? "role" : "roles"}`}</> : `${firstName(p.name)} has no role yet`;
  }
  const title = role ? whoTitle(role.name) : person!.name;

  return (
    <Sheet open={!!target} onClose={close} size="tall" tone="sky" accessibilityLabel={title}
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>{summary}</T>
          <PillBtn label="Done" kind="ink" onPress={close} />
        </View>
      }>
      <View style={{ gap: 12 }}>
        {role ? <RoleChip name={role.name} color={roleColor(role)} /> : <T v="kicker" color={c.ink3}>Roles</T>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {person ? <Face name={person.name} uri={person.avatarUrl} size={34} tone={toneForId(person.id)} /> : null}
          <T v="title" size={22} style={{ flexShrink: 1 }}>{title}</T>
        </View>
        <T v="meta" size={13} color={c.ink3}>
          {role ? `Tap to add or remove. They'll get: ${permTags(role.permissions).join(", ").toLowerCase()}.` : "Tap a role to give it or take it away."}
        </T>
        <SearchBox value={q} onChange={setQ} placeholder={role ? "Search the roster" : "Search roles"} />
        <View>{list}</View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderBottomWidth: 1.5 },
  tally: { alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, minWidth: 64 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  stamp: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7, transform: [{ rotate: "-4deg" }] },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: 1, minHeight: 48 },
  no: { width: 20 },
  x: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  plus: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  plusBig: { width: 34, height: 34, borderRadius: 17 },
  newCard: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, padding: 20, alignItems: "center", gap: 6 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fpill: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  register: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  prow: { padding: 14, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, minHeight: 52 },
  sec: { marginTop: 10, marginBottom: 4 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
