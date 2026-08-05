# Settings UX audit — source of truth

Everything in this document was extracted from the code on `main` (2026-08-04). Scope is
[app/[slug]/settings/page.tsx](../app/[slug]/settings/page.tsx), all 13 files in
[app/[slug]/settings/sections/](../app/[slug]/settings/sections/), and
[app/[slug]/settings/settings-ledger.css](../app/[slug]/settings/settings-ledger.css). Every finding
is anchored to a file so nothing here is asserted without a basis in the product.

Findings carry stable ids (`A1`, `C5`, …) — reference them in PRs rather than restating the problem.

**One framing note up front.** The Settings shell is well-built: the dusk "Chapter Ledger" system is
coherent, the intent-based grouping is a genuinely good IA idea, and the trickier state handling
(draft re-sync keyed on persisted content, sparse nav-order materialisation, the `colorTouched` flag)
is careful work with the reasoning written down. The failures are almost entirely **seams** — the
sections were converted to the shared `.sc-*` layer piecemeal, so the page now carries three
destructive-confirm patterns, two toast systems, three checkbox treatments, and a handful of controls
that were built, wired, and then never connected to anything.

---

## 0. Status

Tiers 1–3 were implemented on 2026-08-04. Tiers 4–6 are recorded but deferred.

| Tier | Theme | Status |
|---|---|---|
| 1 | Broken or dead affordances | **Fixed** — A1, A3, A4, A8 |
| 2 | Feedback, state & data safety | **Fixed** — C1, C2, C3, C4, C5, C6, C8 |
| 3 | Accessibility floor | **Fixed** — E2, E3, E4, E6, E7, E9 |
| 4 | Findability / IA | Deferred — B1–B8 |
| 5 | Missing capability | Deferred — A2, A5, A6, A7 |
| 6 | Copy & consistency | Deferred — C7, C9, C10, C11, D1–D9, E5, E10, E11, F1–F6 |

The highest-value deferred item is **B1** (put navigation state in the URL): it fixes browser Back,
refresh, and link-sharing in a single change, and every other findability fix is easier afterwards.

---

## A. Broken or dead affordances

The control is present and does not do what it says.

### A1 — Keyboard users cannot upload an organization logo · `fixed`

[GeneralSection.tsx](../app/[slug]/settings/sections/GeneralSection.tsx) — the file input carried
Tailwind `hidden` (`display:none`), which removes it from the focus order entirely, and the visible
control was a `<label htmlFor>` styled as a button with no `tabIndex`, no `role`, and no key handler.
There was no keyboard path to the control at all, on the most-used setting on the page.

**Fixed:** the visible control is now a real `<button type="button">` that forwards to the input via
ref; the input is a `sr-only`-style trigger. The error message is wired through `aria-describedby`
and announces via `role="alert"`.

### A2 — "Chapter name" is advertised and does not exist · `deferred`

The nav blurb and lede for General both lead with *"Chapter name, icon, data controls…"*
([page.tsx](../app/[slug]/settings/page.tsx)). The section renders the org name as static text.
`PATCH /api/orgs/config` accepts `enabledWorkflows`, `vocabularyOverrides`, `thresholds`,
`disabledFeatures`, `customMemberFields`, `navOrder` — **no `name`**. There is no way to rename an
organization anywhere in the product.

Fixing this needs a new service function, a `name` field on `updateOrgConfigInput`, and a decision
about whether the slug follows the name (it shouldn't — slugs are load-bearing in URLs and
`RESERVED_SEGMENTS`).

### A3 — "Export report" printed the settings page · `fixed`

`window.print()` under a "Data" heading beside "Refresh from database", so it read as a data export;
its icon was a *person* glyph.

The real exports live on their own pages — the treasury CSV at
[app/api/transactions/export/route.ts](../app/api/transactions/export/route.ts) and the roster CSV
client-side in [app/[slug]/brothers/page.tsx](../app/[slug]/brothers/page.tsx). Neither is an
org-wide report, and neither belongs behind a General settings button.

**Fixed** by making the control honest: relabelled **"Print this page"** with a printer icon, and the
surrounding copy no longer promises "export a printable report". If an org-wide report is ever wanted
it should be built deliberately; if not, this button is a candidate for removal.

### A4 — Quick actions ignored which workflows the org enabled · `fixed`

`igEnabled` was computed and never referenced, so "Add IG task" rendered for orgs that had turned
Instagram off two screens away in Workflows; "Log revenue" had the same problem with Parties.
(`brotherNames`, `activeSemester`, and `handleSemesterError` were likewise computed and unused — the
gating was clearly intended and then dropped.)

