"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "../dashboard/primitives";
import { requestJson, apiErrorMessage } from "../../lib/api";
import "./calendar-event-form.css";
import "./calendar-subscription.css";
import type { ScheduleIssue } from "@/lib/calendar-feed/audit";
import { validZone, type Schedule } from "@/lib/calendar-feed/schedule";
import { ScheduleFields, initialSchedule, parseLegacyTime, scheduleFromValue, type ScheduleValue } from "./ScheduleFields";

type Health = { pending: boolean; failedAt: string | null; processedAt: string | null; failures: number };
type MemberStatus = { state: "current" | "publishing" | "retrying" | "unknown"; updatedAt: string | null };
type PreviewEntry = { title: string; location: string; schedule: Schedule; deadline: boolean; timeUnconfirmed: boolean };
type Subscription = {
  enabled: boolean; available: boolean; url: string | null; orgName: string; preview: PreviewEntry[]; timeZone: string | null; admin: boolean; validated: boolean;
  status: MemberStatus; generation: number;
  // Admin-only below.
  issues?: ScheduleIssue[]; validating?: boolean; turningOn?: boolean; configured?: boolean; problem?: string | null; health?: Health;
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

export const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

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

/** `briefing` sits with Add Deadline/Add Event inside `.dash`; `toolbar` is the
 *  mobile header (outside `.dash`), which styles its buttons inline. */
export function AddToCalendarButton({ onClick, variant = "briefing" }: { onClick: () => void; variant?: "briefing" | "toolbar" }) {
  if (variant === "toolbar") return (
    <button onClick={onClick} aria-label="Add to my calendar"
      className="tb-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(236,231,221,0.12)] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-[#c9c2b4] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 hover:border-[#a78bfa]/40 hover:bg-[#a78bfa]/10 hover:text-[#ece7dd] focus:outline-none [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-[#958d7c]">
      <CalendarIcon /><span className="hidden sm:inline">Subscribe</span>
    </button>
  );
  return <button className="tl-add-btn ghost" onClick={onClick}><CalendarIcon />Add to my calendar</button>;
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
    <section className="sc-stack-tight">
      {error && <p role="alert" className="sc-err">{error}</p>}
      {!data && !error && <p role="status" className="sc-note">Loading subscription…</p>}
      {data && !data.url && !data.admin && <p className="sc-note">Calendar subscriptions are off for your organization. An organization admin can turn them on here.</p>}
      {data?.url && !data.admin && <p className="sc-note">Members add it from <a className="sched-link" href={slug ? `/${slug}/timeline?subscribe=1` : "#"}>Timeline → Add to my calendar</a>.</p>}
      {data?.admin && <AdminReadiness data={data} busy={busy} change={change} reload={load} />}
      {data?.url && data.admin && slug && <TellMembers slug={slug} orgName={data.orgName} />}
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
/** `generation` is the link version the member added; a later rotation bumps it.
 *  Older records predate it and can't tell a replaced link apart. */
type Added = { provider: Provider; at: string; generation?: number };
export function readAdded(slug: string): Added | null {
  try { const raw = localStorage.getItem(addedKey(slug)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function AddToCalendarDialog({ provider: requested, onClose }: { provider?: Provider; onClose: () => void }) {
  const { data, error } = useSubscription(true);
  const slug = useSlug();
  const [hadAdded, setHadAdded] = useState(false);
  useEffect(() => { if (slug) setHadAdded(readAdded(slug) !== null); }, [slug]);
  return (
    <Modal tone="dusk" title="Add to my calendar" maxWidthClass="max-w-xl" onClose={onClose}>
      <div className="cef-root cal-flow">
        {error && <p role="alert" className="cal-err">{error}</p>}
        {!data && !error && <p role="status" className="cal-muted">Loading…</p>}
        {data && !data.url && <p>{!data.available ? "Calendar subscriptions aren't available for your organization yet."
          : hadAdded ? "Your organization has paused calendar updates. Events already in your calendar stay there but won't change until an admin turns updates back on. You don't need to add the calendar again."
          : data.admin ? <>Calendar subscriptions are off. <a className="sched-link" href={slug ? `/${slug}/settings?section=calendar` : "#"}>Turn them on in Settings</a>; it takes one click.</>
          : "Calendar subscriptions are off. An organization admin can turn them on in Settings."}</p>}
        {data?.url && <GuidedSetup data={data} url={data.url} requested={requested} />}
      </div>
    </Modal>
  );
}

function GuidedSetup({ data, url, requested }: { data: Subscription; url: string; requested?: Provider }) {
  const slug = useSlug();
  const [device, setDevice] = useState<ReturnType<typeof detectDevice> | null>(null);
  const [provider, setProvider] = useState<Provider | null>(requested ?? null);
  const [added, setAdded] = useState<Added | null>(null);
  useEffect(() => {
    // After mount: the dialog's markup must not depend on the server's guess.
    const found = detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    setDevice(found);
    setProvider(p => p ?? found.provider);
  }, []);
  useEffect(() => { if (slug) setAdded(readAdded(slug)); }, [slug]);
  function markAdded() {
    if (!provider) return;
    const value: Added = { provider, at: new Date().toISOString(), generation: data.generation };
    try { localStorage.setItem(addedKey(slug), JSON.stringify(value)); } catch { /* still confirm on screen */ }
    setAdded(value);
  }
  const name = provider === "apple" ? "Apple Calendar" : "Google Calendar";
  // The member added a link that an admin has since replaced: the old calendar
  // has stopped updating and the steps below add the new one.
  const replaced = added?.generation != null && added.generation !== data.generation;

  return <>
    {replaced && <p role="status" className="cal-alert"><strong>Your organization replaced this calendar link</strong> after you added it on {new Date(added!.at).toLocaleDateString()}. The calendar you added has stopped updating. Add the new link below, then remove the old calendar so events don&apos;t show twice.</p>}
    <Preview data={data} />
    <fieldset className="cal-sec">
      <legend className="cef-label mb-[9px]">Which calendar do you use?</legend>
      <div className="cal-choices">
        {(["google", "apple"] as const).map(p => (
          <label key={p} className="cal-choice">
            <input type="radio" name="calendar-provider" value={p} checked={provider === p} onChange={() => setProvider(p)} />
            <span className="ring" aria-hidden />
            {p === "google" ? "Google Calendar" : "Apple Calendar"}
          </label>
        ))}
      </div>
    </fieldset>

    {provider === "google" && device && <GoogleSteps url={url} mobile={device.mobile} />}
    {provider === "apple" && device && <AppleSteps url={url} apple={device.apple} />}

    {provider && <div className="cal-foot">
      {added?.provider === provider && !replaced
        ? <p role="status" className="cal-added"><span className="tick"><Tick /></span><span>You marked this as added{added.at ? ` on ${new Date(added.at).toLocaleDateString()}` : ""}. New and changed events appear when {name} next refreshes{provider === "google" ? ", which can take up to a day" : ""}. If it isn&apos;t showing, go through the steps again.</span></p>
        : <button className="cal-btn" onClick={markAdded}>I&apos;ve added it</button>}
    </div>}

    <Troubleshooting status={data.status} provider={provider} replaced={replaced} />

    <details className="cal-details">
      <summary>About this link</summary>
      <div className="cal-details-body">
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
    <section aria-label="What you'll get" className="cal-sec">
      <p>{data.orgName ? <strong>{data.orgName}</strong> : "Your organization"}&apos;s events and deadlines, kept up to date in your own calendar. Edit them in ChaptOS.</p>
      <div className="cal-sec">
        <p className="cef-label">Coming up</p>
        <div className="cal-preview">
          {data.preview.length ? <ul>{data.preview.map((entry, i) => (
            <li key={i}><span className="t">{entry.title}</span><span className="d">{when(entry)}</span></li>
          ))}</ul> : <p className="cal-preview-empty">Nothing scheduled yet. New events appear as they&apos;re added.</p>}
        </div>
        <PublishStatus status={data.status} />
      </div>
      <p className="cef-hint">Included: event titles, times, places and categories, and task due dates. Not included: notes, who&apos;s attending or assigned, or anything about dues and money.</p>
    </section>
  );
}

/** "Calendar updated by ChaptOS · 3 min ago". Only `current` reads as up to date. */
function PublishStatus({ status }: { status: MemberStatus }) {
  const text = status.state === "current" ? `Calendar updated by ChaptOS · ${ago(status.updatedAt)}`
    : status.state === "publishing" ? `ChaptOS is publishing recent changes · last updated ${ago(status.updatedAt)}`
    : status.state === "retrying" ? `ChaptOS is retrying an update · last updated ${ago(status.updatedAt)}`
    : "ChaptOS hasn't published this calendar yet";
  return <p className={`cal-pub ${status.state}`}><span className="dot" aria-hidden />{text}</p>;
}

/** "Calendar not updating?": the four causes, most likely first given what we know. */
function Troubleshooting({ status, provider, replaced }: { status: MemberStatus; provider: Provider | null; replaced: boolean }) {
  const behind = status.state !== "current";
  return (
    <details className="cal-details" open={behind || replaced ? true : undefined}>
      <summary>Calendar not updating?</summary>
      <ul className="cal-why">
        <li className={behind ? "hit" : ""}>
          <strong>ChaptOS is still publishing.</strong>{" "}
          {status.state === "current" ? `No: the latest changes were published ${ago(status.updatedAt)}.`
            : status.state === "unknown" ? "Nothing has been published yet, so there's nothing for your calendar to show."
            : status.state === "retrying" ? "An update hit a problem and is being retried automatically. Your calendar keeps showing the last published version until it goes through."
            : "Recent changes are being published now. Your calendar picks them up on its next refresh."}
        </li>
        <li>
          <strong>Your calendar app hasn&apos;t refreshed yet.</strong>{" "}
          {provider === "apple"
            ? "Apple Calendar checks on its own schedule. On a Mac, select the calendar and open Get Info to set how often it refreshes."
            : "Google Calendar checks a few times a day, so a change can take up to a day to appear. There's no way to make it refresh sooner."}
        </li>
        <li className={replaced ? "hit" : ""}>
          <strong>Your organization paused or replaced the link.</strong>{" "}
          {replaced ? "Yes: the link you added was replaced. Add the new one above." : "If an admin replaced the link, the old calendar stops updating. Add it again from this page and remove the old one."}
        </li>
        <li>
          <strong>You imported a file instead of subscribing.</strong>{" "}
          If the events went into your main calendar rather than a separate calendar named after your organization, you imported a one-time copy that never updates. Delete those events and follow the steps above.
        </li>
      </ul>
    </details>
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
    <div className="cal-sec tight">
      <label className="block">{label}
        <span className="cal-copy">
          <input ref={input} className="cef-input" readOnly value={value} onFocus={e => e.currentTarget.select()} />
          <button type="button" className="cal-btn" onClick={() => void copy()}>{state === "copied" ? <><Tick />Copied</> : "Copy"}</button>
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
    <div className="cal-sec">
      <p><strong>Google Calendar only adds subscriptions in a computer browser.</strong> Open this page on a computer and sign in to finish there. It will appear in the Google Calendar app on your phone afterwards.</p>
      {/* Setup page, never the feed: this is safe to send to yourself. */}
      <CopyField label="Link to open on your computer" value={handoff} />
      <button type="button" className="sched-link" onClick={() => setComputer(true)}>I&apos;m on a computer, show the steps</button>
    </div>
  );
  return (
    <div className="cal-sec">
      {/* The feed secret travels in this link's query string, so it lands in this
          browser's history. Google receives it anyway once the member subscribes;
          personal links (v3 B1) limit the damage because one can be rotated alone. */}
      <p><a className="cal-btn-primary" href={googleAddUrl(url)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><CalendarIcon />Add to Google Calendar</a></p>
      <p>Google Calendar opens with the link filled in. Check you&apos;re signed in to the Google account you use, then choose <em>Add</em>.</p>
      <p className="cal-muted">Google checks for changes a few times a day, so updates can take up to a day to appear. To see it on your phone, open the Google Calendar app&apos;s settings and make sure the calendar is synced.</p>
      <details className="cal-details">
        <summary>If the button doesn&apos;t work</summary>
        <div className="cal-details-body"><ol className="cal-steps">
          <li><CopyField label="Copy your organization's calendar link" value={url} note={privacyNote} /></li>
          <li>Open <a className="sched-link" href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener noreferrer">Google Calendar&apos;s &ldquo;From URL&rdquo; page</a>. (In Google Calendar: Other calendars → + → From URL.)</li>
          <li>Paste the link into <em>URL of calendar</em> and choose <em>Add calendar</em>.</li>
        </ol></div>
      </details>
    </div>
  );
}

/** Google's add-by-URL screen, prefilled. `cid` takes the webcal form of the feed. */
export const googleAddUrl = (url: string) =>
  `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, "webcal:"))}`;

function AppleSteps({ url, apple }: { url: string; apple: boolean }) {
  return (
    <div className="cal-sec">
      {!apple && <p>Open this on your iPhone, iPad or Mac to add it to Apple Calendar.</p>}
      <p><a className="cal-btn-primary" href={url.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer"><CalendarIcon />Open in Apple Calendar</a></p>
      <p>Calendar asks you to confirm the subscription. Choose <strong>iCloud</strong> as the location (on a Mac) or account (on iPhone) to see it on all your Apple devices.</p>
      <details className="cal-details">
        <summary>If the button doesn&apos;t open Calendar</summary>
        <div className="cal-details-body">
          <CopyField label="Copy your organization's calendar link" value={url} note={privacyNote} />
          <p><strong>Mac:</strong> in Calendar, choose File → New Calendar Subscription, paste the link, then Subscribe.</p>
          <p><strong>iPhone or iPad:</strong> in Calendar, tap Calendars → Add Calendar → Add Subscription Calendar, paste the link, then Subscribe.</p>
        </div>
      </details>
    </div>
  );
}

// ── Admin: turn it on ───────────────────────────────────────────────────────
// One button. It saves the time zone (prefilled from this device when the org
// has none), then asks the worker to build and check the calendar and switch
// it on if the check passes, so the admin doesn't wait around for it. Anything
// that would block it is listed above the button with a fix that works here.

/** `n` is left off when there's only the one row: a lone "1" reads as a checklist with steps missing. */
function Step({ n, done, title, children }: { n?: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="sc-row">
      {n != null && <span aria-hidden className={`cal-step-n${done ? " done" : ""}`}>{done ? <Tick /> : n}</span>}
      <div className="sc-row-lead cal-step-body">
        <p className="sc-row-key">{title}{done && <span className="sr-only"> (done)</span>}</p>
        {children}
      </div>
    </li>
  );
}

function AdminReadiness({ data, busy, change, reload }: {
  data: Subscription; busy: boolean;
  change: (action: string, extra?: Record<string, unknown>) => Promise<boolean>;
  reload: () => Promise<void>;
}) {
  const device = deviceZone();
  // No saved zone yet: start from this device's, which the admin confirms by turning on.
  const [zone, setZone] = useState(data.timeZone ?? (validZone(device) ? device : ""));
  const [editingZone, setEditingZone] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [turnOnFailed, setTurnOnFailed] = useState(false);
  const zones = useMemo(allZones, []);
  const slug = useSlug();
  const href = (path: string) => slug ? `/${slug}${path}` : path;

  // Poll while the worker settles a check; say so if a turn-on didn't take.
  const wasTurningOn = useRef(false);
  useEffect(() => {
    if (data.validating) {
      if (data.turningOn) wasTurningOn.current = true;
      const t = setInterval(() => void reload(), 4000);
      return () => clearInterval(t);
    }
    if (wasTurningOn.current) { wasTurningOn.current = false; setTurnOnFailed(!data.enabled); }
  }, [data.validating, data.turningOn, data.enabled, reload]);

  const issues = data.issues ?? [];
  const blocking = issues.filter(i => i.blocking);
  const unconfirmed = issues.filter(i => i.kind === "time-unconfirmed");
  const notes = issues.filter(i => !i.blocking && i.kind !== "time-unconfirmed");
  const health = data.health;
  const zoneValid = validZone(zone);

  const blockReason = !data.configured ? "Calendar subscriptions aren't set up on this server yet. Ask your ChaptOS administrator."
    : !data.available ? "ChaptOS hasn't opened calendar subscriptions for your organization yet."
    : blocking.length ? `Fix the ${blocking.length === 1 ? "item" : `${blocking.length} items`} above first.`
    : !zoneValid ? "Choose your organization's time zone first."
    : null;

  async function turnOn() {
    setTurnOnFailed(false);
    // Only send the zone when it isn't the saved one: it's what the admin just confirmed.
    if (await change("turnOn", zone !== data.timeZone ? { timeZone: zone } : {})) setEditingZone(false);
  }

  const zoneField = <>
    <label className="block sc-mlabel">Organization time zone
      <input className="sc-input mt-1" list="org-zone-list" value={zone} onChange={e => setZone(e.target.value)} placeholder="Search a city, e.g. New York" />
    </label>
    <datalist id="org-zone-list">{zones.map(z => <option key={z} value={z}>{zoneName(z)}</option>)}</datalist>
    {device && zone !== device && validZone(device) && <p className="sc-note"><button type="button" className="sched-link" onClick={() => setZone(device)}>Use this device&apos;s zone ({zoneName(device)})</button></p>}
  </>;
  const zoneSummary = (
    <p>{zoneName(zone)} <span className="cal-zone">{zone}</span>{!data.timeZone && <span className="sc-note"> · from this device</span>} · <button type="button" className="sched-link" onClick={() => setEditingZone(true)}>Change</button></p>
  );

  return (
    <div className="sc-stack-tight">
      <p role="status" className="cal-status">
        <span className={`sc-pill ${data.enabled ? "sc-pill-ok" : data.turningOn ? "sc-pill-vio" : "sc-pill-muted"}`}>{data.enabled ? "On for members" : data.turningOn ? "Turning on…" : "Off for members"}</span>
        {(data.enabled || health?.failedAt) && <span className={health?.failedAt ? "sc-err" : "sc-note"}>
          {health?.failedAt ? `Publishing calendar updates is failing (${health.failures} attempt${health.failures === 1 ? "" : "s"}); it retries automatically.`
            : health?.pending ? "Calendar updates are waiting to publish."
            : health?.processedAt ? `Calendar updated ${ago(health.processedAt)}.`
            : "Calendar updates haven't been published yet."}
        </span>}
      </p>

      {!data.enabled && <>
        <ol className="sc-card cal-check">
          <Step n={blocking.length ? 1 : undefined} done={Boolean(data.timeZone) && zone === data.timeZone && !editingZone} title="Time zone">
            {editingZone || !zoneValid ? zoneField : zoneSummary}
            <p className="sc-note">Times you add are in this zone. Members see them in their own.</p>
            {editingZone && data.timeZone && <div className="sc-btn-row">
              <button className="sc-btn sc-btn-ghost" disabled={busy || !zoneValid || zone === data.timeZone}
                onClick={async () => { if (await change("timeZone", { timeZone: zone })) setEditingZone(false); }}>Save time zone</button>
              <button className="sc-btn sc-btn-ghost" onClick={() => { setZone(data.timeZone!); setEditingZone(false); }}>Cancel</button>
            </div>}
          </Step>
          {blocking.length > 0 && <Step n={2} done={false} title={`Fix ${blocking.length} item${blocking.length === 1 ? "" : "s"} that would appear wrong or go missing`}>
            <ul className="cal-issues">{blocking.map(issue => <BlockingItem key={`${issue.source}:${issue.id}`} issue={issue} href={href} reload={reload} />)}</ul>
          </Step>}
        </ol>

        {data.turningOn
          ? <p role="status" className="sc-note"><strong className="text-[var(--ink)]">Turning on for members.</strong> ChaptOS is building your calendar and checking every entry. It takes about a minute and switches on by itself, so you can leave this page.</p>
          : <div className="sc-stack-tight">
            <div className="sc-btn-row"><button className="sc-btn sc-btn-primary" disabled={busy || Boolean(blockReason) || Boolean(data.validating)} onClick={() => void turnOn()}>Turn on for members</button></div>
            {data.validating && <p role="status" className="sc-note">A publication check is running. This takes about a minute.</p>}
            {blockReason && <p className="sc-note">{blockReason}</p>}
            {!blockReason && <p className="sc-note">Members can then add {data.orgName || "your organization"}&apos;s events and deadlines to Google or Apple Calendar, and they stay up to date on their own.</p>}
            {turnOnFailed && <p role="alert" className="sc-err">It didn&apos;t turn on: the check found something to fix. Fix any items listed above and try again.</p>}
          </div>}
      </>}

      {data.enabled && <div className="sc-card cal-check"><ul><li className="sc-row"><div className="sc-row-lead cal-step-body">
        <p className="sc-row-key">Time zone</p>
        {editingZone ? <>
          {zoneField}
          <div className="sc-btn-row">
            <button className="sc-btn sc-btn-primary" disabled={busy || !zoneValid || zone === data.timeZone}
              onClick={async () => { if (await change("timeZone", { timeZone: zone })) setEditingZone(false); }}>Save time zone</button>
            <button className="sc-btn sc-btn-ghost" onClick={() => { setZone(data.timeZone ?? ""); setEditingZone(false); }}>Cancel</button>
          </div>
          <p className="sc-note">Changing it doesn&apos;t move existing events or pause the calendar.</p>
        </> : zoneSummary}
      </div></li></ul></div>}

      {unconfirmed.length > 0 && (
        <details className="cal-details prose" open={unconfirmed.length <= 5}>
          <summary><span><strong className="text-[var(--ink)]">{unconfirmed.length} event{unconfirmed.length === 1 ? " shows" : "s show"} as all-day in members&apos; calendars</strong> because the time was typed as text. Set a start and end time to fix it.</span></summary>
          <ul className="sc-card cal-list">{unconfirmed.map(issue => <UnconfirmedTime key={issue.id} issue={issue} onSaved={reload} />)}</ul>
        </details>
      )}

      {notes.length > 0 && (
        <details className="cal-details">
          <summary>{notes.length} other note{notes.length === 1 ? "" : "s"} (left out of the calendar)</summary>
          <ul className="cal-details-body cal-issues">{notes.map(issue => <li key={`${issue.source}:${issue.id}`}><strong className="text-[var(--ink)]">{issue.title}</strong>: {issue.kind === "invalid-due-date" ? "the task's due date isn't a real date." : "the event's date isn't a real date."}</li>)}</ul>
        </details>
      )}

      {data.enabled && <details className="cal-details">
        <summary>Advanced</summary>
        <div className="cal-details-body">
          {!rotate && <div className="sc-btn-row">
            <button className="sc-btn sc-btn-ghost" disabled={busy} onClick={() => setRotate(true)}>Regenerate URL</button>
            <button className="sc-btn sc-btn-ghost" disabled={busy} onClick={() => void change("disable")}>Turn off for members</button>
          </div>}
          <p className="sc-note">Turning off keeps events already in members&apos; calendars but stops updating them.</p>
          {rotate && <div role="alert" className="cal-sec">
            <p className="sc-err">Everyone who subscribed will stop getting updates until they add the new link.</p>
            <div className="sc-btn-row">
              <button className="sc-btn sc-btn-danger" disabled={busy} onClick={async () => { if (await change("rotate")) setRotate(false); }}>Regenerate and revoke old URL</button>
              <button className="sc-btn sc-btn-ghost" onClick={() => setRotate(false)}>Keep current URL</button>
            </div>
          </div>}
        </div>
      </details>}
    </div>
  );
}

/** One blocking item, with the fix that settles it here rather than a trip elsewhere. */
function BlockingItem({ issue, href, reload }: { issue: ScheduleIssue; href: (path: string) => string; reload: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const legacy = issue.kind === "legacy-deadline";
  const open = issue.kind === "unlinked-service" ? href("/service") : issue.kind === "unlinked-party" ? href("/parties") : href(`/timeline?event=${issue.id}`);
  // The feed leaves legacy deadlines out entirely (deadlines come from tasks),
  // so the risk is a deadline members never see, not one they see twice.
  const text = legacy ? "An old deadline entry. Deadlines come from tasks now, so this one isn't in the calendar. Check it has a matching task, then delete it."
    : issue.kind === "unlinked-service" ? "A service project with no timeline entry, so it would be missing from members' calendars."
    : issue.kind === "unlinked-party" ? "A party with no timeline entry. It can't be added automatically because its attendance may belong to an existing event. Open Parties to review it."
    : issue.issue;
  async function remove() {
    setWorking(true); setError("");
    try { await requestJson(`/api/calendar/${issue.id}`, { method: "DELETE" }); await reload(); }
    catch (e) { setError(apiErrorMessage(e, "Could not delete it")); setWorking(false); }
  }
  async function link() {
    // Its own request, not `change`: a refusal belongs next to this item.
    setWorking(true); setError("");
    try {
      await requestJson("/api/calendar/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", source: "service", id: issue.id }) });
      await reload();
    } catch (e) { setError(apiErrorMessage(e, "Could not add it to the timeline")); setWorking(false); }
  }
  return (
    <li className="cal-issue">
      <span className="cal-issue-text">
        <a className="sched-link" href={open}>{issue.title}</a>
        <span className="block sc-note">{text}</span>
        {error && <span role="alert" className="block sc-err">{error}</span>}
      </span>
      <span className="sc-btn-row">
        {legacy && !confirming && <button type="button" className="sc-btn sc-btn-ghost sc-btn-sm" disabled={working} onClick={() => setConfirming(true)}>Delete</button>}
        {legacy && confirming && <>
          <button type="button" className="sc-btn sc-btn-danger sc-btn-sm" disabled={working} onClick={() => void remove()}>Delete entry</button>
          <button type="button" className="sc-btn sc-btn-ghost sc-btn-sm" disabled={working} onClick={() => setConfirming(false)}>Keep</button>
        </>}
        {issue.kind === "unlinked-service" &&
          <button type="button" className="sc-btn sc-btn-accent sc-btn-sm" disabled={working} onClick={() => void link()}>Add to timeline</button>}
      </span>
    </li>
  );
}

// ── Admin: tell members ─────────────────────────────────────────────────────
// Members also see an invite on their dashboard, but a note in the group chat
// is what gets most people to do it. The link opens setup in ChaptOS, behind
// sign-in: it never contains the feed's secret, so it's safe to post anywhere.

function TellMembers({ slug, orgName }: { slug: string; orgName: string }) {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  const box = useRef<HTMLParagraphElement>(null);
  const link = `${window.location.origin}/${slug}/timeline?subscribe=1`;
  const message = `${orgName ? `${orgName}'s` : "Our"} calendar is now in ChaptOS. Add it to Google or Apple Calendar once and every meeting and deadline stays up to date on its own: ${link}`;
  async function copy() {
    try { await navigator.clipboard.writeText(message); setState("copied"); }
    catch {
      setState("failed");
      const range = document.createRange();
      if (box.current) { range.selectNodeContents(box.current); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
    }
  }
  return (
    <div className="sc-card cal-tell">
      <div className="cal-tell-head">
        <p className="sc-row-key">Tell your members</p>
        <p className="sc-note">Paste this into your group chat. Members also get an invite on their dashboard.</p>
      </div>
      <p ref={box} className="cal-tell-msg">{message}</p>
      <div className="sc-btn-row">
        <button type="button" className="sc-btn sc-btn-primary" onClick={() => void copy()}>{state === "copied" ? <><Tick />Copied</> : "Copy message"}</button>
      </div>
      {state === "failed" && <p role="alert" className="sc-err">Couldn&apos;t copy automatically. The message is selected; copy it with Ctrl+C (⌘C on a Mac).</p>}
      {state === "copied" && <span role="status" className="sr-only">Copied</span>}
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
    <li className="sc-row">
      <div className="sc-row-lead cal-step-body">
        <p className="sc-row-key">{issue.title}
          <span className="sc-row-sub block"><span className="cal-zone">{issue.date}</span> · “{issue.time}”</span></p>
        {/* ScheduleFields is built on the dialog's cef-* vocabulary. */}
        {editing && <div className="cef-root cal-step-body">
          <ScheduleFields value={value} onChange={setValue} />
          {error && <p role="alert" className="sc-err">{error}</p>}
          <div className="sc-btn-row">
            <button className="sc-btn sc-btn-primary" disabled={saving} onClick={() => void save()}>Save time</button>
            <button className="sc-btn sc-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>}
      </div>
      {!editing && <button type="button" className="sc-btn sc-btn-accent sc-btn-sm" onClick={() => setEditing(true)}>Set time</button>}
    </li>
  );
}
