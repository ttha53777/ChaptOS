"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "../dashboard/primitives";
import { requestJson, apiErrorMessage } from "../../lib/api";
import "./calendar-event-form.css";
import type { ScheduleIssue } from "@/lib/calendar-feed/audit";
import { validZone, type Schedule } from "@/lib/calendar-feed/schedule";
import { ScheduleFields, initialSchedule, parseLegacyTime, scheduleFromValue, type ScheduleValue } from "./ScheduleFields";

type Health = { pending: boolean; failedAt: string | null; processedAt: string | null; failures: number };
type PreviewEntry = { title: string; location: string; schedule: Schedule; deadline: boolean; timeUnconfirmed: boolean };
type Subscription = {
  enabled: boolean; available: boolean; url: string | null; orgName: string; preview: PreviewEntry[]; timeZone: string | null; admin: boolean; validated: boolean;
  // Admin-only below.
  issues?: ScheduleIssue[]; validating?: boolean; configured?: boolean; problem?: string | null; health?: Health;
};
export type Provider = "google" | "apple";

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };
function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try { return intl.supportedValuesOf?.("timeZone") ?? []; } catch { return []; }
}
function zoneName(zone: string) { return zone.split("/").pop()?.replace(/_/g, " ") ?? zone; }
function ago(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : new Date(iso).toLocaleDateString();
}
function useSlug() {
  const [slug, setSlug] = useState("");
  useEffect(() => { setSlug(window.location.pathname.split("/")[1] ?? ""); }, []);
  return slug;
}

const buttonClass = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
const primaryClass = "rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50";

function useSubscription(active: boolean) {
  const [data, setData] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await requestJson<Subscription>("/api/calendar/subscription")); }
    catch (e) { setError(apiErrorMessage(e, "Could not load calendar subscription")); }
  }, []);
  useEffect(() => { if (active) void load(); }, [active, load]);
  return { data, error, setError, load };
}

/** Settings → Calendar subscription: the admin checklist. Members set up from the timeline. */
export function CalendarSubscription({ settings = false }: { settings?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!settings) return <><AddToCalendarButton onClick={() => setOpen(true)} />{open && <AddToCalendarDialog onClose={() => setOpen(false)} />}</>;
  return <CalendarSettings />;
}

export function AddToCalendarButton({ onClick }: { onClick: () => void }) {
  return <button className="tl-add-btn ghost" onClick={onClick}>Add to my calendar</button>;
}

function CalendarSettings() {
  const { data, error, setError, load } = useSubscription(true);
  const [busy, setBusy] = useState(false);
  const slug = useSlug();
  async function change(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      await requestJson("/api/calendar/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      await load();
      return true;
    } catch (e) { setError(apiErrorMessage(e, "Could not update calendar subscription")); return false; }
    finally { setBusy(false); }
  }
  return (
    <section className="space-y-3"><h3 className="sc-h">Calendar subscription</h3>
      <div className="cef-root space-y-4 text-sm">
        <p>Members can subscribe once to see the organization&apos;s events and deadlines in Google or Apple Calendar. Edit them in ChaptOS.</p>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        {!data && !error && <p role="status">Loading subscription…</p>}
        {data?.url && <p>Members add it from <a className="underline" href={slug ? `/${slug}/timeline?subscribe=1` : "#"}>Timeline → Add to my calendar</a>.</p>}
        {data?.admin && <AdminReadiness data={data} busy={busy} change={change} reload={load} />}
      </div>
    </section>
  );
}

// ── Member: guided setup ────────────────────────────────────────────────────
// Pick a provider, see only its steps. Nothing here can observe whether the
// provider actually subscribed, so "I've added it" is the member's word only.

export function detectDevice(ua: string, touchPoints: number) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const apple = ios || /Macintosh/.test(ua);
  return { provider: (apple ? "apple" : "google") as Provider, apple, mobile: ios || /Android|Mobile/.test(ua) };
}

