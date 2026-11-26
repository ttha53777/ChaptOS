/**
 * Settings → Accounts (the web's sections/AccountsSection.tsx + accounts/PersonSheet.tsx
 * at phone width): who's in, and what each of them can change.
 *
 *   list bar   By person / By area (only when role bits are visible: MANAGE_ROLES),
 *              the search, and the "Can change X" filter chip
 *   by person  Admins / Officers / Members, each row: face, name (You), email or
 *              "Can't sign in", role chips, chevron → the person sheet (the web hides
 *              the can-line at phone width, so the app has none)
 *   by area    the "has nobody in it" nudge, each permission group's pages with who
 *              can change them (tap → by person, filtered), the legend
 *   yours      "Your account": Leave this chapter / Delete my account (the app's own
 *              /more/leave and /more/account flows)
 *
 * Gates as on the web: rename = MANAGE_BROTHERS or yourself; the admin switch =
 * platform admins (PATCH /api/auth/accounts/[id]); roles = MANAGE_ROLES below your
 * rank; remove = MANAGE_BROTHERS and not yourself. Rename and role changes undo from
 * the toast.
 */
import type { AccountRow } from "@/lib/api-types";
import { orgInitials } from "@/lib/org-initials";
import type { Permission } from "@/lib/permissions";
import {
  PERM_GROUPS, TIERS, accountMatches, firstName, heldLine, heldPermissions, listJoin, permLabel, permsOf, tierOf, verdictOf,
  type RoleInfo,
} from "@/lib/settings/roles";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { removeMember, renameMember, setAdmin, setHolds, useAccounts, useSettingsRoles } from "~/data/settings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import { Sheet } from "~/shell/sheets";
import { toast } from "~/shell/toast";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { Switch } from "~/ui/Switch";
import { T } from "~/ui/T";
import { CheckRow, Face, GroupHead, PillBtn, RoleChip, SearchBox, ViewSwitch } from "./bits";
import { can, maxRankOf } from "./model";

const NEUTRAL = "#94A3B8";

export interface Powers { manage: boolean; admin: boolean; roles: boolean; maxRank: number }

