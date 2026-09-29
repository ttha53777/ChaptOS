"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "../dashboard/primitives";
import { requestJson, apiErrorMessage } from "../../lib/api";
import "./calendar-event-form.css";
import type { ScheduleIssue } from "@/lib/calendar-feed/audit";
import { validZone } from "@/lib/calendar-feed/schedule";
import { ScheduleFields, initialSchedule, parseLegacyTime, scheduleFromValue, type ScheduleValue } from "./ScheduleFields";

type Health = { pending: boolean; failedAt: string | null; processedAt: string | null; failures: number };
type Subscription = {
  enabled: boolean; available: boolean; url: string | null; timeZone: string | null; admin: boolean; validated: boolean;
  // Admin-only below.
  issues?: ScheduleIssue[]; validating?: boolean; configured?: boolean; problem?: string | null; health?: Health;
};

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

const buttonClass = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
const primaryClass = "rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50";

export function CalendarSubscription({ settings = false }: { settings?: boolean }) {
  const [open, setOpen] = useState(settings);
  const [data, setData] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function load() {
    try { setData(await requestJson<Subscription>("/api/calendar/subscription")); }
    catch (e) { setError(apiErrorMessage(e, "Could not load calendar subscription")); }
  }
  useEffect(() => { if (open) void load(); }, [open]);
  async function change(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setCopied(false);
    try {
      await requestJson("/api/calendar/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      await load();
      return true;
    } catch (e) { setError(apiErrorMessage(e, "Could not update calendar subscription")); return false; }
    finally { setBusy(false); }
  }

  const member = data && <>
    {data.url ? <>
      <label className="block">Private subscription URL<input aria-label="Private subscription URL" className="cef-input mt-1" readOnly value={data.url} onFocus={e => e.currentTarget.select()} /></label>
      <button className={buttonClass} onClick={async () => { try { await navigator.clipboard.writeText(data.url!); setCopied(true); } catch { setError("Select the URL above and copy it manually."); } }}>{copied ? "Copied" : "Copy URL"}</button>
      <a className="ml-3 underline" href={data.url.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer">Open in Apple Calendar</a>
    </> : <p>{!data.available ? "Calendar subscriptions aren't available for your organization yet." : "Calendar subscription is off. An organization admin can turn it on in Settings."}</p>}
    <ul className="list-disc space-y-2 pl-5">
      <li><strong>Google Calendar:</strong> on the web, choose Other calendars → + → From URL, then paste the HTTPS URL.</li>
      <li><strong>Apple Calendar:</strong> on Mac, File → New Calendar Subscription. On iPhone, open Calendar → Calendars → Add Calendar → Add Subscription Calendar.</li>
      <li><strong>Outlook:</strong> on the web, Add calendar → Subscribe from web. In classic Outlook for Windows, Add Calendar → From Internet.</li>
    </ul>
    <p>Updates follow your calendar provider’s refresh schedule and may take time. Importing a downloaded file creates a snapshot, not a subscription.</p>
    <p>Anyone with this URL can read the published schedule without signing in. Removing a member does not revoke their copy. Rotating the URL stops future fetches from the old URL; it cannot erase downloaded events.</p>
  </>;

  const content = <div className="cef-root space-y-4 text-sm">
    <p>Subscribe once to show the organization’s events and dated tasks in your calendar. Edit them in ChaptOS.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {!data && !error && <p role="status">Loading subscription…</p>}
    {member}
    {settings && data?.admin && <AdminReadiness data={data} busy={busy} change={change} reload={load} />}
  </div>;
  if (settings) return <section className="space-y-3"><h3 className="sc-h">Calendar subscription</h3>{content}</section>;
  return <><button className="tl-add-btn ghost" onClick={() => setOpen(true)}>Subscribe</button>{open && <Modal tone="dusk" title="Subscribe to calendar" maxWidthClass="max-w-xl" onClose={() => { setOpen(false); setData(null); setCopied(false); }}>{content}</Modal>}</>;
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
  const [slug, setSlug] = useState("");
  useEffect(() => { setSlug(window.location.pathname.split("/")[1] ?? ""); }, []);
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