const addedKey = (slug: string) => `chaptos:calendar-added:${slug}`;
function readAdded(slug: string): { provider: Provider; at: string } | null {
  try { const raw = localStorage.getItem(addedKey(slug)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function AddToCalendarDialog({ provider: requested, onClose }: { provider?: Provider; onClose: () => void }) {
  const { data, error } = useSubscription(true);
  return (
    <Modal tone="dusk" title="Add to my calendar" maxWidthClass="max-w-xl" onClose={onClose}>
      <div className="cef-root space-y-5 text-sm">
        {error && <p role="alert" className="text-red-400">{error}</p>}
        {!data && !error && <p role="status">Loading…</p>}
        {data && !data.url && <p>{!data.available ? "Calendar subscriptions aren't available for your organization yet." : "Calendar subscriptions are off. An organization admin can turn them on in Settings."}</p>}
        {data?.url && <GuidedSetup data={data} url={data.url} requested={requested} />}
      </div>
    </Modal>
  );
}

function GuidedSetup({ data, url, requested }: { data: Subscription; url: string; requested?: Provider }) {
  const slug = useSlug();
  const [device, setDevice] = useState<ReturnType<typeof detectDevice> | null>(null);
  const [provider, setProvider] = useState<Provider | null>(requested ?? null);
  const [added, setAdded] = useState<{ provider: Provider; at: string } | null>(null);
  useEffect(() => {
    // After mount: the dialog's markup must not depend on the server's guess.
    const found = detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    setDevice(found);
    setProvider(p => p ?? found.provider);
  }, []);
  useEffect(() => { if (slug) setAdded(readAdded(slug)); }, [slug]);
  function markAdded() {
    if (!provider) return;
    const value = { provider, at: new Date().toISOString() };
    try { localStorage.setItem(addedKey(slug), JSON.stringify(value)); } catch { /* still confirm on screen */ }
    setAdded(value);
  }
  const name = provider === "apple" ? "Apple Calendar" : "Google Calendar";

  return <>
    <Preview data={data} />
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold">Which calendar do you use?</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["google", "apple"] as const).map(p => (
          <label key={p} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#a78bfa]/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#a78bfa]">
            <input type="radio" name="calendar-provider" value={p} checked={provider === p} onChange={() => setProvider(p)} />
            {p === "google" ? "Google Calendar" : "Apple Calendar"}
          </label>
        ))}
      </div>
    </fieldset>

    {provider === "google" && device && <GoogleSteps url={url} mobile={device.mobile} />}
    {provider === "apple" && device && <AppleSteps url={url} apple={device.apple} />}

    {provider && <div className="space-y-2 border-t border-white/10 pt-4">
      {added?.provider === provider
        ? <p role="status">You marked this as added{added.at ? ` on ${new Date(added.at).toLocaleDateString()}` : ""}. New and changed events appear when {name} next refreshes{provider === "google" ? ", which can take up to a day" : ""}. If it isn&apos;t showing, go through the steps again.</p>
        : <button className={buttonClass} onClick={markAdded}>I&apos;ve added it</button>}
    </div>}

    <details>
      <summary>About this link</summary>
      <div className="mt-2 space-y-2">
        <p>Your calendar app checks for updates on its own schedule, so changes aren&apos;t instant. Downloading and importing a file instead creates a one-time copy that never updates.</p>
        <p>The link works without signing in. Removing a member does not revoke their copy. If an admin replaces the link, the old one stops updating, but events already downloaded stay in people&apos;s calendars.</p>
      </div>
    </details>
  </>;
}

