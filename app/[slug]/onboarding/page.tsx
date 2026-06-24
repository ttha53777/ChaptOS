"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useChapter } from "../../context/ChapterContext";
import { useOrgPath } from "../../hooks/useOrgPath";
import { requestJson, ORG_SLUG_HEADER, currentOrgSlug } from "../../lib/api";
import { iterSSE } from "../../lib/sse";
import { APP_NAME } from "@/lib/domains";
import { NAV, NAV_WORKFLOW_MAP, NAV_DESCRIPTIONS } from "../../components/Sidebar";
import { ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { WORKFLOW_FEATURES, type DisabledFeatures } from "@/lib/workflow-features";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";
import { THRESHOLD_KEYS, DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

// /[slug]/onboarding — the post-creation "finish setup" page picker.
//
// A founder lands here right after creating their org (the create flow
// redirects to /{slug}/onboarding instead of straight to the dashboard). They
// choose which optional pages the org exposes; Dashboard, Timeline, and Chapter
// are always on and shown as locked. On Continue we PATCH /api/orgs/config with
// the chosen workflow set and hard-navigate into the dashboard.
//
// Visual language matches /welcome/create (the auth-scope design) because this
// is a continuation of that same setup wizard, not a normal in-app page.
//
// The OrgGuard layout (app/[slug]/layout.tsx) already enforces that the viewer
// is a signed-in member of this org, so there's no auth handling here. The PATCH
// is additionally org-admin-gated server-side; a non-admin who reaches this URL
// can toggle the form but the save returns 403 (surfaced as an inline error).

// One picker row per hideable nav surface — i.e. every NAV label whose workflow
// is non-null in NAV_WORKFLOW_MAP. Labels + descriptions explain the surface in
// the org's terms. Derived from NAV so this list can never drift from the
// sidebar's actual surfaces.
interface PickerItem {
  label: string;
  workflow: WorkflowId;
  description: string;
}

const PICKER_ITEMS: PickerItem[] = NAV.flatMap((label) => {
  const workflow = NAV_WORKFLOW_MAP[label];
  if (workflow == null) return []; // always-on surface — not a toggle
  return [{ label, workflow, description: NAV_DESCRIPTIONS[label] ?? "" }];
});

// Always-on surfaces, shown as locked rows so the founder understands what they
// get regardless of their choices. Dashboard/Timeline/Chapter map to null.
const ALWAYS_ON_LABELS = NAV.filter((label) => NAV_WORKFLOW_MAP[label] == null);

const ALWAYS_ON_DESCRIPTIONS: Record<string, string> = {
  Dashboard: "Your org's home — attendance, dues, GPA, and activity at a glance.",
  Timeline:  "A shared calendar for all upcoming events and meetings.",
  Chapter:   "Meeting minutes, agenda, and chapter-wide records.",
};

// The toggleable dashboard widgets (always-on "operations" workflow). The AI step
// recommends which to keep; the rest become disabledFeatures on save.
const DASHBOARD_WIDGETS = WORKFLOW_FEATURES.operations;
const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGETS.map(w => w.id);

// A proposed non-founder role (rank < 100, permissions as a bitfield).
interface RecommendedRole {
  name: string;
  rank: number;
  permissions: number;
  color: string;
}

// Human-readable threshold labels for the review mini-form.
const THRESHOLD_LABELS: Record<keyof Thresholds, string> = {
  attendanceAtRisk: "Attendance — At Risk below (%)",
  attendanceWatch:  "Attendance — Watch below (%)",
  gpaAtRisk:        "GPA — At Risk below",
  gpaWatch:         "GPA — Watch below",
  serviceHoursGoal: "Service hours goal",
};

// Render a role's permission bitfield as a short readable summary for the review
// card (e.g. "Treasury, Events"). "Full access" when every bit is set; "View
// only" when none.
function summarizePermissions(bits: number): string {
  const names = (Object.keys(PERMISSIONS) as Permission[]).filter(p => (bits & PERMISSIONS[p]) !== 0);
  if (names.length === 0) return "View only";
  if (names.length === Object.keys(PERMISSIONS).length) return "Full access";
  // Drop the MANAGE_ prefix and title-case for a friendlier read.
  return names.map(n => n.replace(/^MANAGE_/, "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(", ");
}

// Shape of the validated recommendation returned by /api/ai/recommend-setup.
interface SetupRecommendation {
  enabledWorkflows: string[];
  disabledFeatures: DisabledFeatures;
  vocabularyOverrides: Partial<Record<VocabKey, string>>;
  thresholds: Thresholds;
  roles: RecommendedRole[];
  customMemberFields?: Array<{ id: string; label: string; type: string; showOnRoster: boolean; required: boolean; rosterOrder: number }>;
  rationale: string;
}

// One-tap starter answers shown under the opening question, so the founder can
// begin without a blank box. Tapping a chip sends `seed` as their first message;
// the assistant then proposes a setup. Typing a real answer is always available.
const STARTER_CHIPS: { label: string; seed: string }[] = [
  { label: "Sports team",     seed: "We're a competitive sports team. We track practice attendance and game turnout. No dues or GPA." },
  { label: "Volunteer group", seed: "We're a service/volunteer group. We track volunteer hours and event turnout, and we fundraise. No dues or GPA." },
  { label: "Student club",    seed: "We're a student club with members, regular meetings, dues, and events." },
  { label: "Greek life",      seed: "We're a fraternity/sorority chapter — brothers, chapter meetings, attendance, dues, service hours, and social events." },
  { label: "Honor society",   seed: "We're an academic honor society with members, meetings, attendance, dues, and required service hours." },
  { label: "Performing arts", seed: "We're a performing arts group — members, rehearsals, performance events, dues, and shared scores/scripts. No service hours." },
];

// Sentinel the founder's "Build my setup now" button sends. The setup-chat
// system prompt keys off this exact string to propose immediately instead of
// asking another question. Kept in sync with route.ts's BUILD_NOW.
const BUILD_NOW = "[BUILD_NOW]";

export default function OnboardingPage() {
  const router = useRouter();
  const orgPath = useOrgPath();
  const { currentUser, refreshChapterData } = useChapter();

  const orgName = currentUser?.org?.name ?? "your organization";
  const enabledWorkflows = currentUser?.org?.enabledWorkflows;

  // Toggles start with every optional surface ON — the fullest, safe default
  // for the brief window before /api/auth/me resolves. Once the org's actual
  // preset (from its org-type template) arrives, we adopt it ONCE so the founder
  // starts from their template's sensible selection and trims from there. A ref
  // guard makes the re-seed fire a single time, never clobbering later edits.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PICKER_ITEMS.map((i) => i.workflow)),
  );
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !enabledWorkflows) return;
    seededRef.current = true;
    setSelected(new Set(PICKER_ITEMS.filter((i) => enabledWorkflows.includes(i.workflow)).map((i) => i.workflow)));
  }, [enabledWorkflows]);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ── AI-assisted setup state ───────────────────────────────────────────────
  // The describe step renders only when AI is configured. We learn that from the
  // recommend route (GET probe), since aiEnabled isn't on /me and lib/ai is
  // server-only. null = unknown (probing); false hides the step entirely.
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");          // the in-progress chat input
  const [thinking, setThinking] = useState(false); // a reply is streaming
  const [recError, setRecError] = useState<string | null>(null);
  // Suggested answers for the assistant's latest question (from the setup-chat
  // `choices` event). `multi` lets the founder pick several before sending;
  // `picked` tracks the selection in that mode. Cleared at the start of every send.
  const [choices, setChoices] = useState<string[]>([]);
  const [choicesMulti, setChoicesMulti] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The conversation transcript. The assistant opens with one question.
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Welcome! To get started, what kind of organization is this and what do you want to keep track of?" },
  ]);
  // The assistant's one-line rationale from the proposal — shown in the collapsed
  // review header so the conversation's conclusion stays visible.
  const [rationale, setRationale] = useState<string | null>(null);
  // Auto-scroll the transcript to the newest message while streaming.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  // Which dashboard widgets stay shown (start all-on; the AI step trims).
  const [shownWidgets, setShownWidgets] = useState<Set<string>>(() => new Set(DASHBOARD_WIDGET_IDS));
  // Vocabulary overrides the founder can edit (only keys with a non-default value).
  const [vocab, setVocab] = useState<Partial<Record<VocabKey, string>>>({});
  // Member-status thresholds (start at defaults; the AI step tunes them). Shown
  // as an editable mini-form only after the AI suggests a setup.
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  // Proposed non-founder roles (empty until the AI suggests; founder can remove).
  const [roles, setRoles] = useState<RecommendedRole[]>([]);
  // Proposed custom member fields (empty until the AI suggests; founder can remove).
  const [customMemberFields, setCustomMemberFields] = useState<NonNullable<SetupRecommendation["customMemberFields"]>>([]);
  // True once a recommendation has arrived — gates the review cards.
  const [recommended, setRecommended] = useState(false);
  // Which wizard step the founder is on, once the review begins. The step list
  // is computed below and skips any section with no content, so this index is
  // always clamped into the live set before use.
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await requestJson<{ enabled: boolean }>("/api/ai/setup-chat");
        if (!cancelled) setAiOn(!!res.enabled);
      } catch {
        if (!cancelled) setAiOn(false); // probe failed — behave as AI-off
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the transcript scrolled to the newest message as replies stream in.
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, thinking]);

  // Auto-grow the composer to fit its content. Keyed on `draft` so EVERY path
  // that changes it resizes — typing, a starter chip seeding a multi-line
  // answer, or the post-send reset — not just the onChange handler. useLayout-
  // Effect runs before paint, so the textarea never flashes at the wrong height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Scroll to the review section when a proposal first arrives.
  useEffect(() => {
    if (recommended) setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [recommended]);

  // Pre-seed every config dimension from a validated proposal (shared by the
  // streamed `proposal` event). The founder edits from here.
  function seedFromRecommendation(rec: SetupRecommendation) {
    setSelected(new Set(PICKER_ITEMS.filter(i => rec.enabledWorkflows.includes(i.workflow)).map(i => i.workflow)));
    const hidden = new Set(rec.disabledFeatures.operations ?? []);
    setShownWidgets(new Set(DASHBOARD_WIDGET_IDS.filter(id => !hidden.has(id))));
    setVocab(rec.vocabularyOverrides ?? {});
    setThresholds(rec.thresholds ?? DEFAULT_THRESHOLDS);
    setRoles(rec.roles ?? []);
    setCustomMemberFields(rec.customMemberFields ?? []);
    setRationale(rec.rationale || null);
    setStep(0); // a fresh proposal always restarts the wizard at the first step
    setRecommended(true);
  }

  // Send the founder's message + stream the assistant's reply from setup-chat.
  // `text` defaults to the input draft; a starter chip or a choice pill passes
  // its value in directly. Appends `text` deltas to a live assistant bubble; on
  // a `choices` event surfaces one-tap answers; on a `proposal` event seeds the
  // review cards below. Degrades gracefully on any stream error.
  //
  // The BUILD_NOW sentinel is special: the API needs the literal "[BUILD_NOW]"
  // (the prompt keys off it to propose immediately), but the transcript should
  // show a friendly "Build my setup" bubble — so display and payload diverge.
  async function sendMessage(text: string = draft) {
    const msg = text.trim();
    if (thinking || !msg) return;
    const isBuildNow = msg === BUILD_NOW;
    const displayMsg = isBuildNow ? "Build my setup" : msg;
    // What the transcript shows; what the API receives (carries the sentinel).
    const displayChat = [...chat, { role: "user" as const, content: displayMsg }];
    const payloadChat = [...chat, { role: "user" as const, content: msg }];
    setChat([...displayChat, { role: "assistant" as const, content: "" }]);
    setDraft(""); // the auto-grow effect (keyed on draft) collapses the composer
    setChoices([]); // stale suggestions don't outlive the question they answered
    setPicked(new Set()); // clear any in-progress multi-select selection
    setThinking(true);
    setRecError(null);

    const appendToAssistant = (delta: string) =>
      setChat(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + delta };
        return copy;
      });

    try {
      const res = await fetch("/api/ai/setup-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(currentOrgSlug() ? { [ORG_SLUG_HEADER]: currentOrgSlug()! } : {}) },
        body: JSON.stringify({ messages: payloadChat, orgType: currentUser?.org?.orgType ?? undefined }),
      });
      if (!res.ok || !res.body) throw new Error("stream failed");

      let sawAny = false;
      let nextChoices: string[] = [];
      let nextMulti = false;
      for await (const { event, data: dataStr } of iterSSE(res.body)) {
        const data = JSON.parse(dataStr);
        if (event === "text" && typeof data.delta === "string") {
          sawAny = true;
          appendToAssistant(data.delta);
        } else if (event === "choices" && Array.isArray(data.choices)) {
          nextChoices = data.choices.filter((c: unknown): c is string => typeof c === "string");
          nextMulti = data.multi === true;
        } else if (event === "proposal" && data.recommendation) {
          seedFromRecommendation(data.recommendation as SetupRecommendation);
        }
      }
      // If the assistant said nothing AND gave no proposal, drop the empty bubble.
      if (!sawAny) {
        setChat(prev => prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev);
      }
      setChoices(nextChoices); // surface this question's choices (empty if none)
      setChoicesMulti(nextMulti);
    } catch {
      setChat(prev => prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev);
      setRecError("Couldn't reach the assistant. You can still set things up manually below.");
    } finally {
      setThinking(false);
    }
  }

  // Re-open the conversation to talk to the assistant again after a proposal.
  // Keeps the founder's current picks (they can still continue) but lets them
  // refine by chatting; a new proposal re-seeds everything.
  function restartConversation() {
    setRecommended(false);
    setRecError(null);
  }

  function toggle(workflow: WorkflowId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workflow)) next.delete(workflow);
      else next.add(workflow);
      return next;
    });
  }

  function toggleWidget(id: string) {
    setShownWidgets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);

    // The service force-enables the always-on workflows, so we only need to send
    // the optional picks. We include the always-on ids too for idempotence.
    const chosen = [
      ...ALWAYS_ON_WORKFLOWS,
      ...PICKER_ITEMS.filter((i) => selected.has(i.workflow)).map((i) => i.workflow),
    ];

    // Invert the shown-widget set into disabledFeatures (operations workflow):
    // any registry widget the founder isn't showing is hidden. Mirrors how the
    // settings panel builds this map. Omitted entirely when nothing is hidden.
    const hiddenOps = DASHBOARD_WIDGET_IDS.filter((id) => !shownWidgets.has(id));
    const disabledFeatures: DisabledFeatures = hiddenOps.length ? { operations: hiddenOps } : {};

    // Only send non-empty vocab values for known keys (the server re-sanitizes).
    const vocabularyOverrides: Record<string, string> = {};
    for (const key of VOCAB_KEYS) {
      const val = vocab[key]?.trim();
      if (val) vocabularyOverrides[key] = val;
    }

    try {
      // Config (workflows + widgets + vocab + thresholds) — one atomic PATCH.
      // Thresholds only sent when the AI tuned them (recommended), so a no-AI
      // founder keeps the defaults without an extra write.
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabledWorkflows: chosen,
          disabledFeatures,
          vocabularyOverrides,
          ...(recommended ? { thresholds } : {}),
          ...(recommended && customMemberFields.length > 0 ? { customMemberFields } : {}),
          // Stamp the onboarding-complete marker so the OrgGuard layout stops
          // bouncing the founder back here. Folded into this one PATCH.
          completeOnboarding: true,
        }),
      });

      // Roles — applied via the onboarding-only setup-apply route. Best-effort
      // AFTER config so a role hiccup never blocks entry (mirrors logo upload in
      // create). Only when the AI proposed roles.
      if (recommended && roles.length > 0) {
        try {
          await requestJson("/api/orgs/setup-apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles }),
          });
        } catch {
          // Soft warning — config already saved; the founder can set roles in
          // Settings. Don't block dashboard entry.
          setServerError("Your setup was saved, but tailored roles couldn't be applied — you can adjust them in Settings → Roles.");
        }
      }

      // Refresh the cached /me so the sidebar picks up the new workflow set
      // immediately, then navigate into the dashboard.
      await refreshChapterData().catch(() => undefined);
      router.push(orgPath("/"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setServerError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can set this up. Ask an admin to finish setup."
          : "Couldn't save your choices. Try again.",
      );
      setSubmitting(false);
    }
  }

  function removeRole(idx: number) {
    setRoles((prev) => prev.filter((_, i) => i !== idx));
  }

  function removeCustomField(idx: number) {
    setCustomMemberFields((prev) => prev.filter((_, i) => i !== idx));
  }

  // Show the editable form (pages/widgets/labels/roles/thresholds + Continue) once
  // the AI has proposed a setup — OR immediately when AI is off, where there's no
  // conversation and the founder picks manually (today's fallback behavior). While
  // AI is on and still interviewing, the form stays hidden so the chat is the focus.
  const showForm = recommended || !aiOn;

  // ── Wizard steps ──────────────────────────────────────────────────────────
  // The review is paced into a few short steps instead of one long scroll. Each
  // step declares whether it has any content; empty ones are dropped so the
  // count stays honest (a no-AI founder only sees Pages + Finish; a founder with
  // no proposed roles never sees an empty Roles step). The last present step
  // carries the Continue button.
  const hasVocab = Object.keys(vocab).length > 0;
  const hasRoles = recommended && roles.length > 0;
  const hasFields = recommended && customMemberFields.length > 0;

  interface WizardStep { key: string; title: string; render: () => ReactNode; }
  const STEPS: WizardStep[] = [
    { key: "pages", title: "Pages", render: renderPagesStep },
    // Dashboard widgets are only tunable when the AI proposed a starting set;
    // labels only when it suggested overrides. Skip the whole step otherwise.
    ...(recommended || hasVocab
      ? [{ key: "dashboard", title: "Dashboard & labels", render: renderDashboardStep }]
      : []),
    ...(hasRoles || hasFields
      ? [{ key: "roles", title: "Roles & fields", render: renderRolesStep }]
      : []),
    // Thresholds only meaningful once the AI tuned them; always paired with the
    // finish button. When AI is off this collapses into the Pages step's finish.
    ...(recommended
      ? [{ key: "cutoffs", title: "Cutoffs", render: renderCutoffsStep }]
      : []),
  ];
  const stepCount = STEPS.length;
  const activeStep = Math.min(step, stepCount - 1);
  const isLastStep = activeStep === stepCount - 1;

  // ── Step renderers ────────────────────────────────────────────────────────
  // Each returns the section JSX for one wizard step. Kept as hoisted function
  // declarations so the STEPS array above can reference them before definition.

  function renderPagesStep() {
    return (
      <div className="auth-stack-28">
        {/* Locked, always-on surfaces */}
        <div>
          <p className="auth-label" style={{ padding: 0 }}>Always included</p>
          <p className="auth-hint">Every organization gets these.</p>
          <div className="auth-radios">
            {ALWAYS_ON_LABELS.map((label) => (
              <div key={label} className="auth-radio on" style={{ cursor: "default", opacity: 0.85 }}>
                <span className="auth-dot" aria-hidden />
                <div>
                  <div className="t">{label}</div>
                  {ALWAYS_ON_DESCRIPTIONS[label] && <div className="d">{ALWAYS_ON_DESCRIPTIONS[label]}</div>}
                </div>
                <span
                  aria-hidden
                  style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "var(--ink-32)", textTransform: "uppercase", letterSpacing: ".1em" }}
                >
                  Locked
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Toggleable pages */}
        <fieldset style={{ border: 0, padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)", paddingTop: 20 }}>
          <legend className="auth-label" style={{ padding: 0 }}>Optional pages</legend>
          <p className="auth-hint">Toggle the ones you want. Unselected pages are hidden from the sidebar.</p>
          <div className="auth-radios">
            {PICKER_ITEMS.map((item) => {
              const on = selected.has(item.workflow);
              return (
                <label key={item.workflow} className={`auth-radio${on ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(item.workflow)}
                    className="sr-only"
                  />
                  <span className="auth-dot" aria-hidden />
                  <div>
                    <div className="t">{item.label}</div>
                    <div className="d">{item.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    );
  }

  function renderDashboardStep() {
    return (
      <div className="auth-stack-28">
        {/* Dashboard widgets — only when the AI proposed a starting set. */}
        {recommended && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="auth-label" style={{ padding: 0 }}>Dashboard widgets</legend>
            <p className="auth-hint">Pick what shows on your dashboard home. You can change these later in Settings.</p>
            <div className="auth-radios">
              {DASHBOARD_WIDGETS.map((w) => {
                const on = shownWidgets.has(w.id);
                return (
                  <label key={w.id} className={`auth-radio${on ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleWidget(w.id)}
                      className="sr-only"
                    />
                    <span className="auth-dot" aria-hidden />
                    <div>
                      <div className="t">{w.label}</div>
                      {w.description && <div className="d">{w.description}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Vocabulary — only shown when the AI suggested label overrides, so a
            no-AI founder isn't faced with 12 empty label fields. */}
        {hasVocab && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, borderTop: recommended ? "1px solid var(--line-soft)" : 0, paddingTop: recommended ? 20 : 0 }}>
            <legend className="auth-label" style={{ padding: 0 }}>Labels</legend>
            <p className="auth-hint">We suggested wording that fits your organization. Edit or clear any of these.</p>
            <div className="auth-stack-28">
              {VOCAB_KEYS.filter((k) => k in vocab).map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="auth-footnote" style={{ minWidth: 110 }}>
                    {DEFAULT_LABELS[key]} →
                  </span>
                  <input
                    type="text"
                    value={vocab[key] ?? ""}
                    maxLength={40}
                    onChange={(e) => setVocab((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={DEFAULT_LABELS[key]}
                    className="auth-input"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  function renderRolesStep() {
    return (
      <div className="auth-stack-28">
        {/* Roles — shown after the AI proposes a set. Replaces the default
            President/Treasurer roles; the founder keeps full admin. */}
        {hasRoles && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="auth-label" style={{ padding: 0 }}>Roles</legend>
            <p className="auth-hint">Suggested officer roles for your organization. You stay an admin with full access. Remove any you don&rsquo;t need — you can fine-tune them later in Settings.</p>
            <div className="auth-radios">
              {roles.map((r, idx) => (
                <div key={`${r.name}-${idx}`} className="auth-radio on" style={{ cursor: "default" }}>
                  <span className="auth-dot" aria-hidden style={{ background: r.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div className="d" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summarizePermissions(r.permissions)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRole(idx)}
                    className="auth-chip"
                    style={{ marginLeft: "auto", alignSelf: "center" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {/* Custom member fields — shown after the AI proposes them. */}
        {hasFields && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, borderTop: hasRoles ? "1px solid var(--line-soft)" : 0, paddingTop: hasRoles ? 20 : 0 }}>
            <legend className="auth-label" style={{ padding: 0 }}>Member fields</legend>
            <p className="auth-hint">Extra per-member data fields for your roster. Remove any you don&rsquo;t need — you can add or edit them later in Settings → Member fields.</p>
            <div className="auth-radios">
              {customMemberFields.map((f, idx) => (
                <div key={f.id} className="auth-radio on" style={{ cursor: "default" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</div>
                    <div className="d" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.type}{f.showOnRoster ? " · roster column" : ""}{f.required ? " · required" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomField(idx)}
                    className="auth-chip"
                    style={{ marginLeft: "auto", alignSelf: "center" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  function renderCutoffsStep() {
    return (
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="auth-label" style={{ padding: 0 }}>Member status cutoffs</legend>
        <p className="auth-hint">When a member is flagged Watch or At Risk. Tuned to your organization — adjust if needed.</p>
        <div className="auth-stack-28">
          {THRESHOLD_KEYS.map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="auth-footnote" style={{ minWidth: 200 }}>{THRESHOLD_LABELS[key]}</span>
              <input
                type="number"
                value={thresholds[key]}
                step={key.startsWith("gpa") ? 0.1 : 1}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setThresholds((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
                }}
                className="auth-input"
                style={{ maxWidth: 120 }}
              />
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Set up</div>
        </div>

        <div className="auth-main">
          <div className="auth-col wide">
            <div className="auth-index">{showForm ? "Review your setup" : "Let's get started"}</div>
            <h1 className="auth-h1">
              {aiOn && !recommended
                ? <>Tell me about <em>{orgName}.</em></>
                : <>Your <em>setup.</em></>}
            </h1>
            <p className="auth-lede">
              {aiOn && !recommended
                ? <>Tell me a bit about how {orgName} runs and I&rsquo;ll tailor its pages, dashboard, labels, roles, and cutoffs. You can change everything before you finish.</>
                : <>Review what&rsquo;s set up for <strong>{orgName}</strong> and adjust anything. You can change it all later in Settings.</>}
            </p>

            <div className="auth-body auth-stack-28">
              {/* ── Interview state ── Conversation-first: the chat is the whole
                  screen until the assistant proposes a setup. Only when AI is on. */}
              {aiOn && !recommended && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Transcript — messages float on the paper. The assistant speaks
                      in the brand serif (the interviewer's voice); the founder's
                      answers are clean sans bubbles. */}
                  <div className="chat-transcript">
                    {chat.map((m, i) => {
                      const isThinking = !m.content && thinking && i === chat.length - 1;
                      return (
                        <div key={i} className={`chat-msg ${m.role === "user" ? "from-user" : "from-ai"}`}>
                          {m.content || (isThinking
                            ? <span className="thinking-dots"><span /><span /><span /></span>
                            : "")}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Starter suggestions — quiet inline prompts, only at the opening
                      turn. Tapping one seeds the composer (doesn't auto-send), so the
                      founder can edit before sending. */}
                  {chat.length === 1 && !thinking && (
                    <div className="starter-row">
                      <span className="label">Try</span>
                      {STARTER_CHIPS.map((c) => (
                        <button key={c.label} type="button" className="starter" onClick={() => { setDraft(c.seed); inputRef.current?.focus(); }}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Suggested answers for the assistant's latest question. Pick-one
                      questions send on tap; pick-many questions let the founder
                      toggle several pills then hit Done. The composer stays open for
                      a free-typed answer in either mode. */}
                  {choices.length > 0 && !thinking && (
                    choicesMulti ? (
                      <div className="starter-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {choices.map((c) => {
                            const on = picked.has(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                className={`starter${on ? " on" : ""}`}
                                aria-pressed={on}
                                onClick={() => setPicked(prev => {
                                  const next = new Set(prev);
                                  if (next.has(c)) next.delete(c); else next.add(c);
                                  return next;
                                })}
                              >
                                {on ? "✓ " : ""}{c}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="auth-btn-vio"
                          style={{ width: "auto", padding: "8px 18px", fontSize: 13 }}
                          disabled={picked.size === 0}
                          onClick={() => void sendMessage(choices.filter(c => picked.has(c)).join(", "))}
                        >
                          Done{picked.size > 0 ? ` (${picked.size})` : ""}
                        </button>
                      </div>
                    ) : (
                      <div className="starter-row">
                        {choices.map((c) => (
                          <button key={c} type="button" className="starter" onClick={() => void sendMessage(c)}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )
                  )}

                  {/* Composer — one unified surface: textarea + send inside a single
                      focusable pill. The auto-grow effect (keyed on draft) sizes it. */}
                  <div className="composer">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                      maxLength={800}
                      disabled={thinking}
                      placeholder="Type your answer…"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="composer-send"
                      onClick={() => void sendMessage()}
                      disabled={thinking || !draft.trim()}
                      aria-label="Send"
                    >
                      {thinking
                        ? <span className="thinking-dots"><span /><span /><span /></span>
                        : (
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="M10 16V4M10 4l-5 5M10 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                    </button>
                  </div>
                  {/* Skip-ahead: once the founder has answered at least once, they
                      can build from what's known so far instead of answering more. */}
                  {chat.length > 1 && !thinking && (
                    <button
                      type="button"
                      className="auth-link"
                      style={{ alignSelf: "center", marginTop: 2 }}
                      onClick={() => void sendMessage(BUILD_NOW)}
                    >
                      Build my setup now →
                    </button>
                  )}
                  {recError && (
                    <p className="auth-status err" role="alert" style={{ marginTop: 2 }}>{recError}</p>
                  )}
                </div>
              )}

              {/* ── Review header ── After a proposal: the conversation collapses to
                  its rationale, with a way back into the chat. */}
              {aiOn && recommended && (
                <div ref={reviewRef} className="auth-radio on" style={{ cursor: "default", alignItems: "flex-start", animation: "review-rise 0.5s cubic-bezier(.16,1,.3,1) both" }}>
                  <span className="auth-dot" aria-hidden style={{ background: "var(--ok)" }} />
                  <div style={{ flex: 1 }}>
                    <div className="t">Here&rsquo;s your starting setup</div>
                    {rationale && <div className="d">{rationale}</div>}
                  </div>
                  <button type="button" className="auth-chip" style={{ alignSelf: "center" }} onClick={restartConversation}>
                    Talk again
                  </button>
                </div>
              )}

              {/* The editable form — hidden during the AI interview, shown after a
                  proposal (or immediately when AI is off). Paced into short steps;
                  each renders one section. The last step carries Continue. */}
              {showForm && (
                <div style={{ animation: recommended ? "review-rise 0.55s cubic-bezier(.16,1,.3,1) both" : undefined, animationDelay: recommended ? "80ms" : undefined }}>
                  {/* Stepper header — a quiet "Step N of M" with the section title.
                      Only shown when there's more than one step (a no-AI founder
                      with a single Pages step sees no chrome). */}
                  {stepCount > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                      <span className="auth-footnote">Step {activeStep + 1} of {stepCount} · {STEPS[activeStep]!.title}</span>
                      <div style={{ display: "flex", gap: 6 }} aria-hidden>
                        {STEPS.map((s, i) => (
                          <span
                            key={s.key}
                            style={{
                              width: i === activeStep ? 18 : 6,
                              height: 6,
                              borderRadius: 3,
                              background: i <= activeStep ? "var(--vio, #a78bfa)" : "var(--line-soft)",
                              transition: "width .2s ease, background .2s ease",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active step body. Keyed on the step so each entry re-animates. */}
                  <div key={STEPS[activeStep]!.key} style={{ animation: "review-rise 0.4s cubic-bezier(.16,1,.3,1) both" }}>
                    {STEPS[activeStep]!.render()}
                  </div>

                  {serverError && (
                    <div className="auth-alert" role="alert" style={{ marginTop: 20 }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                      </svg>
                      {serverError}
                    </div>
                  )}

                  {/* Step navigation — Back (after the first step) + Next/Continue.
                      The last step's primary button finishes setup. */}
                  <div className="auth-stack" style={{ marginTop: 24, display: "flex", flexDirection: "row", gap: 12, alignItems: "center" }}>
                    {activeStep > 0 && (
                      <button
                        type="button"
                        className="auth-btn"
                        style={{ flex: "0 0 auto", width: "auto", padding: "0 22px" }}
                        onClick={() => setStep(Math.max(0, activeStep - 1))}
                        disabled={submitting}
                      >
                        Back
                      </button>
                    )}
                    {isLastStep ? (
                      <button
                        type="button"
                        onClick={handleContinue}
                        disabled={submitting}
                        className="auth-btn-vio"
                        style={{ flex: 1 }}
                      >
                        {submitting ? "Saving…" : "Continue to dashboard"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStep(Math.min(stepCount - 1, activeStep + 1))}
                        className="auth-btn-vio"
                        style={{ flex: 1 }}
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
