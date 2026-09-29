"use client";
import { useEffect, useState } from "react";
import { Modal } from "../dashboard/primitives";
import { requestJson, apiErrorMessage } from "../../lib/api";
import "./calendar-event-form.css";
import type { ScheduleIssue } from "@/lib/calendar-feed/audit";

type Subscription = { enabled: boolean; available: boolean; url: string | null; timeZone: string | null; admin: boolean; validated: boolean; issues?: ScheduleIssue[]; health?: { pending: boolean; failedAt: string | null; processedAt: string | null; failures: number } };
export function CalendarSubscription({ settings = false }: { settings?: boolean }) {
  const [open, setOpen] = useState(settings);
  const [data, setData] = useState<Subscription | null>(null);
  const [zone, setZone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotate, setRotate] = useState(false);
  async function load() {
    try { const next = await requestJson<Subscription>("/api/calendar/subscription"); setData(next); setZone(next.timeZone ?? ""); }
    catch (e) { setError(apiErrorMessage(e, "Could not load calendar subscription")); }
  }
  useEffect(() => { if (open) void load(); }, [open]);
  async function change(action: string) {
    setBusy(true); setError(""); setCopied(false);
    try {
      await requestJson("/api/calendar/subscription", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "timeZone" ? { timeZone: zone } : {}) }) });
      setRotate(false); await load();
    } catch (e) { setError(apiErrorMessage(e, "Could not update calendar subscription")); }
    finally { setBusy(false); }
  }
  const buttonClass = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
  const content = <div className="cef-root space-y-4 text-sm">
    <p>Subscribe once to show the organization’s events and dated tasks in your calendar. Edit them in ChaptOS.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {!data && !error && <p role="status">Loading subscription…</p>}
    {data && <>
      {data.url ? <>
        <label className="block">Private subscription URL<input aria-label="Private subscription URL" className="cef-input mt-1" readOnly value={data.url} onFocus={e => e.currentTarget.select()} /></label>
        <button className={buttonClass} onClick={async () => { try { await navigator.clipboard.writeText(data.url!); setCopied(true); } catch { setError("Select the URL above and copy it manually."); } }}>{copied ? "Copied" : "Copy URL"}</button>
        <a className="ml-3 underline" href={data.url.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer">Open in Apple Calendar</a>
      </> : <p>{!data.available ? "Calendar subscriptions are awaiting rollout validation." : "Calendar subscription is disabled. An organization admin can enable it in Settings."}</p>}
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Google Calendar:</strong> on the web, choose Other calendars → + → From URL, then paste the HTTPS URL.</li>
        <li><strong>Apple Calendar:</strong> on Mac, File → New Calendar Subscription. On iPhone, open Calendar → Calendars → Add Calendar → Add Subscription Calendar.</li>
        <li><strong>Outlook:</strong> on the web, Add calendar → Subscribe from web. In classic Outlook for Windows, Add Calendar → From Internet.</li>
      </ul>
      <p>Updates follow your calendar provider’s refresh schedule and may take time. Importing a downloaded file creates a snapshot, not a subscription.</p>
      <p>Anyone with this URL can read the published schedule without signing in. Removing a member does not revoke their copy. Rotating the URL stops future fetches from the old URL; it cannot erase downloaded events.</p>
      {settings && data.admin && <div className="space-y-3 border-t pt-4">
        <label className="block">Organization time zone<input className="cef-input mt-1" value={zone} onChange={e => setZone(e.target.value)} placeholder="America/New_York" /></label>
        <button className={buttonClass} disabled={busy || !zone || zone === data.timeZone} onClick={() => void change("timeZone")}>Confirm time zone</button>
        <p>Changing the zone pauses the feed until its schedule audit is repeated. Existing timed events keep their recorded source zone.</p>
        <div className="flex flex-wrap gap-4">
          <button className={buttonClass} disabled={busy || (!data.enabled && (!data.available || !data.validated))} onClick={() => void change(data.enabled ? "disable" : "enable")}>{data.enabled ? "Disable subscription" : "Enable subscription"}</button>
          <button className={buttonClass} disabled={busy} onClick={() => setRotate(true)}>Regenerate URL</button>
        </div>
        {rotate && <div role="alert" className="space-y-2"><p>Everyone subscribed must replace their old URL after regeneration.</p><button className={buttonClass} disabled={busy} onClick={() => void change("rotate")}>Regenerate and revoke old URL</button><button className={`${buttonClass} ml-4`} onClick={() => setRotate(false)}>Keep current URL</button></div>}
        <p role="status">{data.health?.failedAt ? "Projection needs attention; operator retry is pending." : data.health?.pending ? "Schedule changes are waiting to be published." : "Schedule projection is up to date."}</p>
        <details><summary>Schedule cleanup ({data.issues?.length ?? 0})</summary>
          <ul className="mt-2 space-y-2">{data.issues?.map(issue => <li key={`${issue.source}:${issue.id}`}><strong>{issue.title}</strong> ({issue.source} #{issue.id}): {issue.issue}{issue.blocking ? " — Blocks launch" : ""}</li>)}</ul>
        </details>
      </div>}
    </>}
  </div>;
  if (settings) return <section className="space-y-3"><h3 className="sc-h">Calendar subscription</h3>{content}</section>;
  return <><button className="tl-add-btn ghost" onClick={() => setOpen(true)}>Subscribe</button>{open && <Modal tone="dusk" title="Subscribe to calendar" maxWidthClass="max-w-xl" onClose={() => { setOpen(false); setData(null); setCopied(false); }}>{content}</Modal>}</>;
}