**Fixed:** both actions are gated on `isNavVisible()`, the dead locals are gone, and "Log attendance"
is relabelled to match where it actually navigates (see D5).

### A5 — Member field type "Select" has no options editor · `deferred`

[MemberFieldsSection.tsx](../app/[slug]/settings/sections/MemberFieldsSection.tsx) offers Label /
Type / Placeholder / Roster / Required. Choosing **Select** produces a dropdown field with no way to
define its choices — `options` stays `undefined` from `blankField()` and no UI ever sets it.

Either build the options editor or remove `select` from `FIELD_TYPES` until it exists.

### A6 — Semesters cannot be edited or deleted · `deferred`

[SemestersSection.tsx](../app/[slug]/settings/sections/SemestersSection.tsx) renders label, dates,
and a "Set active" button. A typo in a label or an end date is permanent from this screen — *even
though* `updateSemester()` in
[lib/services/semester-service.ts](../lib/services/semester-service.ts) already supports label and
both dates and is exposed on `PATCH /api/semesters/[id]`, used today only by the SemesterGate's
"extend current" action. The capability exists and is simply not surfaced.

### A7 — Creating a semester force-activates it · `deferred`

The only creation path is "Create & activate". You cannot set up next term in advance without
yanking the current reporting period out from under everyone's dashboard.

### A8 — Permission-gated sections left headed, empty blocks · `fixed`

The group page rendered `.set-block` (icon, title, lede) unconditionally, while `RolesSection` and
`InvitationsSection` both `return null` on a permission mismatch — producing a section heading and
lede above nothing.

This was latent rather than live (`isVisible` and the sections' internal guards read the same
permission bits, so they only diverge on a mid-session permission change). **Fixed** structurally
rather than by plumbing a new prop: one `:has()` rule in the stylesheet collapses a block whose
section body renders empty.

---

## B. Information architecture & findability · all `deferred`

### B1 — Nothing in Settings has a URL

`dest` is React state; the `?section=` deep link is consumed once and then stripped from history. So:
no page is linkable or bookmarkable, browser Back exits Settings entirely rather than returning to
the Index, and a refresh always dumps you at the Index. You cannot send a teammate "the thresholds
screen."

**This is the highest-value remaining fix.** Moving `dest` into the path or a persistent query param
resolves Back, refresh, and sharing at once, and makes B2/B5 much easier.

### B2 — Two-level IA, only one level navigable

The rail lists the four intent groups; individual sections are reachable *only* from the Index or the
filter. On the Operations page you scroll five stacked sections (Thresholds, Semesters, Custom
metrics, Event types, Workflows) with no in-page table of contents, no sticky sub-nav, and no
indication of which one you're in.

### B3 — The two destructive zones are split and mis-filed

"Delete this organization" is the last element of **General** (Identity); "Leave organization" is the
last element of **Accounts** (Membership). Neither appears in any nav label, blurb, or lede — so
neither is findable by browsing *or* by search.

### B4 — The filter only matches `label` + `blurb`

Searching *logo*, *delete*, *rename*, *leave*, *color*, *email*, *password*, or *notification*
returns "No settings match" — several of those settings exist on the page. A keyword list per nav
item would fix this cheaply.

### B5 — Selecting a search result destroys the search

`selectSection()` clears `filter`, so you cannot check a second result. Matches are also not
highlighted.

### B6 — Index tints imply a taxonomy that doesn't exist

Icon chips are gold for Thresholds/Workflows/Billing, sage for Semesters/Custom metrics/Event types,
violet for everything else — with no legend and no correlation to group, risk, or state. Decorative
color reading as semantic.

### B7 — Two adjacent hamburgers on mobile

App menu and settings sections sit side by side at the same size in the same treatment, and the
second uses the identical 4-square glyph as the "Index" nav item — so one icon means two things.

### B8 — Settings is a modal context at desktop

The app sidebar is `lg:hidden` on this route; the only exit is a 9.5px uppercase mono "BACK TO APP"
link. Heavy isolation for a task like nudging one threshold.

---

## C. Feedback, state, and data safety

### C1 — The status band rendered in normal flow · `fixed`

Saving Workflows after three screens of scroll put the confirmation off-screen above you. The code
already conceded this: Invitations had been moved to the global toast *specifically* because "its
confirmations fire while the admin is scrolled down". The workaround was applied to one section
instead of to the mechanism.

**Fixed:** the band is `position: sticky` at the top of the scroll container, so it is visible from
anywhere on a group page.

### C2 — Two feedback systems on one page · `fixed`

Twelve sections used the in-flow band; Invitations used global `useToast()` — different position,
styling, and lifetime for the same class of event.

**Fixed:** Invitations now takes `onStatus`/`onError` like every other section. One system.

