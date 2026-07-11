# What the onboarding interview actually needs to figure out

*Working doc — 2026-07-10. The problem, the axes that matter, and where the current 3-question interview loses resolution.*

> **STATUS (2026-07-10): implemented.** The interview is now a scripted spine with AI branches — identity (kind) → activity variant (`KIND_VARIANTS` in `lib/onboarding/kinds.ts`) → an AI-assisted pages deep-dive (`app/api/ai/interview/route.ts`, bounded clarify loop) → term model + first term (`lib/onboarding/terms.ts`, seeded as the active `Semester` in `provisionOrg`) → per-member metrics (built-in KPI toggles + `OrgMetricDefinition` seeding) → founder name + title. The pain question was dropped; axes 1–5 are resolved, axis 6 (scale/comms) remains inferred. Sections below are kept as the design rationale.

## The core problem

The current interview (`app/create/_components/InterviewStep.tsx`) asks **three** questions:

1. **Kind** — "what kind of organization is it?" → resolves to one of 7 templates via `KIND_TO_TYPE`
2. **Pain** — "what eats most of your time?" → forces one workflow on via `PAIN_WF`
3. **Name** — "what should everyone call you?" → `founderName`

Everything else — enabled workflows, roles, vocabulary, the term model — is inferred from the **kind** answer alone. That's the weak link.

**"Fraternity" is not one thing.** `KIND_TO_TYPE.fraternity → "fraternity"` template, which hard-codes: parties ON, service ON, dues ON, "Brothers/Chapter/Semesters" vocab, and a President/Treasurer/Social/PR role set. That is a *social* fraternity. But:

- A **professional fraternity** (e.g. Alpha Kappa Psi, Phi Delta Epsilon) has no parties, is heavy on service/professional-development events and dues, and would find a "Social Chair" seat and "parties" page actively wrong.
- A **service fraternity** (e.g. Alpha Phi Omega) is service-hours-first, parties off — closer to the `service-org` template than the `fraternity` one, despite calling itself a fraternity and using Brother/Chapter vocab.
- An **honor/academic fraternity** overlaps the honor-society template.

So the single word "fraternity" collapses at least four organizations with materially different page sets, role sets, and priorities. The same collapse happens to "club," "team," and "arts." **The kind answer picks vocabulary well and defaults poorly.** The interview needs to separate *what you call yourselves* from *what you actually do*.

---

## The discovery axes

These are the independent dimensions the setup actually depends on. Each maps to a concrete decision the system already models (`enabledWorkflows`, `roleSeeds`, `vocabularyOverrides`, term model). The interview's job is to resolve each axis — today it resolves only #1 and a sliver of #4.

### 1. Vocabulary / identity — *what do you call yourselves?*
- **Resolves:** `vocabularyOverrides` (Member→Brother/Sister/Player/Cast member, Meetings→Chapter/Practice/Rehearsal, Period→Semester/Season).
- **Current state:** handled well by the kind chips + `KIND_VOCAB_DELTA` (sorority → Sister).
- **What's missing:** vocab is currently *bundled* with everything else. Identity ("we're a fraternity") should set words but NOT auto-decide parties/service. Decouple this axis from axes 2–3.

### 2. Activity profile — *what do you actually do?* ← **the big gap**
This is the axis the "fraternity" collapse lives on. Independent sub-questions:

- **Do you throw parties / social events with door revenue?** → `parties` workflow + `MANAGE_PARTIES` + a Social seat. *Social frat: yes. Professional/service frat: no.*
- **Do you track service / volunteer hours?** → `service` workflow + `MANAGE_SERVICE` + Service Chair seat. *Service frat, honor society, service org: yes, and it's the centerpiece. Social frat: sometimes, secondary.*
- **Do you collect dues / manage money?** → `finance` workflow + Treasurer seat. *Most do; some loose clubs and teams don't.*
- **Do you take attendance at things, and is it mandatory?** → `attendance` workflow + `MANAGE_ATTENDANCE`. *Frats/teams/honor societies: yes and consequential. Loose clubs: maybe not.*
- **Do you hold formal meetings with minutes/quorum?** → `meetings` workflow (Chapter surface). *A sports team or loose org may run entirely on events + comms and never hold a formal meeting.*
- **Is recruitment / rush a distinct season you run?** → Rush Chair seat, recruitment events. *Frats/sororities: yes. Most others: no.*

