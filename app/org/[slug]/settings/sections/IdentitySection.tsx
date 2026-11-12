"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChapter } from "../../../../context/ChapterContext";
import { Modal } from "../../../../components/dashboard/primitives";
import { isNavVisible } from "../../../../components/Sidebar";
import { AddIGTaskForm, AddRevenueForm } from "../../../../components/dashboard/forms";
import { InstagramType, InstagramTask, PartyEvent } from "../../../../data";
import { useOrgPath } from "../../../../hooks/useOrgPath";
import { useActiveSemester } from "../../../../hooks/useActiveSemester";
import { orgFetch, requestJson } from "../../../../lib/api";
import { orgInitials } from "@/lib/org-initials";
import { getOrgType } from "@/lib/org-types";
import { SITE_URL } from "@/lib/seo";
import { VOCAB_KEYS, DEFAULT_LABELS, resolveLabel, type VocabKey, type VocabOverrides } from "@/lib/vocab";
import { useDirtyGuard } from "../SettingsDirtyContext";
import { DangerZone } from "./DangerZone";
import "./identity.css";

// Settings → Identity: how the chapter LOOKS (icon, Instagram handle) and TALKS
// (vocabulary overrides), on one page. Built from
// _design/Identity Settings Paper Mock.html; it replaced the old General and
// Vocabulary sections.
//
// One save bar covers everything. The icon stages as a local preview until
// Save, then goes through POST/DELETE /api/orgs/logo; handle and words go in a
// single PATCH /api/orgs/config. Name, slug and org type are shown but not
// editable — that PATCH takes no `name` (A2 in docs/settings-ux-audit.md).
//
// Everyone can open it. Without MANAGE_SETTINGS it's read-only: no drop target,
// no Instagram step, no quick actions, no danger zone.

const GROUPS: { label: string; tint: string; keys: VocabKey[] }[] = [
  { label: "People", tint: "var(--pp-lilac)",  keys: ["Member", "Admin", "Role"] },
  { label: "Pages",  tint: "var(--pp-mint)",   keys: ["Treasury", "Meetings", "Service", "Dues", "Attendance", "Announcement", "Doc"] },
  { label: "Time",   tint: "var(--pp-butter)", keys: ["Period", "Event"] },
];

const PICKS: Record<VocabKey, string[]> = {
  Member: ["Brother", "Sister", "Sibling", "Player"], Admin: ["Officer", "Exec", "Board"], Role: ["Position", "Office", "Chair"],
  Treasury: ["Finances", "Budget"], Dues: ["Fees", "Contributions"], Meetings: ["Chapter", "Sessions", "Board"],
  Service: ["Philanthropy", "Volunteering"], Attendance: ["Check-in", "Roll call"], Announcement: ["Bulletin", "Update"],
  Doc: ["File", "Resource"], Period: ["Term", "Quarter", "Season"], Event: ["Session", "Practice"],
};