### C3 — The band could not be dismissed or re-read · `fixed`

Auto-cleared at 4s (status) / 6s (error), with errors announcing as `role="status"` (polite).

**Fixed:** added a dismiss button; the error variant is `role="alert"`, status stays `role="status"`.

### C4 — Success silently swallowed errors · `fixed`

`{pageError ?? statusMsg}` rendered one slot for both, so a success from one section could replace a
pending error from another.

**Fixed:** an incoming success no longer clears a live error.

### C5 — No unsaved-changes guard · `fixed`

Thresholds, Vocabulary, Workflows, and Member fields all hold dirty drafts and display an "Unsaved"
pip. Switching groups, clicking a filter result, pressing "Index", or opening the mobile drawer
discarded them silently.

**Fixed:** a `SettingsDirtyContext` lets each section register its existing `dirty` boolean;
navigation raises a discard `ConfirmDialog`, and a `beforeunload` listener covers tab close.

### C6 — Three destructive-confirmation patterns coexisted · `fixed`

- `ConfirmDialog` — Accounts unlink/admin, Invitations revoke, Roles delete
- native `window.confirm` — Roles zero-permission save, Custom metrics delete, Event types delete
- inline underlined "Yes, remove · Cancel" sentence — Member fields

The native calls broke out of the dusk theme entirely and are unstyleable.

**Fixed:** all four now use `ConfirmDialog`. The Roles one required restructuring — its
`window.confirm` sat synchronously inside `save()`, so it became a pending-confirm state that resumes
the save on confirm.

### C7 — "Reset" means two opposite things · `deferred`

In Thresholds, "Reset to defaults" jumps to hardcoded defaults and marks the form dirty. Everywhere
else, "Reset" reverts to what's saved. The destructive one has no confirmation and isn't disabled
when you're already at defaults.

### C8 — Invalid threshold edits were silently discarded · `fixed`

`commit()` parsed the draft and, on NaN or out-of-range, closed the editor keeping the old value —
on blur, so you could type a number, click away, and watch it vanish with no message.

**Fixed:** invalid input keeps the editor open with an inline error. Escape still cancels outright.

### C9 — No cross-field validation · `deferred`

Nothing prevents attendance *At-risk 90% / Watch 50%* (inverted, so "Watch" can never trigger), or a
custom metric whose `atRiskBelow` exceeds its `goal`.

### C10 — Save failures collapse to one string · `deferred`

"Couldn't save your changes. Try again." — chosen by sniffing `message.includes("403")` on the error
text. No field-level errors, no retry affordance.

### C11 — Editing a custom metric confirms nothing · `deferred`

`handleSave` closes the editor while *creating* one calls `onStatus`.

---

## D. Language & content · all `deferred` except D5

### D1 — Settings ignores its own Vocabulary feature

The Index strip hardcodes "N Brothers · N Tasks · N Parties"; General repeats "brothers"; Accounts'
lede says "brothers"; Roles says "A brother can hold any number". An org that renames Member → Player
one section away still reads "brothers" on the very page that renamed it. Only Invitations calls
`useVocab()`.

### D2 — Machine tokens surface as UI copy

Role permission chips render `p.name.replace(/^MANAGE_/,"").toLowerCase()` → "brothers", "docs",
"announcements". Event types show `NEEDS ${type.workflowId.toUpperCase()}`. Custom metrics ask the
user to author a **slug**, marked required with an asterisk.

### D3 — Slug handling is asymmetric

Event types derive the slug from the label and preview it as permanent; Custom metrics make you type
one by hand.

### D4 — Implementation vocabulary in user-facing copy

"Refresh from database", "Changes save to the database — refresh to sync the local view", and an
activity-log entry reading "Data refreshed from database" — written for a *read* operation.

### D5 — "Log attendance" navigated to `/timeline` · `fixed`

Relabelled to match its destination. A real attendance entry point from Settings would be better
still.

### D6 — Admin promotion undersells its own consequences

The confirm says the promoted member "will be able to manage finances, semesters, roster, and
attendance". Org admin also unlocks Billing and **Delete this organization** — the most consequential
grant on the page describes itself as one of the mildest. This is the most worthwhile item in section
D.

### D7 — Three date formats

Invitations uses `toLocaleDateString`; Semesters prints raw `YYYY-MM-DD` strings straight from the
API; the Activity log uses a third `toLocaleString` shape.

### D8 — "Pages updated." fires for an order-only change

### D9 — "Done" on a member field doesn't save

It collapses the editor; the real save is a separate button further down the page.

---

## E. Accessibility

### E1 — Logo upload unreachable by keyboard · `fixed`

See A1.

