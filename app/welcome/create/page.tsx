"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ORG_TYPES, getOrgType, ALWAYS_ON_WORKFLOWS, type WorkflowId, type RoleSeed } from "@/lib/org-types";
import { NAV_WORKFLOW_MAP, NAV_DESCRIPTIONS } from "@/app/components/Sidebar";
import { type Permission } from "@/lib/permissions";
import { DEFAULT_LABELS, type VocabKey } from "@/lib/vocab";
import { suggestSlug } from "@/lib/slug-rules";
import { APP_NAME } from "@/lib/domains";
import { ORG_SLUG_HEADER } from "@/app/lib/api";

// The vocab keys worth surfacing on the blueprint — the words a founder most
// wants to see match their org ("Member", "Meetings", "Period"). The full set
// is editable later in Settings; we keep creation focused on the high-signal
// few. Plurals are derived server-side, so we only collect the singular.
const BLUEPRINT_VOCAB_KEYS: VocabKey[] = ["Member", "Meetings", "Period"];

// One editable role in the blueprint. Seeded from the org-type template's
// RoleSeed; the founder can rename it. `all` marks the founder role (rank 100,
// every permission) — shown but not editable. Permission bundles are displayed
// read-only for now (full per-permission editing lives in Settings → Roles);
// what the founder sends still round-trips faithfully through provisionOrg.
interface BlueprintRole {
  name:        string;
  color:       string;
  rank:        number;
  all:         boolean;
  permissions: Permission[];
}

// Build the initial, editable blueprint state from an org-type template.
function seedBlueprint(orgTypeId: string): {
  workflows: Set<WorkflowId>;
  vocab: Record<string, string>;
  roles: BlueprintRole[];
} {
  const template = getOrgType(orgTypeId);
  const workflows = new Set<WorkflowId>(template ? template.enabledWorkflows : ALWAYS_ON_WORKFLOWS);
  const vocab: Record<string, string> = {};
  for (const key of BLUEPRINT_VOCAB_KEYS) {
    vocab[key] = template?.vocabularyOverrides[key] ?? DEFAULT_LABELS[key];
  }
  const roles: BlueprintRole[] = (template?.roleSeeds ?? []).map((r: RoleSeed) => ({
    name:        r.name,
    color:       r.color,
    rank:        r.rank,
    all:         !!r.all,
    permissions: [...r.permissions],
  }));
  return { workflows, vocab, roles };
}

// The toggleable workflow surfaces, in sidebar order, each with the human label
// and description the onboarding picker used. Excludes always-on surfaces
// (Dashboard/Timeline → operations) — those are shown as a locked note.
const TOGGLEABLE_SURFACES: { label: string; workflow: WorkflowId; description: string }[] =
  Object.entries(NAV_WORKFLOW_MAP)
    .filter(([, wf]) => wf !== null && !ALWAYS_ON_WORKFLOWS.includes(wf as WorkflowId))
    .map(([label, wf]) => ({
      label,
      workflow: wf as WorkflowId,
      description: NAV_DESCRIPTIONS[label] ?? "",
    }));

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// /welcome/create — self-serve org creation.
//
// Form fields (decided in the Milestone-3 plan):
//   1. Organization name
//   2. Slug — auto-suggested from name, live-validated against /api/orgs/slug-check
//   3. Org type — radio cards driven by lib/org-types registry
//   4. Your name — sets the founder's Brother.name (separate from Google name
//      so they're not stuck with a legal name they don't use day-to-day)
//
// On submit: POST /api/orgs. The server sets the active_org cookie and returns
// the org's slug (201 created, or 200 when the account was already linked from a
// prior attempt whose response was lost). We hard-navigate to that server-
// returned slug — or to / as a fallback, which server-resolves the active org
// from the cookie — so ChapterContext remounts under the new org.

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; message: string }
  | { kind: "taken"; suggestions: string[] };