// Only the keys whose reach isn't obvious from the word itself.
const WHERE: Partial<Record<VocabKey, string>> = {
  Member: "Sidebar, roster, member cards",
  Treasury: "Sidebar & page title",
  Meetings: "Sidebar & page title",
  Service: "Sidebar & page title",
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const cleanHandle = (h: string) => h.trim().replace(/^@+/, "");
const handleOk = (h: string) => /^[A-Za-z0-9._]{0,30}$/.test(h);
const SITE_HOST = new URL(SITE_URL).host;

/** The logo as staged: untouched, a picked file awaiting Save, or removed. */
type LogoDraft = { kind: "same" } | { kind: "new"; file: File; preview: string } | { kind: "removed" };

let _nextId = Date.now();
type ModalKey = "revenue" | "ig" | null;

export function IdentitySection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const {
    currentUser, brotherList, can, refreshChapterData,
    setIgTaskList, setPartyList, setMutationError,
  } = useChapter();
  const orgPath = useOrgPath();
  const semester = useActiveSemester();
  const canEdit = can("MANAGE_SETTINGS");

  const org = currentUser?.org;
  const orgName = org?.name ?? "Your chapter";
  const enabledWorkflows = org?.enabledWorkflows ?? [];
  // Shortcuts INTO other pages respect the sidebar's workflow gating, and so
  // does the handle: it only exists for the Instagram page.
  const igEnabled = isNavVisible("Instagram", enabledWorkflows);
  const partiesEnabled = isNavVisible("Parties", enabledWorkflows);

  // ── Persisted values ─────────────────────────────────────────────────────
  const savedLogo = org?.logoUrl ?? null;
  const savedHandle = org?.instagramHandle ?? "";
  const savedWords = useMemo(
    () => (org?.vocabularyOverrides ?? {}) as VocabOverrides,
    [org?.vocabularyOverrides],
  );
  const savedKey = JSON.stringify([savedLogo, savedHandle, savedWords]);

  // ── Draft ────────────────────────────────────────────────────────────────
  const [logo, setLogo] = useState<LogoDraft>({ kind: "same" });
  const [handle, setHandle] = useState(savedHandle);
  const [words, setWords] = useState<VocabOverrides>(() => ({ ...savedWords }));
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed the draft when the server copy changes (after a save, or another
  // officer's edit picked up by a refresh).
  const lastSynced = useRef(savedKey);
  useEffect(() => {
    if (lastSynced.current === savedKey) return;
    lastSynced.current = savedKey;
    setHandle(savedHandle);
    setWords({ ...savedWords });
    setLogo({ kind: "same" });
  }, [savedKey, savedHandle, savedWords]);

  // A staged preview is an object URL; let it go when it's replaced.
  useEffect(() => {
    if (logo.kind !== "new") return;
    return () => URL.revokeObjectURL(logo.preview);
  }, [logo]);

  const shownLogo = logo.kind === "new" ? logo.preview : logo.kind === "removed" ? null : savedLogo;
  const draftHandle = cleanHandle(handle);
  const handleBad = !handleOk(draftHandle);
  const wordOf = (k: VocabKey) => (words[k] ?? "").trim();
  const changedWords = VOCAB_KEYS.filter(k => wordOf(k) !== (savedWords[k] ?? "").trim());
  const handleChanged = canEdit && igEnabled && draftHandle !== savedHandle;

  const changes: string[] = [];
  if (logo.kind === "new") changes.push("new icon");
  if (logo.kind === "removed" && savedLogo) changes.push("icon removed");
  if (handleChanged) changes.push("Instagram");
  if (changedWords.length === 1) changes.push(`“${wordOf(changedWords[0]!) || DEFAULT_LABELS[changedWords[0]!]}”`);
  else if (changedWords.length > 1) changes.push(`${changedWords.length} words`);
  const dirty = canEdit && changes.length > 0;
  useDirtyGuard("identity", dirty);

  // Labels as the draft would render them — the previews read these.
  const liveWords = useMemo(() => {
    const o: VocabOverrides = {};
    for (const k of VOCAB_KEYS) { const v = (words[k] ?? "").trim(); if (v) o[k] = v; }
    return o;
  }, [words]);
  const label = (k: VocabKey, plural = false) => resolveLabel(k, liveWords, plural);

  // ── Icon ─────────────────────────────────────────────────────────────────
  function takeFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("That isn't an image. Try a PNG, JPG or SVG."); return; }
    if (file.size > MAX_LOGO_BYTES) { setLogoError("That image is over 2 MB. Try a smaller one."); return; }
    setLogoError(null);
    setLogo({ kind: "new", file, preview: URL.createObjectURL(file) });
  }
  function removeIcon() {
    setLogoError(null);
    setLogo(savedLogo ? { kind: "removed" } : { kind: "same" });
  }

  // ── Save / discard ───────────────────────────────────────────────────────
  function discard() {
    setLogo({ kind: "same" });
    setHandle(savedHandle);
    setWords({ ...savedWords });
    setLogoError(null);
  }

  const save = useCallback(async () => {
    if (saving || handleBad) return;
    setSaving(true);
    try {
      // Icon first: if the upload is refused (too big, wrong type) nothing else
      // has changed yet, and the error lands next to the drop target.
      if (logo.kind !== "same") {
        let res: Response;
        if (logo.kind === "new") {
          const fd = new FormData();
          fd.append("file", logo.file);
          res = await orgFetch("/api/orgs/logo", { method: "POST", body: fd });
        } else {
          res = await orgFetch("/api/orgs/logo", { method: "DELETE" });
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLogoError(data?.error ?? "Couldn't save the icon. Try again.");
          return;
        }
      }

      const body: { instagramHandle?: string; vocabularyOverrides?: VocabOverrides } = {};
      if (handleChanged) body.instagramHandle = draftHandle;
      // Full replace: empty means "use the default", so it's omitted.
      if (changedWords.length > 0) body.vocabularyOverrides = liveWords;
      if (Object.keys(body).length > 0) {
        await requestJson("/api/orgs/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      await refreshChapterData().catch(() => undefined);
      onStatus("Saved — the whole chapter sees it now.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? "You need the Org settings permission to change this."
          : "Couldn't save your changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, handleBad, logo, handleChanged, draftHandle, changedWords.length, liveWords, refreshChapterData, onStatus, onError]);

  // ── Quick actions (moved here from the old General section) ────────────
  function persist<T>(op: Promise<T>, errMsg: string, rollback: () => void, onSuccess: (v: T) => void) {
    op.then(v => { setMutationError(null); onSuccess(v); })
      .catch(err => { console.error(err); rollback(); setMutationError(errMsg); });
  }
  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const tempId = _nextId++;
    setPartyList(prev => [...prev, { id: tempId, theme: "", collabOrg: "", expenses: 0, partyType: "Open", completed: false, completedAt: null, ...e }]);
    setActiveModal(null);
    persist(
      requestJson<PartyEvent>("/api/parties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }
  function handleAddIGTask(t: { title: string; dueDate: string; type: InstagramType }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t, status: "open" }]);
    setActiveModal(null);
    persist(
      requestJson<InstagramTask>("/api/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) }),
      "Post could not be saved. Local changes were reverted.",
      () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
      saved => setIgTaskList(prev => prev.map(x => x.id === tempId ? saved : x)),
    );
  }
  function handleRefresh() {
    refreshChapterData()
      .then(() => { setMutationError(null); onStatus("Refreshed."); })
      .catch(err => { console.error(err); onError("Couldn't refresh. Check your connection and try again."); });
  }

  // ── Bits ─────────────────────────────────────────────────────────────────
  const initials = orgInitials(orgName);
  const mark = (size: number, extra = "") => (
    <div className={`id-mark ${extra}`} style={{ "--sz": `${size}px` } as React.CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shownLogo ? <img src={shownLogo} alt="" /> : initials}
    </div>
  );
  const typeLabel = getOrgType(org?.orgType)?.label ?? "Organization";
  const otherOrg = currentUser?.memberships.find(m => m.organizationId !== currentUser.orgId) ?? null;
  const showIg = canEdit && igEnabled;
  const badgeHandle = savedOrDraftHandle(showIg, draftHandle, savedHandle);
  const n = { icon: 1, ig: 2, words: showIg ? 3 : 2 };

  return (
    <div className="id-page">
      {!canEdit && (
        <div className="id-ro-note">
          <LockIcon />
          You can see how your chapter is set up. Officers with Org settings can change it.
        </div>
      )}

      {/* ── The badge: drawn from the real fields, redraws as you edit ── */}
      <section className="id-badge" aria-label="Your chapter">
        {mark(96)}
        <div style={{ minWidth: 0 }}>
          <div className="id-type"><i />{typeLabel}</div>
          <h2>{orgName}</h2>
          <div className="id-facts">
            <span className="id-fact mono"><LinkIcon />{SITE_HOST}/org/{org?.slug}</span>
            {igEnabled && (
              <span className={`id-fact${badgeHandle ? "" : " off"}`}>
                <IgIcon />
                {badgeHandle ? `@${badgeHandle}` : "No Instagram"}
              </span>
            )}
            <span className="id-fact"><PeopleIcon />{brotherList.length} {brotherList.length === 1 ? label("Member") : label("Member", true)}</span>
            {semester && <span className="id-fact"><CalIcon />{semester.label}</span>}
          </div>
          <p className="id-name-note">
            <InfoIcon />
            The name and web address were set when the chapter was created and can&apos;t be changed here yet.
          </p>
        </div>
      </section>

      {/* ── 1 · Icon ── */}
      <section className="id-step" aria-labelledby="id-s1">
        <div className="id-step-h"><span className="id-step-n" style={{ "--s": "var(--pp-lilac)" } as React.CSSProperties}>{n.icon}</span><h3 className="id-step-t" id="id-s1">Your icon</h3></div>
        <p className="id-step-sub">The little picture people recognize your chapter by. Without one we use your initials.</p>
        <div className="id-step-body">
          <div className="id-icon-row">
            <div>
              {canEdit ? (
                <>
                  <input
                    ref={fileRef} type="file" accept="image/*" hidden tabIndex={-1} aria-hidden="true"
                    onChange={e => { takeFile(e.target.files?.[0]); e.target.value = ""; }}
                  />
                  <button
                    type="button"
                    className={`id-drop${over ? " over" : ""}`}
                    aria-label="Upload a chapter icon"
                    aria-describedby={logoError ? "id-icon-err" : undefined}
                    disabled={saving}
                    onClick={() => fileRef.current?.click()}
                    onDragEnter={e => { e.preventDefault(); setOver(true); }}
                    onDragOver={e => { e.preventDefault(); setOver(true); }}
                    onDragLeave={e => { e.preventDefault(); setOver(false); }}
                    onDrop={e => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files[0]); }}
                  >
                    {mark(104)}
                    <span className="id-hint"><b>Drop an image here</b><br />or click to choose<br />Square works best · PNG, JPG or SVG · up to 2 MB</span>
                  </button>
                  {shownLogo && (
                    <div className="id-icon-btns">
                      <button className="id-btn sm rose" type="button" onClick={removeIcon} disabled={saving}>Remove</button>
                    </div>
                  )}
                  {logoError && <p className="id-err" id="id-icon-err" role="alert">{logoError}</p>}
                </>
              ) : (
                <div className="id-drop ro">{mark(104)}</div>
              )}
            </div>
            <div>
              <div className="id-where-h">Shows up in</div>
              <div className="id-places">
                <div className="id-place">
                  <div className="id-scene sc-side">
                    <div className="id-sb-head">{mark(26, "thin")}<b>{orgName}</b><ChevronDown /></div>
                    <div className="id-ghost" style={{ width: "70%" }} /><div className="id-ghost" style={{ width: "52%" }} />
                  </div>
                  <div className="id-cap">The sidebar<small>Top left, for everyone</small></div>
                </div>
                <div className="id-place">
                  <div className="id-scene sc-login">
                    {mark(34, "thin")}
                    <p>Sign in to {orgName}</p>
                    <span className="id-gbtn">Continue with Google</span>
                  </div>
                  <div className="id-cap">Sign-in &amp; invites<small>The first thing new people see</small></div>
                </div>
                <div className="id-place">
                  <div className="id-scene">
                    <div className="id-sw-row on">{mark(20, "thin tiny")}<span>{orgName}</span><CheckIcon /></div>
                    <div className="id-sw-row dim">
                      <div className="id-mark thin tiny" style={{ "--sz": "20px" } as React.CSSProperties}>
                        {otherOrg ? orgInitials(otherOrg.orgName) : "…"}
                      </div>
                      <span>{otherOrg ? otherOrg.orgName : "Another chapter"}</span>
                    </div>
                  </div>
                  <div className="id-cap">Chapter switcher<small>For people in more than one</small></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · Instagram ── */}
      {showIg && (
        <section className="id-step" aria-labelledby="id-s2">
          <div className="id-step-h"><span className="id-step-n" style={{ "--s": "var(--pp-peach)" } as React.CSSProperties}>{n.ig}</span><h3 className="id-step-t" id="id-s2">Instagram</h3></div>
          <p className="id-step-sub">The account your Media page plans posts for. Leave it empty if you don&apos;t have one.</p>
          <div className="id-step-body">
            <div className="id-ig-row">
              <div>
                <label className="id-field-l" htmlFor="id-ig">Account handle</label>
                <div className={`id-at-field${handleBad ? " bad" : ""}`}>
                  <span>@</span>
                  <input
                    id="id-ig" value={handle} maxLength={31} placeholder="yourchapter"
                    autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={saving}
                    aria-describedby="id-ig-help" aria-invalid={handleBad || undefined}
                    onChange={e => setHandle(e.target.value.replace(/^@+/, ""))}
                  />
                </div>
                <p className={`id-help${handleBad ? " bad" : ""}`} id="id-ig-help">
                  {handleBad ? "Only letters, numbers, dots and underscores, up to 30." : "Letters, numbers, dots and underscores."}
                </p>
              </div>
              <div className="id-ig-prev" aria-hidden="true">
                <div className="k">On your Media page</div>
                <div className="hd">
                  <b>Media</b>
                  {draftHandle && !handleBad
                    ? <span className="id-ig-chip"><IgIcon />@{draftHandle}</span>
                    : <span className="id-ig-chip off">Hidden — no account linked</span>}
                </div>
                <div className="tiles"><i /><i /><i /><i /></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 3 · Words ── */}
      <section className="id-step" aria-labelledby="id-s3">
        <div className="id-step-h"><span className="id-step-n" style={{ "--s": "var(--pp-butter)" } as React.CSSProperties}>{n.words}</span><h3 className="id-step-t" id="id-s3">Your words</h3></div>
        <p className="id-step-sub">
          {canEdit
            ? "Call things what your chapter calls them. Type your own or tap a suggestion. Empty means we use our word."
            : "What this chapter calls things across the app."}
        </p>
        <div className="id-step-body">
          {GROUPS.map(g => (
            <div className="id-w-group" key={g.label}>
              <div className="id-w-group-h" style={{ "--s": g.tint } as React.CSSProperties}><i />{g.label}</div>
              <div className="id-w-grid">
                {g.keys.map(k => {
                  const v = wordOf(k);
                  const changed = !!v && v !== DEFAULT_LABELS[k];
                  return (
                    <div key={k} className={`id-tag${changed ? " changed" : ""}`}>
                      <div className="id-swap">
                        <span className="from">{DEFAULT_LABELS[k]}</span>
                        <ArrowIcon />
                        <input
                          aria-label={`Your word for ${DEFAULT_LABELS[k]}`}
                          maxLength={40}
                          placeholder={DEFAULT_LABELS[k]}
                          value={words[k] ?? ""}
                          readOnly={!canEdit}
                          disabled={saving}
                          onChange={e => setWords(prev => ({ ...prev, [k]: e.target.value }))}
                        />
                        {canEdit && (
                          <button
                            type="button" className="id-undo" title={`Use “${DEFAULT_LABELS[k]}”`} aria-label={`Use ${DEFAULT_LABELS[k]}`}
                            onClick={() => setWords(prev => ({ ...prev, [k]: "" }))}
                          >
                            <UndoIcon />
                          </button>
                        )}
                      </div>
                      {canEdit && (
                        <div className="id-picks">
                          {PICKS[k].map(p => (
                            <button
                              key={p} type="button" className="id-pick" aria-pressed={v === p}
                              onClick={() => setWords(prev => ({ ...prev, [k]: v === p ? "" : p }))}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                      {WHERE[k] && <div className="id-wherein"><PinIcon />{WHERE[k]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <div className="id-also">
          <span className="k">Also in here</span>
          {partiesEnabled && <button className="id-btn sm ghost" type="button" onClick={() => setActiveModal("revenue")}>Log revenue</button>}
          {igEnabled && <button className="id-btn sm ghost" type="button" onClick={() => setActiveModal("ig")}>Add IG task</button>}
          <Link className="id-btn sm ghost" href={orgPath("/tasks?new=1")}>Add task</Link>
          <button className="id-btn sm ghost" type="button" onClick={handleRefresh}>↻ Refresh data</button>
          <button className="id-btn sm ghost" type="button" onClick={() => window.print()}>Print this page</button>
        </div>
      )}

      {/* Org-admin only; renders nothing for everyone else. */}
      <DangerZone onError={onError} memberCount={brotherList.length} />

      {/* ── One save bar for everything ── */}
      <div className={`id-savebar${dirty ? " up" : ""}`} role="region" aria-label="Unsaved changes" aria-hidden={!dirty || undefined} inert={!dirty || undefined}>
        <span className="pip" />
        <span className="msg">
          <b>{changes.length === 1 ? "1 change" : `${changes.length} changes`}</b>
          <span className="long"> · {changes.join(", ")}</span>
        </span>
        <span className="acts">
          <button className="id-btn sm ghost" type="button" onClick={discard} disabled={saving}>Discard</button>
          <button className="id-btn sm butter" type="button" onClick={save} disabled={saving || handleBad}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </span>
      </div>

      {activeModal === "revenue" && (
        <Modal title="Log Revenue" tone="dusk" onClose={() => setActiveModal(null)}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Social Post" tone="dusk" onClose={() => setActiveModal(null)}>
          <AddIGTaskForm onSubmit={handleAddIGTask} />
        </Modal>
      )}
    </div>
  );
}

/** The badge shows the draft handle to an editor (it's a live preview) and the
 *  saved one to everyone else. Empty or invalid reads as none. */
function savedOrDraftHandle(editing: boolean, draft: string, saved: string): string {
  const h = editing ? draft : saved;
  return h && handleOk(h) ? h : "";
}

// ── Icons ────────────────────────────────────────────────────────────────────
const s16 = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function LinkIcon() { return <svg {...s16}><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0L3.2 8.6a3 3 0 0 0 4.2 4.2l.7-.7" /></svg>; }
function IgIcon() { return <svg {...s16}><rect x="2" y="2" width="12" height="12" rx="3.5" /><circle cx="8" cy="8" r="2.8" /><circle cx="11.6" cy="4.4" r=".6" fill="currentColor" /></svg>; }
function PeopleIcon() { return <svg {...s16}><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c.6-2.3 2.3-3.5 4.5-3.5s3.9 1.2 4.5 3.5M11 3.2a2.4 2.4 0 0 1 0 4.6M12.5 10.3c1 .5 1.7 1.6 2 3.2" /></svg>; }
function CalIcon() { return <svg {...s16}><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>; }
function ChevronDown() { return <svg {...s16} strokeWidth={1.8}><path d="m5 6 3 3 3-3" /></svg>; }
function CheckIcon() { return <svg {...s16} strokeWidth={2}><path d="m3.5 8.5 3 3 6-7" /></svg>; }
function ArrowIcon() { return <svg className="arr" {...s16} strokeWidth={1.7}><path d="M3 8h10M9 4l4 4-4 4" /></svg>; }
function UndoIcon() { return <svg {...s16} strokeWidth={1.7}><path d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H6M6 3.5l-3 3 3 3" /></svg>; }
function PinIcon() { return <svg {...s16}><path d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z" /><circle cx="8" cy="6" r="1.8" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.75 10.5h-1.5V7h1.5v4.5ZM8 5.75a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" /></svg>; }
function LockIcon() { return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg>; }