### E2 — The mobile nav drawer was a fake drawer · `fixed`

`.set-nav-drawer` was translated off-screen but stayed in the DOM, focusable, and exposed to
assistive tech: no `aria-hidden`, no `inert`, no focus move on open, and Escape didn't close it. The
app's own `Modal` primitive in
[primitives.tsx](../app/components/dashboard/primitives.tsx) implements a focus trap, Escape, initial
focus, *and* focus restoration — the drawer was written without reusing any of it.

**Fixed** by mirroring the `Modal` behaviour. The load-bearing detail: the drawer is a **static
column at lg+**, so the hidden attributes are gated on a `matchMedia("(min-width: 1024px)")` check —
applying them on `!navOpen` alone would hide the desktop nav from assistive tech.

### E3 — Nav state was class-only · `fixed`

No `aria-current` on the active group or Index; the "active dot" is decorative CSS. **Fixed:**
`aria-current="page"` on the active item.

### E4 — The explanatory text color failed WCAG AA · `fixed`

`--faint` (#6b6354) on `--card` (#161310) measured **≈3.1:1** against a 4.5:1 requirement. It is the
color for `.sc-note`, `.sc-row-sub`, `.ix-row .h`, input placeholders, `.sc-locked`, and every
timestamp — essentially all secondary copy on the page, at 8.5–12px.

**Fixed:** `--faint` → #8a8271 (≈4.8:1), with `--muted` → #a49b88 so the two-step ramp doesn't
collapse.

### E5 — The type scale runs small throughout · `deferred`

8.5–12.5px for reading copy, with section ledes in 12.5px italic serif and group labels in 8.5–9px
uppercase mono. Raising the floor is a design decision, not a bug fix, so it is recorded rather than
applied.

### E6 — Focus rings existed in exactly two places · `fixed`

`.ix-row:focus-visible` and `.sc-check input:focus-visible`. Every `.sc-btn`, `.set-nav-item`,
`.et-swatch`, and link fell back to the UA default — while the auth surface already defines a proper
`:focus-visible` treatment in [globals.css](../app/globals.css). **Fixed** by mirroring that
treatment across `.set-page`.

### E7 — `scrollIntoView` ignored `prefers-reduced-motion` · `fixed`

Two smooth-scroll call sites, though the stylesheet already gates transitions and animations.
**Fixed** via a shared helper that drops to `behavior:"auto"` under the media query.

### E8 — Navigation moves the viewport but not focus · `deferred`

Choosing a filter result scrolls the page; a keyboard or screen-reader user is left in the rail with
no announcement that the content changed. Best solved alongside B1.

### E9 — Three checkbox treatments · `fixed`

Designed `.sc-box` (Workflows), native + `accentColor` (Member fields, Roles), and bare native with
no styling at all (Invitations) — which rendered default blue inside a violet/dusk palette.
**Fixed:** Invitations now uses `.sc-check`/`.sc-box`. Member fields and Roles still use the
`accentColor` variant; consolidating those is cosmetic and deferred.

### E10 — Event-type color choice is a ring on a swatch · `deferred`

The hue is named only in `title`/`aria-label`.

### E11 — Placeholder-as-label in the rail filter · `deferred`

All-caps ("FIND A SETTING…"), 10.5px, in `--faint`.

---

## F. Layout & responsive · all `deferred`

### F1 — Ultrawide dead zone

`.dash-settings` grows to `min(1080px + 22vw, 1680px)` while `.set-block` caps at 720px — content
hugs the left with up to ~900px of empty paper. Meanwhile `.ix-ledger` spans the *full* width, so on
the Index a 34px icon and its label sit ~1,500px from their chevron.

### F2 — No sticky action bar

Workflows is a long form — always-on list, dashboard widgets, eight page toggles with nested feature
checkboxes, three reorder groups — with Save and the "Unsaved" pip at the very bottom, invisible
while you edit. (C1's sticky status band mitigates the *confirmation* half of this, not the control
half.)

### F3 — Nested scroll trap

The Activity log renders `max-h-[60vh] overflow-y-auto` inside the page scroller.

### F4 — Roles master/detail doesn't follow selection on mobile

The two-column grid stacks below `lg`; selecting a role neither scrolls nor focuses the edit panel
that appears below the fold.

### F5 — Accounts has no search, filter, or pagination

Every member, each with role chips and a popover, in one unbounded list. The 2026-07 org-admin stress
test already found attendance timing out at ~59 members; this list has the same shape of problem.

### F6 — The Activity log can't answer the question it promises

Its lede says "who did what, and when", but `actorId` is fetched and never rendered. Filters are
severity (Info/Success/Warning) — there's no date range, no person filter, no search, and no
pagination.