export default function CreateOrgPage() {
  const [orgName, setOrgName]   = useState("");
  const [slug, setSlug]         = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgType, setOrgType]   = useState<string>(ORG_TYPES[0]!.id);
  const [yourName, setYourName] = useState("");

  // Two-step flow: fill in the details, then REVIEW the blueprint (workflows /
  // vocab / roles) before anything is created. The blueprint is provisioned
  // atomically with the org, so the founder confirms exactly what gets built.
  const [step, setStep] = useState<"details" | "blueprint">("details");
  const [bp, setBp] = useState(() => seedBlueprint(ORG_TYPES[0]!.id));
  // Re-seed the blueprint whenever the org type changes while still on the
  // details step (so switching type on step 1 gives the right defaults). Once
  // the founder has advanced to review, we don't clobber their edits.
  useEffect(() => {
    if (step === "details") setBp(seedBlueprint(orgType));
  }, [orgType, step]);

  // Optional logo. We hold the File and an object-URL preview; the upload happens
  // AFTER the org is created (POST /api/orgs/logo against the new org), so the
  // create request stays a plain atomic JSON POST and an abandoned form leaves
  // nothing in storage.
  const [logoFile, setLogoFile]       = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError]     = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the org is created but the (optional) logo upload failed: the org
  // exists and re-submitting would collide, so we stop showing the create button
  // and offer an explicit "continue" instead of navigating away mid-warning.
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  // Revoke the object URL when the preview changes or the component unmounts so
  // we don't leak blob: URLs.
  useEffect(() => {
    if (!logoPreview) return;
    return () => URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please upload an image file (PNG, JPG, SVG, etc.).");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Image must be under 2 MB.");
      return;
    }
    setLogoError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
  }

  // Auto-suggest slug from name until the user types in the slug field directly.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(suggestSlug(orgName));
  }, [orgName, slugTouched]);

  // Debounced live slug check.
  useEffect(() => {
    if (!slug) {
      setSlugState({ kind: "idle" });
      return;
    }
    setSlugState({ kind: "checking" });
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/slug-check?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          // 429 or 500 — surface a soft "try again" but don't block the form.
          setSlugState({ kind: "idle" });
          return;
        }
        const data = await res.json();
        if (data.ok) {
          setSlugState({ kind: "ok" });
        } else if (data.reason === "taken") {
          setSlugState({ kind: "taken", suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] });
        } else {
          setSlugState({ kind: "bad", message: data.message ?? "Invalid slug." });
        }
      } catch {
        setSlugState({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // The proxy gates authentication for this route (unauthenticated users are
  // bounced to /login before they ever reach here), so we only need to handle
  // the already-onboarded case: a signed-in user who ALREADY has an org and hit
  // /welcome/create directly (bookmark, stale link) gets sent to their dashboard.
  // A signed-in founder with no org yet — the intended audience — stays. Note
  // /api/auth/me returns 401 for that founder (session but no Brother row); we
  // simply leave them on the page in that case, NOT redirect.
  //
  // EXCEPTION: ?new=1 means an ALREADY-LINKED user deliberately came to found an
  // ADDITIONAL org (via "Start a new chapter" → OAuth → callback). They have an
  // org, so the guard below would bounce them home — skip it for them. Read from
  // window.location (client-only effect) to avoid a Suspense boundary for
  // useSearchParams.
  useEffect(() => {
    const wantsNew = new URLSearchParams(window.location.search).get("new") === "1";
    if (wantsNew) return; // founding another org on purpose — don't redirect home
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data?.org?.slug) window.location.assign(`/${data.org.slug}`);
        }
      } catch {
        // Network error — leave them on the page; submit will surface any issue.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedType = useMemo(
    () => ORG_TYPES.find(t => t.id === orgType) ?? ORG_TYPES[0]!,
    [orgType],
  );

  // The details step is complete when the required fields validate. Advancing to
  // the blueprint review is gated on this; the actual create is gated on it too.
  const detailsValid =
    orgName.trim().length > 0 &&
    yourName.trim().length > 0 &&
    slugState.kind === "ok";
  const canSubmit = detailsValid && !submitting;

  // Assemble the blueprint payload from the current review state. Sends the
  // singular vocab overrides, the enabled workflow set, and the role seeds
  // (permissions as bare MANAGE_* names — provisionOrg turns them into bits).
  function buildBlueprint() {
    return {
      enabledWorkflows: Array.from(bp.workflows),
      vocabularyOverrides: bp.vocab,
      roleSeeds: bp.roles.map(r => ({
        name:        r.name.trim(),
        rank:        r.rank,
        all:         r.all,
        permissions: r.permissions,
        color:       r.color,
      })),
    };
  }

  // Step 1 → 2: review before creating. Form submit on the details step advances
  // to the blueprint; it does NOT create until the founder confirms on step 2.
  function goToReview(e: React.FormEvent) {
    e.preventDefault();
    if (!detailsValid) return;
    setStep("blueprint");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        orgName.trim(),
          slug:        slug.trim(),
          orgType,
          founderName: yourName.trim(),
          blueprint:   buildBlueprint(),
        }),
      });
      const data = await res.json().catch(() => ({}));

      // 201 = created. 200 = already-linked recovery (a prior POST committed but
      // lost its response): the server resolved the org we already have and set
      // the active_org cookie, so we route the same way either case.
      if (res.status === 201 || (res.status === 200 && data?.ok)) {
        // Navigate to the SERVER's slug (authoritative — it may have normalized
        // what we sent, and on recovery it's the org we already had, not this
        // form's input). New founders go to the page picker first; on the
        // already-linked recovery path (200) the org was created on a PRIOR
        // attempt and is likely already set up, so we send them straight to the
        // dashboard rather than re-running onboarding. When the server didn't
        // return a slug we can't build the onboarding path — fall back to root,
        // which server-resolves the active org from the freshly-set cookie.
        const slug = typeof data?.slug === "string" && data.slug ? data.slug : null;
        const isRecovery = res.status === 200;

        // Upload the logo (if picked) AFTER the org exists. Only on the fresh
        // create path — a recovery means the org was set up earlier and we don't
        // want this form's logo to clobber whatever it already has. A failure
        // here does NOT block entry: the org is already created and the founder
        // can set the logo later in Settings, so we surface a soft warning and
        // still navigate.
        if (slug && logoFile && !isRecovery) {
          const uploaded = await uploadLogo(slug, logoFile);
          if (!uploaded) {
            // Org is created; only the logo failed. Surface the warning and offer
            // an explicit continue (navigating now would unmount before the user
            // sees the message, and re-submitting would collide on the slug).
            setCreatedSlug(slug);
            setServerError("Your organization was created, but the logo couldn't be uploaded. You can continue and add it later in Settings.");
            return;
          }
        }

        // Setup now happens PRE-creation (the blueprint the founder reviewed is
        // what got provisioned atomically), and provisionOrg stamps
        // onboardingCompletedAt at creation — so both fresh creates and recovery
        // land straight in the live workspace. The post-create wizard is retired.
        const dest = slug ? `/${slug}` : "/";
        window.location.assign(dest);
        return;
      }
      setServerError(data?.error ?? "Couldn't create the organization. Try again.");
    } catch {
      setServerError("Couldn't reach the server. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  // Upload the org logo to the just-created org. We send the x-org-slug header
  // explicitly: this page lives at /welcome/create, so the URL's first segment
  // ("welcome") isn't the org slug the API needs — we pass the server-returned
  // slug so buildContext resolves the new org (the founder is now its admin).
  // Returns true on success; false on any failure (caller decides what to do).
  async function uploadLogo(slug: string, file: File): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orgs/logo", {
        method: "POST",
        headers: { [ORG_SLUG_HEADER]: slug },
        body: fd,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return (
    <div className="auth-scope">
      <div className="auth-page">
        <div className="auth-topbar">
          <div className="auth-wordmark">
            <div className="auth-glyph">C</div>
            <div className="auth-wm-txt">{APP_NAME}</div>
          </div>
          <div className="auth-meta">Create</div>
        </div>

        <div className="auth-main">
          <div className="auth-col wide">
            <div className="auth-index">
              {step === "details" ? "New organization" : "Review your blueprint"}
            </div>
            <h1 className="auth-h1">
              {step === "details" ? (
                <>Set up your <em>workspace.</em></>
              ) : (
                <>Here&rsquo;s what we&rsquo;ll <em>build.</em></>
              )}
            </h1>
            <p className="auth-lede">
              {step === "details"
                ? "We’ll make you the first admin. You can change everything later in Settings."
                : "This is exactly what gets created — nothing built until you confirm. Tweak anything now, or fine-tune it later in Settings."}
            </p>

            <form onSubmit={step === "details" ? goToReview : handleSubmit} className="auth-body auth-stack-28">
              {step === "details" && <>
              {/* Organization name */}
              <Field
                htmlFor="org-name"
                label="Organization name"
                hint="The full name shown in the sidebar and on shared pages."
                input={
                  <input
                    id="org-name"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Lambda Phi Epsilon"
                    className="auth-input"
                  />
                }
              />

              {/* Slug */}
              <Field
                htmlFor="org-slug"
                label="Slug"
                hint="Used in URLs. Lowercase letters, numbers, and single hyphens."
                input={
                  <>
                    <input
                      id="org-slug"
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                      placeholder="e.g. lpe"
                      autoCapitalize="off"
                      autoComplete="off"
                      spellCheck={false}
                      className="auth-input mono"
                    />
                    <SlugStatus
                      state={slugState}
                      onPickSuggestion={(s) => {
                        // Treat picking a suggestion as a deliberate user choice:
                        // mark slugTouched so the auto-suggest-from-name effect
                        // doesn't immediately overwrite it.
                        setSlugTouched(true);
                        setSlug(s);
                      }}
                    />
                  </>
                }
              />

              {/* Org type */}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="auth-label" style={{ padding: 0 }}>Organization type</legend>
                <p className="auth-hint">Pick the closest match — it sets which workflows and roles get enabled.</p>
                <div className="auth-radios">
                  {ORG_TYPES.map((t) => (
                    <label key={t.id} className={`auth-radio${t.id === orgType ? " on" : ""}`}>
                      <input
                        type="radio"
                        name="orgType"
                        value={t.id}
                        checked={t.id === orgType}
                        onChange={() => setOrgType(t.id)}
                        className="sr-only"
                      />
                      <span className="auth-dot" aria-hidden />
                      <div>
                        <div className="t">{t.label}</div>
                        <div className="d">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Your name */}
              <Field
                htmlFor="your-name"
                label="Your name"
                hint="Shown to other members. We don't use your Google account name for this."
                input={
                  <input
                    id="your-name"
                    type="text"
                    value={yourName}
                    onChange={(e) => setYourName(e.target.value)}
                    placeholder="e.g. Jordan Lee"
                    className="auth-input"
                  />
                }
              />

              {/* Logo (optional) */}
              <div>
                <span className="auth-label">Logo <span className="auth-footnote">· optional</span></span>
                <p className="auth-hint">Shown in the sidebar and on shared pages. PNG, JPG, or SVG · max 2 MB. You can change it later in Settings.</p>
                <div className="auth-logo-row">
                  <div className="auth-logo-preview" aria-hidden>
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="" />
                    ) : (
                      <span>{initialsFor(orgName)}</span>
                    )}
                  </div>
                  <div className="auth-logo-controls">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFile}
                      className="sr-only"
                      id="org-logo-input"
                    />
                    <label htmlFor="org-logo-input" className="auth-chip">
                      {logoFile ? "Replace image" : "Upload image"}
                    </label>
                    {logoFile && (
                      <button type="button" onClick={clearLogo} className="auth-chip">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {logoError && <p className="auth-status err" role="alert">{logoError}</p>}
              </div>
              </>}

              {step === "blueprint" && (
                <BlueprintReview
                  orgName={orgName.trim() || "Your organization"}
                  typeLabel={selectedType.label}
                  bp={bp}
                  setBp={setBp}
                />
              )}

              {serverError && (
                <div className="auth-alert" role="alert">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  {serverError}
                </div>
              )}

              <div className="auth-stack">
                {createdSlug ? (
                  <button
                    type="button"
                    onClick={() => window.location.assign(`/${createdSlug}`)}
                    className="auth-btn-vio"
                  >
                    Continue to your organization →
                  </button>
                ) : step === "details" ? (
                  <>
                    <button type="submit" disabled={!detailsValid} className="auth-btn-vio">
                      Review setup →
                    </button>
                    <Link href="/welcome" className="auth-link bare" style={{ alignSelf: "flex-start" }}>
                      ← Back
                    </Link>
                  </>
                ) : (
                  <>
                    <button type="submit" disabled={!canSubmit} className="auth-btn-vio">
                      {submitting ? "Creating…" : `Create ${selectedType.label.toLowerCase()}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("details")}
                      className="auth-link bare"
                      style={{ alignSelf: "flex-start", background: "none", border: 0, cursor: "pointer" }}
                    >
                      ← Back to details
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// First letters of up to two words, for the gradient fallback badge before a
// logo is picked. Falls back to "New" when the name is still empty.
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "New";
  return words.slice(0, 2).map(w => w[0]!.toUpperCase()).join("");
}

// Human label for a permission bit (e.g. MANAGE_TREASURY → "Treasury"). Used to
// summarize a role's granted abilities on the blueprint without the full
// per-permission editor (that lives in Settings → Roles).
function permLabel(p: Permission): string {
  return p
    .replace(/^MANAGE_/, "")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// The blueprint review step: an editable summary of exactly what provisionOrg
// will build for the chosen org type. Workflows (toggle), vocabulary (rename the
// high-signal words), and roles (rename; abilities shown read-only). Everything
// here round-trips through the create POST's `blueprint`.
function BlueprintReview({
  orgName,
  typeLabel,
  bp,
  setBp,
}: {
  orgName: string;
  typeLabel: string;
  bp: { workflows: Set<WorkflowId>; vocab: Record<string, string>; roles: BlueprintRole[] };
  setBp: React.Dispatch<React.SetStateAction<{ workflows: Set<WorkflowId>; vocab: Record<string, string>; roles: BlueprintRole[] }>>;
}) {
  function toggleWorkflow(wf: WorkflowId) {
    setBp(prev => {
      const workflows = new Set(prev.workflows);
      if (workflows.has(wf)) workflows.delete(wf);
      else workflows.add(wf);
      return { ...prev, workflows };
    });
  }
  function setVocab(key: string, value: string) {
    setBp(prev => ({ ...prev, vocab: { ...prev.vocab, [key]: value } }));
  }
  function renameRole(i: number, name: string) {
    setBp(prev => {
      const roles = prev.roles.map((r, j) => (j === i ? { ...r, name } : r));
      return { ...prev, roles };
    });
  }

  return (
    <div className="auth-stack-28">
      {/* Pages / workflows */}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="auth-label" style={{ padding: 0 }}>Pages</legend>
        <p className="auth-hint">
          The surfaces {orgName} gets. Dashboard and Timeline are always on — turn the rest on or off to match how you run things.
        </p>
        <div className="auth-radios">
          {TOGGLEABLE_SURFACES.map(s => {
            const on = bp.workflows.has(s.workflow);
            return (
              <label key={s.workflow} className={`auth-radio${on ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleWorkflow(s.workflow)}
                  className="sr-only"
                />
                <span className="auth-dot" aria-hidden />
                <div>
                  <div className="t">{s.label}</div>
                  <div className="d">{s.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Vocabulary */}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="auth-label" style={{ padding: 0 }}>Your words</legend>
        <p className="auth-hint">
          We&rsquo;ll use these everywhere in the app. Plurals are figured out for you.
        </p>
        <div className="auth-stack">
          {BLUEPRINT_VOCAB_KEYS.map(key => (
            <div key={key} className="auth-vocab-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="auth-footnote" style={{ width: 72, flex: "none" }}>{key}</span>
              <input
                type="text"
                value={bp.vocab[key] ?? ""}
                onChange={e => setVocab(key, e.target.value)}
                className="auth-input"
                maxLength={40}
                aria-label={`Word for ${key}`}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/* Roles */}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="auth-label" style={{ padding: 0 }}>Roles</legend>
        <p className="auth-hint">
          The {typeLabel.toLowerCase()}{" "}roles we&rsquo;ll seed. Rename any of them; you can add roles and fine-tune abilities later in Settings.
        </p>
        <div className="auth-stack">
          {bp.roles.map((r, i) => (
            <div key={i} className={`auth-radio${r.all ? " on" : ""}`} style={{ cursor: "default" }}>
              <span className="auth-dot" aria-hidden style={{ background: r.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {r.all ? (
                  <div className="t">{r.name} <span className="auth-footnote">· you · full access</span></div>
                ) : (
                  <input
                    type="text"
                    value={r.name}
                    onChange={e => renameRole(i, e.target.value)}
                    className="auth-input"
                    maxLength={60}
                    aria-label={`Role ${i + 1} name`}
                    style={{ marginBottom: 4 }}
                  />
                )}
                <div className="d">
                  {r.all
                    ? "Every ability — this is your founder role."
                    : r.permissions.length > 0
                      ? "Can manage " + r.permissions.map(permLabel).join(", ").toLowerCase() + "."
                      : "Along for the ride — no admin abilities yet."}
                </div>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  hint,
  input,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  input: React.ReactNode;
}) {
  return (
    <div>
      <label className="auth-label" htmlFor={htmlFor}>{label}</label>
      <p className="auth-hint">{hint}</p>
      {input}
    </div>
  );
}

function SlugStatus({
  state,
  onPickSuggestion,
}: {
  state: SlugState;
  onPickSuggestion: (slug: string) => void;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "checking") {
    return <p className="auth-status muted">Checking availability…</p>;
  }
  if (state.kind === "ok") {
    return <p className="auth-status ok">Available ✓</p>;
  }
  if (state.kind === "taken") {
    return (
      <div className="auth-suggest">
        <span className="auth-status err" role="alert" style={{ marginTop: 0, minHeight: "auto" }}>
          Already taken
        </span>
        {state.suggestions.length > 0 && (
          <>
            <span className="auth-footnote">·&nbsp;Try:</span>
            {state.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onPickSuggestion(s)} className="auth-chip">
                {s}
              </button>
            ))}
          </>
        )}
      </div>
    );
  }
  // "bad"
  return <p className="auth-status err" role="alert">{state.message}</p>;
}