export function AccountsSection() {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const accountsQ = useAccounts();
  const rolesQ = useSettingsRoles();
  const [view, setView] = useState<"person" | "area">("person");
  const [q, setQ] = useState("");
  const [area, setArea] = useState<Permission | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const accounts = accountsQ.data ?? [];
  const roles = (rolesQ.data ?? []) as RoleInfo[];
  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  const permsKnown = roles.every(r => r.permissions !== undefined);
  const holders = useMemo(() => {
    const m = new Map<number, AccountRow[]>();
    for (const a of accounts) for (const r of a.roles) m.set(r.id, [...(m.get(r.id) ?? []), a]);
    return m;
  }, [accounts]);

  if (!me) return null;
  const powers: Powers = { manage: can(me, "MANAGE_BROTHERS"), admin: me.isAdmin, roles: can(me, "MANAGE_ROLES"), maxRank: maxRankOf(me) };
  const orgName = me.org?.name ?? "this chapter";

  if (accountsQ.isPending) return <T v="meta" color={c.ink3}>Loading…</T>;
  if (accountsQ.isError) return <T v="meta" color={c.pastel.rose.ink}>Could not load account list.</T>;

  const showAreas = permsKnown && view === "area";
  const open = accounts.find(a => a.id === openId) ?? null;
  const faceOf = (a: AccountRow) => (a.isSelf ? me.avatarUrl ?? a.avatarUrl : a.avatarUrl) ?? null;

  /* ── by person ─────────────────────────────────────────────────────────── */
  const groups = TIERS.map(t => ({ t, list: accounts.filter(a => tierOf(a) === t.id && accountMatches(a, q, area, roleMap)) })).filter(g => g.list.length);
  const byPerson = groups.length === 0 ? (
    <View style={[styles.roster, styles.empty, { borderColor: c.line2, backgroundColor: c.card }]}>
      <T v="bodyStrong" size={14}>Nobody matches</T>
      <T v="meta" color={c.ink3}>Try a different name, or clear the filter.</T>
    </View>
  ) : groups.map(({ t, list }) => (
    <View key={t.id} style={{ gap: 8 }}>
      <GroupHead label={t.title} tone={t.tone} n={list.length} />
      <View style={[styles.roster, { borderColor: c.ink, backgroundColor: c.card }]}>
        {list.map((a, i) => {
          return (
            <Pressable key={a.id} onPress={() => setOpenId(a.id)} accessibilityRole="button" accessibilityLabel={a.name}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.paper2 }]}>
              <Face name={a.name} uri={faceOf(a)} admin={a.isAdmin} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <T v="bodyStrong" size={14.5} numberOfLines={1} style={{ flexShrink: 1 }}>{a.name}</T>
                  {a.isSelf ? <View style={[styles.you, { backgroundColor: c.note.fill.sky, borderColor: c.ink }]}><T v="pill" size={10.5} color={c.note.ink}>You</T></View> : null}
                </View>
                <T v="meta" size={12} color={c.ink3} numberOfLines={1}>{a.linked ? a.email ?? "" : "Can't sign in"}</T>
                <View style={styles.chips}>
                  {a.roles.length
                    ? a.roles.map(r => <RoleChip key={r.id} name={r.name} color={r.color ?? NEUTRAL} />)
                    : <RoleChip name={a.isAdmin ? "No role" : a.role || "Member"} color={c.ink3} ghost />}
                </View>
              </View>
              <Icon name="chev-r" size={16} color={c.ink3} />
            </Pressable>
          );
        })}
      </View>
    </View>
  ));

  /* ── by area ───────────────────────────────────────────────────────────── */
  const unheld = roles.filter(r => !(holders.get(r.id)?.length) && (r.permissions ?? 0) !== 0);
  const byArea = (
    <View style={{ gap: 14 }}>
      {unheld.length > 0 ? (
        <View style={[styles.nudge, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
          <Icon name="alert" size={15} color={c.pastel.butter.ink} />
          <T v="meta" size={13} color={c.ink2} style={{ flex: 1 }}>
            <T v="bodyStrong" size={13}>{listJoin(unheld.map(r => r.name))}</T>
            {` ${unheld.length === 1 ? "has nobody in it" : "have nobody in them"}, so only admins can do ${unheld.length === 1 ? "that job" : "those jobs"} right now.`}
            {powers.roles ? " Open someone below and tick the role to hand it over." : ""}
          </T>
        </View>
      ) : null}
      {PERM_GROUPS.map(g => (
        <View key={g.label} style={[styles.agrp, { borderColor: c.ink, backgroundColor: c.card, boxShadow: `3px 3px 0 ${c.note.fill[g.tone]}` }]}>
          <View style={[styles.agrpH, { backgroundColor: c.pastel[g.tone].soft, borderBottomColor: c.line2 }]}>
            <View style={[styles.sq, { backgroundColor: c.note.fill[g.tone], borderColor: c.ink }]} />
            <T v="kicker" color={c.ink2}>{g.label}</T>
          </View>
          {g.perms.map((k, i) => {
            const who = accounts.filter(a => !a.isAdmin && (permsOf(a, roleMap) ?? []).includes(k));
            return (
              <Pressable key={k} onPress={() => { haptics.tap(); setArea(k); setQ(""); setView("person"); }} accessibilityRole="button"
                accessibilityLabel={`See who can change ${permLabel(k)}`}
                style={({ pressed }) => [styles.arow, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.paper2 }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {who.length ? null : <View style={[styles.gapDot, { backgroundColor: c.pastel.rose.ink }]} />}
                    <T v="bodyStrong" size={14}>{permLabel(k)}</T>
                  </View>
                  <T v="meta" size={12.5} color={who.length ? c.ink2 : c.ink3} numberOfLines={2}>{who.length ? who.map(a => a.name).join(", ") : "Only admins"}</T>
                </View>
                <View style={styles.pile}>
                  {who.slice(0, 4).map((a, j) => <View key={a.id} style={{ marginLeft: j ? -8 : 0 }}><Face name={a.name} uri={faceOf(a)} size={24} /></View>)}
                  {who.length > 4 ? <T v="mono" size={11} color={c.ink3} style={{ marginLeft: 4 }}>{`+${who.length - 4}`}</T> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ gap: 6 }}>
        <View style={styles.can}><Icon name="key" size={12} color={c.pastel.lilac.ink} /><T v="meta" size={12} color={c.ink3}>Admins can also change every page</T></View>
        <View style={styles.can}><View style={[styles.gapDot, { backgroundColor: c.pastel.rose.ink }]} /><T v="meta" size={12} color={c.ink3}>Nobody but an admin can change this</T></View>
      </View>
    </View>
  );

  /* ── your account ──────────────────────────────────────────────────────── */
  const self = accounts.find(a => a.isSelf);
  const email = me.email || self?.email;
  const orgTag = (m: (typeof me.memberships)[number], hit: boolean) => (
    <View key={m.organizationId} style={[styles.org, { borderColor: hit ? c.ink : c.line2, backgroundColor: hit ? c.card : "transparent", opacity: hit ? 1 : 0.55 }]}>
      <View style={[styles.orgM, { borderColor: c.ink, backgroundColor: c.note.fill.lilac }]}>
        {m.orgLogoUrl ? <Image source={{ uri: m.orgLogoUrl }} style={{ width: 18, height: 18 }} /> : <T v="pill" size={8} color={c.note.ink}>{orgInitials(m.orgName)}</T>}
      </View>
      <T v="pill" size={11.5} numberOfLines={1}>{m.orgName}</T>
    </View>
  );

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 10 }}>
        {permsKnown ? (
          <ViewSwitch label="View" value={view} onChange={setView}
            options={[{ id: "person", label: "By person", icon: "people" }, { id: "area", label: "By area", icon: "board" }]} />
        ) : null}
        {!showAreas ? <SearchBox value={q} onChange={setQ} placeholder="Find someone by name, email or role" /> : null}
        {area && !showAreas ? (
          <View style={[styles.filter, { backgroundColor: c.note.fill.sky, borderColor: c.ink }]}>
            <T v="buttonSm" size={12.5} color={c.note.ink}>{`Can change ${permLabel(area)}`}</T>
            <Pressable onPress={() => setArea(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear filter"><Icon name="x" size={12} color={c.note.ink} /></Pressable>
          </View>
        ) : null}
      </View>

      {showAreas ? byArea : byPerson}

      {me.org ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <T v="title" size={21} accessibilityRole="header">Your account</T>
          <T v="meta" size={13} color={c.ink3}>{`${email ? `Signed in as ${email} with Google. ` : ""}Two ways out, and they're very different.`}</T>
          <Exit icon="out" title="Leave this chapter" tone="butter"
            scope={me.memberships.map(m => orgTag(m, m.organizationId === me.orgId))}
            body="You lose access here right away. Your records stay with the chapter, and an officer can invite you back."
            action={<PillBtn label={`Leave ${orgName}…`} kind="gold" onPress={() => router.push("/more/leave" as Href)} />} />
          <Exit icon="trash" title="Delete my account" tone="rose"
            scope={me.memberships.map(m => orgTag(m, true))}
            body="Your login is gone and you leave every chapter. Your history is erased; money you paid stays on the books without your name. No undo."
            action={<PillBtn label="Delete my account…" kind="rose" onPress={() => router.push("/more/account" as Href)} />} />
        </View>
      ) : null}

      <PersonSheet person={open} roles={roles} roleMap={roleMap} holders={holders} powers={powers} avatar={open ? faceOf(open) : null} orgName={orgName}
        onClose={() => setOpenId(null)} />
    </View>
  );
}

function Exit({ icon, title, tone, scope, body, action }: { icon: "out" | "trash"; title: string; tone: "butter" | "rose"; scope: React.ReactNode; body: string; action: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.exit, { borderColor: tone === "rose" ? alpha(c.pastel.rose.ink, 0.45) : c.line2, backgroundColor: c.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.exitIc, { backgroundColor: c.pastel[tone].soft, borderColor: c.pastel[tone].border }]}><Icon name={icon} size={15} color={c.pastel[tone].ink} /></View>
        <T v="subhead" size={16}>{title}</T>
      </View>
      <View style={styles.scope}>
        <T v="kicker" size={9.5} color={c.ink3}>Affects</T>
        {scope}
      </View>
      <T v="meta" size={13} color={c.ink2}>{body}</T>
      {action}
    </View>
  );
}

/* ── the person sheet ─────────────────────────────────────────────────────── */

function PersonSheet({ person, roles, roleMap, holders, powers, avatar, orgName, onClose }: {
  person: AccountRow | null; roles: RoleInfo[]; roleMap: Map<number, RoleInfo>; holders: Map<number, AccountRow[]>;
  powers: Powers; avatar: string | null; orgName: string; onClose: () => void;
}) {
  const { c } = useTheme();
  // Keep the last person drawn while the sheet slides away.
  const [last, setLast] = useState<AccountRow | null>(person);
  if (person && person !== last) setLast(person);
  const p = person ?? last;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<null | "admin" | "remove">(null);
  const [busy, setBusy] = useState<null | "name" | "admin" | "remove" | number>(null);
  const [forId, setForId] = useState<number | null>(null);
  if (p && p.id !== forId) { setForId(p.id); setEditing(false); setConfirm(null); setBusy(null); }

  const close = () => { setEditing(false); setConfirm(null); onClose(); };
  if (!p) return <Sheet open={false} onClose={onClose} />;

  const me = p.isSelf;
  const who = me ? "you" : firstName(p.name);
  const perms = permsOf(p, roleMap);
  const canRename = powers.manage || me;
  const canRemove = powers.manage && !me;
  const v = verdictOf(p, perms, powers.roles);

  const rename = async (to: string, from: string, quiet = false): Promise<boolean> => {
    try {
      const name = await renameMember(p.id, to);
      if (!quiet) { haptics.success(); toast.show(`Renamed to ${name}`, { undo: () => void rename(from, name, true) }); }
      return true;
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, "Failed to rename member."));
      return false;
    }
  };
  const saveName = async () => {
    const name = draft.trim();
    if (!name || name === p.name) { setEditing(false); return; }
    setBusy("name");
    const ok = await rename(name, p.name);
    setBusy(null);
    if (ok) setEditing(false);
  };
  const goAdmin = async () => {
    setBusy("admin");
    try {
      await setAdmin(p.id, !p.isAdmin);
      haptics.success();
      toast.show(!p.isAdmin ? `${firstName(p.name)} is now an admin` : `${firstName(p.name)} is no longer an admin`);
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, "Failed to update admin status."));
    }
    setBusy(null);
    setConfirm(null);
  };
  const toggle = async (role: RoleInfo, give: boolean, quiet = false) => {
    if (!quiet) setBusy(role.id);
    try {
      await setHolds(p.id, role, give);
      if (!quiet) {
        haptics.success();
        toast.show(give ? `${firstName(p.name)} is now ${role.name}` : `${firstName(p.name)} is no longer ${role.name}`,
          { undo: () => void toggle(role, !give, true) });
      }
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, give ? "Failed to grant role." : "Failed to revoke role."));
    }
    if (!quiet) setBusy(null);
  };
  const goRemove = async () => {
    setBusy("remove");
    try {
      await removeMember(p.id);
      haptics.success();
      toast.show(`${p.name} was removed from ${orgName}`);
      close();
    } catch (e) {
      haptics.error();
      toast.error(errorMessage(e, "Failed to remove member."));
      setBusy(null);
    }
  };

  const list = powers.roles ? roles : roles.filter(r => p.roles.some(x => x.id === r.id));

  return (
    <Sheet open={!!person} onClose={close} size="tall" accessibilityLabel={p.name}
      footer={canRemove ? (
        confirm === "remove" ? (
          <View style={[styles.confirm, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]}>
            <T v="meta" size={13} color={c.ink2}>
              {"Remove "}<T v="bodyStrong" size={13}>{p.name}</T>{` from ${orgName}? Their attendance, dues, service and roles here are erased. Ledger transactions stay on the books. `}
              <T v="bodyStrong" size={13}>{"This can't be undone."}</T>{" To keep their history, archive them from the roster instead."}
            </T>
            <View style={styles.acts}>
              <PillBtn label="Cancel" onPress={() => setConfirm(null)} />
              <PillBtn label="Archive instead" onPress={() => { close(); router.push("/members" as Href); }} />
              <PillBtn label={busy === "remove" ? "Removing…" : "Remove for good"} kind="roseSolid" disabled={busy === "remove"} onPress={() => void goRemove()} />
            </View>
          </View>
        ) : (
          <View style={styles.rm}>
            <T v="meta" size={12.5} color={c.ink3} style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>No longer in the chapter? Removing them erases their records here.</T>
            <PillBtn label="Remove…" kind="rose" onPress={() => { haptics.warn(); setConfirm("remove"); }} />
          </View>
        )
      ) : undefined}>
      <View style={{ gap: 22 }}>
        {/* head */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Face name={p.name} uri={avatar} admin={p.isAdmin} size={62} />
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              {editing ? (
                <View style={{ gap: 8 }}>
                  <TextInput value={draft} onChangeText={setDraft} autoFocus selectTextOnFocus maxLength={80} editable={busy !== "name"}
                    accessibilityLabel={`Name in ${orgName}`} returnKeyType="done" onSubmitEditing={() => void saveName()}
                    style={[styles.renameInput, { color: c.ink, borderColor: c.ink, backgroundColor: c.card }]} />
                  <View style={styles.acts}>
                    <PillBtn label={busy === "name" ? "Saving…" : "Save"} kind="ink" disabled={busy === "name" || !draft.trim()} onPress={() => void saveName()} />
                    <PillBtn label="Cancel" disabled={busy === "name"} onPress={() => setEditing(false)} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T v="title" size={23} style={{ flexShrink: 1 }}>{p.name}</T>
                  {canRename ? (
                    <Pressable onPress={() => { setDraft(p.name); setEditing(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Rename ${p.name}`}
                      style={({ pressed }) => [styles.pen, { borderColor: c.line2 }, pressed && pressedDim]}>
                      <Icon name="pencil" size={13} color={c.ink2} />
                    </Pressable>
                  ) : null}
                </View>
              )}
              <View style={styles.meta}>
                {p.email ? <Meta icon="envelope" text={p.email} /> : null}
                <Meta icon={p.linked ? "thumb" : "lock"} text={p.linked ? "Signs in with Google" : "Can't sign in"} ok={p.linked} />
                {me ? <Meta text="You" /> : null}
              </View>
            </View>
          </View>
          {canRename ? <T v="meta" size={12.5} color={c.ink3}>{`Renaming only changes what ${orgName} calls ${me ? "you" : "them"}. Other chapters keep their own name.`}</T> : null}
        </View>

        <Sec k={`What ${who} can do`}>
          <View style={[styles.verdict, { borderColor: p.isAdmin ? c.pastel.lilac.border : c.line2, backgroundColor: p.isAdmin ? c.pastel.lilac.soft : c.paper2 }]}>
            <T v="body" size={14} color={c.ink2}><T v="bodyStrong" size={14}>{v.who}</T>{v.rest}</T>
          </View>
        </Sec>

        {powers.admin ? (
          <Sec k="Master key">
            <View style={[styles.master, { borderColor: p.isAdmin ? c.ink : c.line2, backgroundColor: p.isAdmin ? c.pastel.lilac.soft : c.card }]}>
              <View style={[styles.tile, { backgroundColor: c.note.fill.lilac, borderColor: c.ink }]}><Icon name="key" size={15} color={c.note.ink} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong" size={14}>Admin</T>
                <T v="meta" size={12} color={c.ink3}>{me ? "You can't take your own key. Another admin can." : "Every page, every setting, billing. Ignores roles."}</T>
              </View>
              <Switch value={p.isAdmin} tone="lilac" label="Admin" disabled={me || busy === "admin"} onChange={() => setConfirm(x => (x === "admin" ? null : "admin"))} />
            </View>
            {confirm === "admin" ? (
              <View style={[styles.confirm, { borderColor: c.pastel.lilac.border, backgroundColor: c.pastel.lilac.soft }]}>
                <T v="meta" size={13} color={c.ink2}>
                  {p.isAdmin
                    ? <>{"Take the master key from "}<T v="bodyStrong" size={13}>{firstName(p.name)}</T>{"? They keep only what their roles allow."}</>
                    : <>{"Give "}<T v="bodyStrong" size={13}>{firstName(p.name)}</T>{" the master key? They'll be able to change everything here, including billing."}</>}
                </T>
                <View style={styles.acts}>
                  <PillBtn label="Cancel" onPress={() => setConfirm(null)} />
                  <PillBtn label={busy === "admin" ? "Saving…" : p.isAdmin ? "Take key" : "Make admin"} kind="ink" disabled={busy === "admin"} onPress={() => void goAdmin()} />
                </View>
              </View>
            ) : null}
          </Sec>
        ) : null}

        {roles.length > 0 && (powers.roles || p.roles.length > 0) ? (
          <Sec k="Roles" aside={powers.roles ? "Tick to give, untick to take away" : undefined}>
            {p.isAdmin && powers.roles ? <T v="meta" size={12.5} color={c.ink3}>Admins can already change everything, so a role here works as a title.</T> : null}
            <View style={[styles.rlist, { borderColor: c.line2, backgroundColor: c.card }]}>
              {list.map((r, i) => {
                const on = p.roles.some(x => x.id === r.id);
                const reachable = powers.roles && r.rank < powers.maxRank;
                const others = (holders.get(r.id) ?? []).filter(x => x.id !== p.id);
                const held = heldLine(others, on);
                const desc = r.permissions === undefined ? null : heldPermissions(r.permissions).map(permLabel).join(" · ") || "A title, no extra pages";
                const color = r.color ?? NEUTRAL;
                return (
                  <Pressable key={r.id} onPress={() => void toggle(r, !on)} disabled={!reachable || busy === r.id}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !reachable }} accessibilityLabel={r.name}
                    style={({ pressed }) => [styles.ropt, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }, pressed && { backgroundColor: c.paper2 }, { opacity: !reachable && powers.roles ? 0.6 : 1 }]}>
                    <View style={[styles.box, { borderColor: on ? color : c.line2, backgroundColor: on ? color : c.card }]}>
                      {on ? <T v="pill" size={11} color="#fff">✓</T> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={[styles.rdot, { backgroundColor: color }]} />
                        <T v="bodyStrong" size={14}>{r.name}</T>
                      </View>
                      {desc ? <T v="meta" size={12} color={c.ink3}>{desc}</T> : null}
                    </View>
                    {powers.roles && !reachable ? (
                      <View style={styles.can}><Icon name="lock" size={11} color={c.ink3} /><T v="meta" size={11.5} color={c.ink3}>Above your rank</T></View>
                    ) : (
                      <T v="meta" size={11.5} color={!others.length && !on ? c.pastel.rose.ink : c.ink3} numberOfLines={1} style={{ maxWidth: 110 }}>{held}</T>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Sec>
        ) : null}

        {perms !== null ? (
          <Sec k={`Pages ${me ? "you" : "they"} can change`}>
            <View style={{ gap: 12 }}>
              {PERM_GROUPS.map(g => (
                <View key={g.label} style={{ gap: 6 }}>
                  <GroupHead label={g.label} tone={g.tone} />
                  <View style={styles.pages}>
                    {g.perms.map(k => {
                      const lit = perms.includes(k);
                      return (
                        <View key={k} style={[styles.pg, { borderColor: lit ? c.ink : c.line2, backgroundColor: lit ? c.note.fill[g.tone] : "transparent", borderStyle: lit ? "solid" : "dashed" }]}>
                          <T v="pill" size={12} color={lit ? c.note.ink : c.ink3}>{permLabel(k)}</T>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </Sec>
        ) : null}
      </View>
    </Sheet>
  );
}

function Sec({ k, aside, children }: { k: string; aside?: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <T v="kicker" color={c.ink3}>{k}</T>
        {aside ? <T v="meta" size={11.5} color={c.ink3}>{aside}</T> : null}
      </View>
      {children}
    </View>
  );
}

function Meta({ icon, text, ok }: { icon?: "envelope" | "thumb" | "lock"; text: string; ok?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.metaPill, { borderColor: ok ? c.pastel.mint.border : c.line2, backgroundColor: ok ? c.pastel.mint.soft : c.paper2 }]}>
      {icon ? <Icon name={icon} size={11} color={ok ? c.pastel.mint.ink : c.ink3} /> : null}
      <T v="pill" size={11.5} color={ok ? c.pastel.mint.ink : c.ink2} numberOfLines={1}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  roster: { borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  empty: { padding: 18, gap: 4, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  you: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  can: { flexDirection: "row", alignItems: "center", gap: 5 },
  nudge: { flexDirection: "row", gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  agrp: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  agrpH: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },
  sq: { width: 11, height: 11, borderRadius: 3, borderWidth: 1.5 },
  arow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  gapDot: { width: 7, height: 7, borderRadius: 4 },
  pile: { flexDirection: "row", alignItems: "center" },
  filter: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, alignSelf: "flex-start" },
  exit: { borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 10 },
  exitIc: { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  scope: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  org: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingLeft: 3, paddingRight: 9, maxWidth: "100%" },
  orgM: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  confirm: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 10, marginTop: 8 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  rm: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  renameInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 17 },
  pen: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, maxWidth: "100%" },
  verdict: { borderWidth: 1.5, borderRadius: 14, padding: 12 },
  master: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  tile: { width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rlist: { borderWidth: 1.5, borderRadius: 14, overflow: "hidden" },
  ropt: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12, minHeight: 52 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rdot: { width: 8, height: 8, borderRadius: 4 },
  pages: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pg: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
});