const dayFormat: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
function when(entry: PreviewEntry): string {
  const s = entry.schedule;
  if (s.kind === "allDay") {
    const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, dayFormat);
    const last = new Date(new Date(`${s.end}T12:00:00Z`).getTime() - 86400_000).toISOString().slice(0, 10);
    if (entry.deadline) return `Due ${day(s.start)}`;
    return `${day(s.start)}${last !== s.start ? ` – ${day(last)}` : ""} · ${entry.timeUnconfirmed ? "time to be confirmed" : "all day"}`;
  }
  // Calendar apps show times in the device's zone; so does the preview.
  const start = new Date(s.start);
  return `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Preview({ data }: { data: Subscription }) {
  return (
    <section aria-label="What you'll get" className="space-y-3">
      <p>{data.orgName ? <strong>{data.orgName}</strong> : "Your organization"}&apos;s events and deadlines, kept up to date in your own calendar. Edit them in ChaptOS.</p>
      <div>
        <p className="cef-hint">Coming up</p>
        {data.preview.length ? <ul className="mt-1 space-y-1">{data.preview.map((entry, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-3"><span className="min-w-0 break-words">{entry.title}</span><span className="opacity-70">{when(entry)}</span></li>
        ))}</ul> : <p className="mt-1">Nothing scheduled yet. New events appear as they&apos;re added.</p>}
      </div>
      <p className="cef-hint">Included: event titles, times, places and categories, and task due dates. Not included: notes, who&apos;s attending or assigned, or anything about dues and money.</p>
    </section>
  );
}

function CopyField({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"" | "copied" | "failed">("");
  async function copy() {
    try { await navigator.clipboard.writeText(value); setState("copied"); }
    catch { setState("failed"); input.current?.focus(); input.current?.select(); }
  }
  return (
    <div className="space-y-1">
      <label className="block">{label}
        <span className="mt-1 flex gap-2">
          <input ref={input} className="cef-input min-w-0 flex-1" readOnly value={value} onFocus={e => e.currentTarget.select()} />
          <button type="button" className={buttonClass} onClick={() => void copy()}>{state === "copied" ? "Copied" : "Copy"}</button>
        </span>
      </label>
      {state === "failed" && <p role="alert" className="cef-hint sched-warn">Couldn&apos;t copy automatically. The link is selected; copy it with Ctrl+C (⌘C on a Mac).</p>}
      {state === "copied" && <span role="status" className="sr-only">Copied</span>}
      {note && <p className="cef-hint">{note}</p>}
    </div>
  );
}

const privacyNote = "Anyone with this link can see your organization's published schedule. Keep it private.";

function GoogleSteps({ url, mobile }: { url: string; mobile: boolean }) {
  const [computer, setComputer] = useState(!mobile);
  // Only rendered after the client-side fetch, so window is always there.
  const handoff = `${window.location.origin}/${window.location.pathname.split("/")[1]}/timeline?subscribe=google`;
  if (!computer) return (
    <div className="space-y-3">
      <p><strong>Google Calendar only adds subscriptions in a computer browser.</strong> Open this page on a computer and sign in to finish there. It will appear in the Google Calendar app on your phone afterwards.</p>
      {/* Setup page, never the feed: this is safe to send to yourself. */}
      <CopyField label="Link to open on your computer" value={handoff} />
      <button type="button" className="sched-link" onClick={() => setComputer(true)}>I&apos;m on a computer, show the steps</button>
    </div>
  );
  return (
    <ol className="list-decimal space-y-3 pl-5">
      <li><CopyField label="Copy your organization's calendar link" value={url} note={privacyNote} /></li>
      <li>Open <a className="underline" href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener noreferrer">Google Calendar&apos;s &ldquo;From URL&rdquo; page</a>. (In Google Calendar: Other calendars → + → From URL.)</li>
      <li>Paste the link into <em>URL of calendar</em> and choose <em>Add calendar</em>.</li>
      <li className="opacity-80">Google checks for changes a few times a day, so updates can take up to a day to appear. To see it on your phone, open the Google Calendar app&apos;s settings and make sure the calendar is synced.</li>
    </ol>
  );
}

function AppleSteps({ url, apple }: { url: string; apple: boolean }) {
  return (
    <div className="space-y-3">
      {!apple && <p>Open this on your iPhone, iPad or Mac to add it to Apple Calendar.</p>}
      <p><a className={`${primaryClass} inline-block no-underline`} href={url.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer">Open in Apple Calendar</a></p>
      <p>Calendar asks you to confirm the subscription. Choose <strong>iCloud</strong> as the location (on a Mac) or account (on iPhone) to see it on all your Apple devices.</p>
      <details>
        <summary>If the button doesn&apos;t open Calendar</summary>
        <div className="mt-2 space-y-3">
          <CopyField label="Copy your organization's calendar link" value={url} note={privacyNote} />
          <p><strong>Mac:</strong> in Calendar, choose File → New Calendar Subscription, paste the link, then Subscribe.</p>
          <p><strong>iPhone or iPad:</strong> in Calendar, tap Calendars → Add Calendar → Add Subscription Calendar, paste the link, then Subscribe.</p>
        </div>
      </details>
    </div>
  );
}

// ── Admin: readiness checklist ──────────────────────────────────────────────
// Time zone → blocking items → publication check → on for members. Each step
// says why the next is unavailable; nothing here needs a terminal.

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="font-semibold"><span aria-hidden className="mr-2 opacity-70">{done ? "✓" : `${n}.`}</span>{" "}{title}{done && <span className="sr-only"> (done)</span>}</p>
      {children}
    </li>
  );
}

function AdminReadiness({ data, busy, change, reload }: {
  data: Subscription; busy: boolean;
  change: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
  reload: () => Promise<void>;
}) {
  const [zone, setZone] = useState(data.timeZone ?? "");
  const [editingZone, setEditingZone] = useState(!data.timeZone);
  const [rotate, setRotate] = useState(false);
  const [checkResult, setCheckResult] = useState<"" | "failed">("");
  const zones = useMemo(allZones, []);
  const slug = useSlug();
  const href = (path: string) => slug ? `/${slug}${path}` : path;

  // Poll while the worker settles a requested check; report a failed one.
  const wasValidating = useRef(false);
  useEffect(() => {
    if (data.validating) { wasValidating.current = true; const t = setInterval(() => void reload(), 4000); return () => clearInterval(t); }
    if (wasValidating.current) { wasValidating.current = false; setCheckResult(data.validated ? "" : "failed"); }
  }, [data.validating, data.validated, reload]);

  const issues = data.issues ?? [];
  const blocking = issues.filter(i => i.blocking);
  const unconfirmed = issues.filter(i => i.kind === "time-unconfirmed");
  const notes = issues.filter(i => !i.blocking && i.kind !== "time-unconfirmed");
  const zoneDone = Boolean(data.timeZone) && !editingZone;
  const device = deviceZone();
  const health = data.health;

  const blockingHref = (issue: ScheduleIssue) =>
    issue.kind === "unlinked-service" ? href("/service") : issue.kind === "unlinked-party" ? href("/parties") : href(`/timeline?event=${issue.id}`);
  const blockingText: Partial<Record<ScheduleIssue["kind"], string>> = {
    "legacy-deadline": "An old deadline entry on the timeline. Deadlines now come from tasks; delete it or change its category.",
    "unlinked-service": "A service project with no timeline entry. Open Service and re-save it, or delete it.",
    "unlinked-party": "A party with no timeline entry. Open Parties and re-save it, or delete it.",
  };

  const enableReason = !data.enabled && (
    !data.configured ? "Calendar subscriptions aren't set up on this server yet. Ask your ChaptOS administrator."
    : !data.available ? "ChaptOS hasn't opened calendar subscriptions for your organization yet."
    : !data.validated ? "Run the publication check first."
    : null);

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      <p role="status"><strong>{data.enabled ? "On for members." : "Off for members."}</strong>{" "}
        {health?.failedAt ? `Publishing calendar updates is failing (${health.failures} attempt${health.failures === 1 ? "" : "s"}); it retries automatically.`
          : health?.pending ? "Calendar updates are waiting to publish."
          : health?.processedAt ? `Calendar updated ${ago(health.processedAt)}.`
          : "Calendar updates haven't been published yet."}
      </p>

      <ol className="space-y-3" style={{ listStyle: "none", padding: 0 }}>
        <Step n={1} done={zoneDone} title="Confirm your time zone">
          {zoneDone ? <p>{zoneName(data.timeZone!)} ({data.timeZone}). <button type="button" className="sched-link" onClick={() => setEditingZone(true)}>Change</button></p> : <>
            <label className="block">Organization time zone
              <input className="cef-input mt-1" list="org-zone-list" value={zone} onChange={e => setZone(e.target.value)} placeholder="Search a city, e.g. New York" />
            </label>
            <datalist id="org-zone-list">{zones.map(z => <option key={z} value={z}>{zoneName(z)}</option>)}</datalist>
            {device && zone !== device && <p><button type="button" className="sched-link" onClick={() => setZone(device)}>Use this device&apos;s zone ({zoneName(device)})</button></p>}
            <div className="flex flex-wrap gap-3">
              <button className={primaryClass} disabled={busy || !validZone(zone) || zone === data.timeZone}
                onClick={async () => { if (await change("timeZone", { timeZone: zone })) setEditingZone(false); }}>Confirm time zone</button>
              {data.timeZone && <button className={buttonClass} onClick={() => { setZone(data.timeZone!); setEditingZone(false); }}>Cancel</button>}
            </div>
            <p className="cef-hint">New events default to this zone. Changing it doesn&apos;t move existing events or pause the subscription.</p>
          </>}
        </Step>

        <Step n={2} done={blocking.length === 0} title={blocking.length ? `Fix ${blocking.length} item${blocking.length === 1 ? "" : "s"} that would appear wrong or twice` : "No blocking items"}>
          {blocking.length > 0 && <ul className="space-y-2">{blocking.map(issue => (
            <li key={`${issue.source}:${issue.id}`}>
              <a className="underline" href={blockingHref(issue)}>{issue.title}</a>
              <span className="block cef-hint">{blockingText[issue.kind] ?? issue.issue}</span>
            </li>
          ))}</ul>}
        </Step>

        <Step n={3} done={data.validated && !data.validating} title="Check publication">
          <p>Builds the full calendar once and confirms nothing is missing or blocked. Takes about a minute.</p>
          {data.validating ? <p role="status">Checking…</p> : <>
            <button className={buttonClass} disabled={busy || Boolean(data.problem) || !data.configured} onClick={async () => { setCheckResult(""); await change("validate"); }}>
              {data.validated ? "Run the check again" : "Run the check"}
            </button>
            {data.problem && <p className="cef-hint">{data.problem}</p>}
            {!data.problem && !data.configured && <p className="cef-hint">Calendar subscriptions aren&apos;t set up on this server yet. Ask your ChaptOS administrator.</p>}
            {checkResult === "failed" && <p role="alert" className="cef-hint sched-warn">The check didn&apos;t pass. Fix the items above and run it again.</p>}
          </>}
        </Step>

        <Step n={4} done={data.enabled} title="Turn on for members">
          <button className={data.enabled ? buttonClass : primaryClass} disabled={busy || Boolean(enableReason)} onClick={() => void change(data.enabled ? "disable" : "enable")}>
            {data.enabled ? "Disable subscription" : "Enable subscription"}
          </button>
          {enableReason && <p className="cef-hint">{enableReason}</p>}
        </Step>
      </ol>

      {unconfirmed.length > 0 && (
        <details open={unconfirmed.length <= 5}>
          <summary><strong>{unconfirmed.length} event{unconfirmed.length === 1 ? " shows" : "s show"} as all-day in members&apos; calendars</strong> because the time was typed as text. Set a start and end time to fix it.</summary>
          <ul className="mt-2 space-y-3">{unconfirmed.map(issue => <UnconfirmedTime key={issue.id} issue={issue} onSaved={reload} />)}</ul>
        </details>
      )}

      {notes.length > 0 && (
        <details>
          <summary>{notes.length} other note{notes.length === 1 ? "" : "s"} (left out of the calendar)</summary>
          <ul className="mt-2 space-y-1">{notes.map(issue => <li key={`${issue.source}:${issue.id}`}><strong>{issue.title}</strong>: {issue.kind === "invalid-due-date" ? "the task's due date isn't a real date." : "the event's date isn't a real date."}</li>)}</ul>
        </details>
      )}

      <details>
        <summary>Advanced</summary>
        <div className="mt-2 space-y-2">
          <button className={buttonClass} disabled={busy} onClick={() => setRotate(true)}>Regenerate URL</button>
          {rotate && <div role="alert" className="space-y-2">
            <p>Everyone who subscribed will stop getting updates until they add the new link.</p>
            <button className={buttonClass} disabled={busy} onClick={async () => { if (await change("rotate")) setRotate(false); }}>Regenerate and revoke old URL</button>
            <button className={`${buttonClass} ml-4`} onClick={() => setRotate(false)}>Keep current URL</button>
          </div>}
        </div>
      </details>
    </div>
  );
}

// ── Admin: set a real time for an event that only has free text ─────────────

function UnconfirmedTime({ issue, onSaved }: { issue: ScheduleIssue; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ScheduleValue>(() => {
    // Prefill what the text clearly says; the officer confirms it.
    const guess = parseLegacyTime(issue.time ?? "");
    return { ...initialSchedule(null, { date: issue.date ?? "", isNew: true }), startTime: guess.start ?? "", endTime: guess.end ?? "" };
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const result = scheduleFromValue(value);
    if ("error" in result) { setError(result.error); return; }
    setSaving(true); setError("");
    try {
      await requestJson(`/api/calendar/${issue.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: result.schedule }) });
      await onSaved();
    } catch (e) { setError(apiErrorMessage(e, "Could not save the time")); }
    finally { setSaving(false); }
  }
  return (
    <li className="space-y-2">
      <p><strong>{issue.title}</strong> · {issue.date} · “{issue.time}”{" "}
        {!editing && <button type="button" className="sched-link" onClick={() => setEditing(true)}>Set time</button>}</p>
      {editing && <>
        <ScheduleFields value={value} onChange={setValue} />
        {error && <p role="alert" className="cef-hint sched-warn">{error}</p>}
        <div className="flex gap-3">
          <button className={primaryClass} disabled={saving} onClick={() => void save()}>Save time</button>
          <button className={buttonClass} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </>}
    </li>
  );
}