Each of these is a real, gated toggle in the system today. The interview should surface the 3–4 that matter for the declared identity rather than assuming the template's bundle.

### 3. Roles / authority structure — *who runs what?*
- **Resolves:** `roleSeeds` (the seats the org starts with) + which `MANAGE_*` bundles they carry.
- **Current state:** entirely template-derived; the founder can edit seats on the Roles step *after* the interview, but the interview doesn't inform it beyond kind.
- **What to figure out:**
  - The founder's own title (President / Captain / Director / Admin) — currently the *first* seat is auto-granted to the founder; the interview never asks what to call it.
  - Which offices exist. A professional frat has a VP of Professional Development and a VP of Membership, not a Social Chair. The `SEAT_POOL` already carries alternates per type; the interview could ask "which of these officers do you have?" instead of shipping a fixed four.
  - Whether roles carry real admin power on day one or members claim them later.

### 4. Who's being set up / the founder — *your name & role*
- **Resolves:** `founderName`, founder's granted seat.
- **Current state:** name is asked; **founder's title is not** (it's silently the template's rank-100 seat: President/Captain/Director/Admin).
- **What's missing:** confirm the founder's title, since it varies by org and the auto-pick is often wrong (a professional frat's founder-user may be "VP Operations," not "President").

### 5. Term / time model — *how does your calendar reset?*
- **Resolves:** `Period` vocab + `MANAGE_SEMESTERS`, and how attendance %/dues cycles roll over.
- **Current state:** implied by kind (Semester vs Season), never asked directly.
- **What to figure out:** semester vs quarter vs season vs rolling/none. A club that runs year-round with no term reset is modeled badly as "Semesters." This drives how dues cycles and attendance percentages reset.

### 6. Scale & communication surface — *how big, and how do you talk?*
- **Resolves:** `communications` (Announcements) vs group-chat assumption; whether Instagram/`MANAGE_INSTAGRAM` matters.
- **Current state:** the `pain` question can force `communications` on, but scale is never asked.
- **What to figure out:** rough member count (the fraternity template deliberately starts Announcements OFF assuming a group chat covers it "until exec outgrows it" — that assumption is size-dependent), and whether they run an org Instagram/public presence (PR seat vs not).

---

## The specific "fraternity" disambiguation (the user's example, worked)

When someone says **"fraternity,"** the interview should NOT immediately assume the social-frat bundle. One follow-up resolves it:

> *"Got it — Brothers, Chapter, Semesters. What kind of fraternity?"*
> - **Social** → parties ON, service secondary, Social + PR seats. *(current default)*
> - **Professional** → parties OFF, professional-development events, dues + attendance heavy, VP Membership / VP Professional Dev seats instead of Social.
> - **Service** → service-hours-first (closer to `service-org`), parties OFF, Service Chair as a core seat.
> - **Honor / academic** → overlaps `honor-society`: standards, attendance, GPA/eligibility framing.

Vocabulary stays "Brother/Chapter/Semester" across all four — that's the identity axis (unchanged). What flips is the **activity profile** (axis 2) and **roles** (axis 3). This is the general pattern: **one identity question, then one activity question, and never let the identity word silently decide the activity bundle.**

The same follow-up applies to:
- **"Club"** → social/interest club vs pre-professional club vs competition club (attendance/dues heavy).
- **"Team"** → competitive league team (attendance mandatory, seasons, no dues) vs casual/intramural (loose, maybe no attendance).
- **"Arts"** → production company (rehearsals, run calendar, tech seats) vs a-cappella/band (rehearsals + gigs + dues).

---

## Design implications / recommendations

1. **Split the "kind" answer into two turns: identity, then activity.** Identity sets vocabulary; activity sets the workflow/role bundle. This is the single highest-value change and directly fixes the fraternity collapse.
2. **Keep it short — resolve axes by inference, confirm only the load-bearing ones.** Don't ask all six axes as six questions. Ask identity, ask the one activity follow-up its identity leaves ambiguous, ask the pain, confirm the founder's title, and infer the rest with a *reviewable* blueprint (the sheet already shows it — the founder edits before building).
3. **Make the blueprint the safety net, not the interview.** The `BlueprintSheet` already lets the founder toggle workflows and edit seats before provisioning. The interview should get them ~90% right so the sheet is a confirm, not a repair.
4. **Ask the founder's title.** Cheap, currently missing, and the auto-pick is wrong for any org whose top office isn't the template's rank-100 name.
5. **Consider a term-model question** only for orgs where "Semester" is a bad guess (year-round clubs, rolling-membership orgs).
6. **New templates or template *modifiers*?** Rather than adding `professional-fraternity`, `service-fraternity`, etc. as full templates, consider the activity axis as a set of modifiers layered on a base (identity → vocab, activity answers → workflow/role deltas). Fewer templates to maintain; matches how `PAIN_WF` already layers one forced workflow on top of a template.

---

## The full caveat catalog

Every place a single "kind" word forks into sub-varieties the current interview can't tell apart. Each caveat notes **the split**, **what the system does wrong today**, and **what would need to be asked** to get it right. Grouped by kind.

### Fraternities & sororities (`kind: fraternity | sorority` → `fraternity` template)

The word carries the most baggage. The template assumes a **social college fraternity** and is wrong for the rest.

1. **Social vs professional vs service vs honor/academic.** *(the headline caveat)*
   - *Social* — parties, socials, mixers, dues, big attendance culture. The current default.
   - *Professional* (Alpha Kappa Psi, Phi Delta Epsilon, Kappa Psi) — **no parties**; professional-development events, networking, resume/interview workshops, dues. A "Social Chair" seat and a Parties page are actively wrong. Wants VP Membership / VP Professional Development.
   - *Service* (Alpha Phi Omega, Epsilon Sigma Alpha) — **service-hours-first**, parties off; behaves like the `service-org` template but keeps Brother/Chapter/Sister vocab. Service Chair is a *core* seat, not an add-on.
   - *Honor / academic* (Phi Beta Kappa, Tau Beta Pi) — GPA/eligibility and standards lead; overlaps `honor-society`.
   - **System does wrong today:** picks parties-on, Social+PR seats, service-secondary for all four.
   - **Ask:** "What kind of fraternity?" — one follow-up after identity.

2. **Chapter vs colony vs interest group / provisional status.** A newly forming group ("colony," "interest group," "petitioning chapter") isn't a full chapter yet — different roles (often just a founding exec + advisor), recruitment-heavy, and no established dues/standards machinery.
   - **System does wrong:** seeds a full President/Treasurer/Social/PR chapter exec.
   - **Ask:** established chapter or just starting out?

3. **Rush / recruitment as a distinct season.** Some run formal rush with a Rush Chair, bid events, pledge/new-member education classes; others (professional, service) recruit informally.
   - **System has:** a Rush Chair in `SEAT_POOL.fraternity` and a "Pledge Class" custom-field example — but only offered as an add-on, never asked.
   - **Ask:** do you run a formal rush/pledge process?

4. **Pledge / new-member class tracking.** `lib/custom-member-fields.ts` literally uses `"Pledge Class" → pledge_class` as its example, but a custom field is never seeded. Social/IFC frats bucket members by pledge class; professional frats by "cohort"; service frats often not at all.
   - **Ask (or infer):** do you track members by pledge/new-member class?

5. **GPA / academic standing.** `lib/thresholds.ts` ships `gpaAtRisk: 2.7`, `gpaWatch: 3.0` and a Chapter-GPA KPI (`kpi-gpa`) **to every org**. A social frat cares; a professional frat may; a service org / sports team does **not** and the GPA KPI is noise.
   - **System does wrong:** GPA KPI + thresholds on for everyone regardless of kind.
   - **Ask (or infer from kind):** do you track member GPA / academic standing?

6. **National org / IFC/Panhellenic reporting.** Many chapters report up to a national HQ (member counts, dues, standards, service hours). No concept of this exists; irrelevant to independent/local orgs.
   - **Caveat only** — out of scope for v1, worth noting as a "these orgs need X we don't model."

7. **Sorority ≠ just "Sister" vocab.** Sorority currently shares the fraternity template with only a `Member: "Sister"` delta. But recruitment (formal Panhellenic recruitment vs frat rush), standards, and philanthropy-vs-parties balance often differ. The vocab delta is right; the activity assumption inherited from the frat template may not be.

### Clubs / student orgs (`kind: club` → `generic-club` template)

"Club" is the vaguest word and the second-worst collapse.

8. **Interest/social club vs pre-professional vs competition/comp club.**
   - *Interest / social* (anime club, hiking club) — light: members, occasional events, comms. Attendance and dues optional.
   - *Pre-professional* (consulting club, finance club, Model UN) — dues, mandatory attendance, application/interview-based membership, professional events.
   - *Competition* (robotics, debate, esports, Model UN travel team) — attendance-mandatory, travel logistics, budget/finance heavy, roster tied to eligibility.
   - **System does wrong:** ships attendance + finance + meetings on for all; over-configures a casual club, under-configures a comp team's logistics.
   - **Ask:** how structured — casual, dues-paying, or competition?

9. **Application / selective vs open membership.** Some clubs admit anyone; others interview/application-gate. Affects whether a "recruitment/applications" surface matters and whether the roster is a fixed cohort.
   - **Caveat / ask.**

10. **Meetings vs no meetings.** `meetings` (the Chapter surface) is toggleable precisely because "a loose generic org" may never hold a formal meeting (per the `ALWAYS_ON_WORKFLOWS` comment). A club that's really a Discord + occasional event shouldn't get a meetings page.
    - **Ask (or infer):** do you hold regular formal meetings?

11. **Departmental / academic club with a faculty advisor.** Has an advisor role and often ties to a department; different authority model (advisor isn't the top admin but has oversight).
    - **Caveat** — no "advisor" seat exists.

### Sports / teams (`kind: team` → `sports-team` template)

12. **Competitive/varsity/club-sport vs intramural/casual.**
    - *Competitive club sport* — mandatory practice attendance, seasons, travel, sometimes dues, eligibility.
    - *Intramural / rec / pickup* — loose, attendance informal, often no dues, short-lived.
    - **System does wrong:** `sports-team` assumes attendance-forward with Coach/Manager seats — over-structured for an intramural team, and it *drops finance* which a club sport paying league fees needs.
    - **Ask:** competitive or casual/intramural?

13. **Dues / league fees.** The template deliberately omits `finance` ("No dues by default"), but club sports routinely collect league/travel fees. Currently requires manually re-adding finance.
    - **Ask:** do you collect fees/dues?

14. **Season vs year-round.** `Period → "Season"` assumes a season model; a year-round team (rowing, ultimate that plays fall+spring) resets differently.
    - **Caveat / term-model axis.**

15. **Coach as top authority vs player-led.** Template makes Captain the rank-100 founder and Coach rank-60. A coach-run team inverts this; a player-run club has no coach at all.
    - **Ask (founder title axis):** who runs it — a captain, a coach, or a player-organizer?

### Service / volunteer orgs (`kind: service` → `service-org` template)

16. **Recurring-program org vs one-off event org.** Some run standing weekly programs (tutoring, food bank shifts); others do episodic service days. Affects whether attendance/recurring events or one-off event logging leads.
    - **Caveat / ask.**

17. **Hours requirements & verification.** Some service orgs enforce an hours quota per member (with at-risk flagging like GPA); others just log. `serviceHoursGoal` exists in thresholds but isn't surfaced at onboarding.
    - **Ask (or infer):** is there a required-hours minimum per member?

18. **Fundraising vs pure service.** Template keeps finance "for fundraising," but a pure-service club with no money shouldn't get a Treasurer.
    - **Ask:** do you handle money/fundraising?

### Honor societies / academic (`kind: honor` → `honor-society` template)

19. **Induction / eligibility gated membership.** Honor societies admit by GPA/invitation; membership is a status, not an ongoing participation. Roster semantics differ from a participation-based club — some inductees are inactive-but-members.
    - **Caveat** — no "inducted / lifetime member" status exists.

20. **Ceremony/induction events vs ongoing meetings.** Cadence is often a few events a year (induction, banquet), not weekly meetings. `meetings`-forward is likely wrong.
    - **Ask (or infer):** regular meetings, or a few ceremonies a year?

21. **Service-hours requirement for standing.** Many honor societies require service hours to stay in good standing — same hours-quota caveat as #17.

### Performing arts (`kind: arts` → `performing-arts` template)

22. **Production company vs ensemble (a-cappella / band / dance crew).**
    - *Production* (theatre troupe) — rehearsals build to a run of shows; tech/stage-manager/house-manager seats; ticketing.
    - *Ensemble* (a-cappella, band, dance) — rehearsals + gigs/competitions; dues; often audition-gated; no "run of shows" model.
    - **System does wrong:** one `performing-arts` template with Director/Stage Manager assumes a production; an a-cappella group's founder isn't a "Director" and has no "Stage Manager."
    - **Ask:** a production company or a performing ensemble?

23. **Audition-gated membership.** Most arts groups audition. Same selective-membership caveat as #9.

24. **Ticketing / box-office revenue.** Productions sell tickets (door revenue exists via `MANAGE_PARTIES`/party door-revenue, but framed as parties, not shows). Semantic mismatch.
    - **Caveat.**

### Cross-cutting caveats (hit every kind)

25. **Founder's title is never asked.** The rank-100 seat (President/Captain/Director/Admin) is auto-granted. Wrong whenever the top office differs (professional-frat "VP Operations," coach-run team, player-organizer, music director). *(also axis #4)*

26. **Term model is inferred, never confirmed.** Semester is the global default (`DEFAULT_LABELS.Period = "Semester"`). Quarter-system schools, trimesters, year-round orgs, and rolling-membership orgs are all mismodeled. Drives how dues cycles and attendance % reset. *(axis #5)*

27. **GPA thresholds & KPI ship to everyone.** `lib/thresholds.ts` + `kpi-gpa` are on by default regardless of kind — noise for any non-academic org. *(see #5)*

28. **Dues-owed tracking assumes per-member recurring dues.** Orgs with one-time fees, event-based payment, or no money at all get a dues machine they don't need.

29. **Announcements-off assumption is size-dependent.** The fraternity template starts `communications` OFF on the theory "a group chat covers it until exec outgrows it." True at 20 members, false at 150. Scale is never asked. *(axis #6)*

30. **Instagram / public presence (`MANAGE_INSTAGRAM`, PR seat) assumed for social orgs only.** A professional frat or honor society may want it; a private club may not. Bundled into some templates, absent from others, never asked.

31. **Custom member fields are never seeded.** Pledge Class (frat), Jersey # (team), Voice Part (a-cappella), Major/Grad Year (pre-professional) are all natural per-kind fields the system supports but the interview never offers.

32. **Advisor / faculty-oversight role has no model.** Academic clubs, honor societies, and some service orgs have a non-admin advisor with oversight. No seat template for it.

---

## Quick reference — axis → system field

| Axis | Resolves to | Interview asks it today? |
|---|---|---|
| 1. Vocabulary / identity | `vocabularyOverrides` | ✅ (kind) |
| 2. Activity profile | `enabledWorkflows` (parties/service/finance/attendance/meetings) | ⚠️ partial (`pain` forces one) |
| 3. Roles / authority | `roleSeeds`, `SEAT_POOL` picks | ❌ (template only) |
| 4. Founder identity | `founderName`, founder seat | ⚠️ name only, not title |
| 5. Term / time model | `Period` vocab, `MANAGE_SEMESTERS` | ❌ (inferred) |
| 6. Scale & comms | `communications`, `MANAGE_INSTAGRAM` | ❌ (inferred) |
