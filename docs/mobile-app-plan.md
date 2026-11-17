# ChaptOS mobile app — plan to App Store / Play Store (v1)

Status 2026-11-17: server groundwork shipped (bearer auth, `lib/api-types` contract,
426 gate, `/api/mobile/config`). `mobile/` has UI phase U0 (see
`docs/mobile-app-ui-motion-plan.md`). **Phase 1 and the rest of Phase 2 are built,
uncommitted**: every v1 route is in the contract (new: `GET /api/home`,
`GET /api/calendar/[id]/summary`, `DELETE …/participation/me`, bearer avatar upload),
plus the bearer smoke test, the mobile lint boundary, and the app shell (dev sign-in,
`api()`, persisted TanStack Query, routing by state, org switcher, EAS profiles).
Not yet run on a device or against a real token (see "Phase 2 → Done when").

## Scope

**v1 is the member's app.** Someone who already belongs to (or is invited to) a chapter
signs in, sees what's next, checks in, does their tasks, votes, sees their dues, asks Chapt.

**Not in v1:**
- Org creation (`/create`, `provisionOrg`, the onboarding interview). No "start a chapter" button.
- Billing, plans, seats, Stripe. The app never mentions price or links to checkout
  (keeps us clear of App Store guideline 3.1.1).
- Officer admin: settings, roles, workflows, semesters, templates, editing minutes,
  the treasury ledger, issuing dues charges, programming lanes, docs management.
- The `SemesterGate` founder wall: that's a web officer moment. Member screens must
  instead handle "no active term" gracefully.

**Someone signed in with no chapter** sees one screen: "Ask an officer for your
chapter's invite link", plus a field to paste a link. No path to create one. They
also see any pending request, from `/api/auth/join-requests`.

Officer on-the-go actions (open/close check-in, approve join requests) are **v1.1**
(Phase 9).

## Phase overview

**Order rule (2026-11-17): everything in the app gets built first; sign-in comes last.**
Until Phase 7, dev builds use a temporary dev sign-in (see Phase 2). Native Google,
Sign in with Apple, account linking, the App Review login and universal links all
land together in Phase 7, right before the external beta and store submission.

| # | Phase | Size | Ships to |
|---|---|---|---|
| 0 | Accounts, IDs, decisions (only what in-app work needs) | S (mostly you) | — |
| 1 | API contract gaps for every v1 screen | M | prod web |
| 2 | Expo project + app shell (dev sign-in) | M | dev builds |
| 3 | Core member screens | L | dev / internal builds |
| 4 | Ask Chapt + money screens | M | dev / internal builds |
| 5 | Push notifications | M | dev / internal builds |
| 6 | Hardening (offline, load, accessibility, crash reporting) | M | internal builds |
| 7 | Sign-in & entry: native Google, Apple, linking, review login, invite deep links → external beta | M | external beta |
| 8 | Store submission | M | App Store + Play |
| 9 | v1.1 officer on-the-go | M | update |

## Phase 0 — Accounts, IDs, decisions

Owner: you. Only the first group blocks in-app work; the rest is needed by Phase 7.

**Needed now (for in-app work):**
- [ ] Expo account + EAS (free tier is enough to start; paid gets faster builds).
- [ ] Supabase: add `chaptos://auth-callback` (and the Expo dev scheme) to the redirect
      allowlist. That's all the temporary dev sign-in in Phase 2 needs.
- [ ] Decisions below (iPhone only, members read minutes).

**Start early, needed by Phase 7–8 (slow approvals):**
- [ ] Apple Developer Program ($99/yr). **Enroll as an organization if you can**
      (needs a D-U-N-S number). The seller name shown is then the company, not you.
- [ ] Google Play Console ($25). **Organization account strongly preferred.** New
      *personal* accounts must run a closed test with 12+ testers for 14 days before
      production access. That's a real schedule risk.
- [ ] Bundle / package ID: `com.chaptos.app`. Store name "ChaptOS" (check availability).
- [ ] Supabase dashboard: enable the **Apple** provider (Services ID, key, team ID),
      add the **iOS and Android Google client IDs**, turn on **manual identity linking**.
- [ ] Public URLs: privacy policy, support/contact, and an account-deletion page
      (Play requires a web URL, not just in-app). `/trust` and `/terms` exist; check
      that the privacy policy covers the app (push tokens, camera/photos).
- [ ] Decision: **iPhone only** (`supportsTablet: false`) for v1. This avoids iPad
      screenshots and layout work. Recommended.
- [ ] Decision: **members read minutes in v1?** Today `GET /calendar/[id]/notes` needs
      `MANAGE_EVENTS`. Recommended: yes, read the published summary + action items only.

Apple org enrollment (D-U-N-S) and Play account verification can take weeks, so
start them now even though they're used late. Internal TestFlight builds also need
the Apple account, so it's wanted by Phase 3.

**Done when:** a dev build can be made with EAS, and the redirect allowlist is set.

## Phase 1 — API contract gaps for v1 screens

Each item: route exists or is added → wire type in `lib/api-types` → assertion in
`tests/contracts/api-types.contract.ts` → listed in the `index.ts` route map.

| Screen need | Work |
|---|---|
| Service sign-up | Types for `GET /service-events`, `POST/DELETE /service-events/[id]/participation/me`, own hours |
| Fundraisers | `fundraisers.ts` types exist; add to route map; supplies claim if members can claim |
| Minutes (read) | New member-readable `GET /calendar/[id]/summary`: published summary + action items, no draft body. `PATCH action-items` already member-tickable for assignees? Verify and type it |
| Docs (read) | Type `GET /docs` (links + folders, read-only) |
| Leave chapter | Type `POST /orgs/leave` |
| Calendar subscribe | Type `GET /calendar/subscription` (the app shows "Add to Calendar" with the feed URL) |
| Home | Decide: compose Up next / On your plate client-side from calendar + tasks + polls + live check-in (4 calls), or add `GET /api/home` that returns them in one. **Recommended: `/api/home`.** Phones on cell data pay for round trips, and the pg pool is 2 per instance |
| Profile edit | Type whatever members may edit about themselves (avatar, display name?) |

Plus the in-app (non-sign-in) pieces pulled forward from the old auth phase:

- **Terms in the contract.** `TermsStatus` already rides on `/api/auth/me`; add
  `POST /api/auth/terms` to the route map. The app shows the same hard wall as `TermsGate`.
- **Joining from inside the app.** Types for `GET /api/auth/invite-status`, `POST
  /api/auth/request-join`, `GET /api/auth/join-status`. They're used by the "no chapter
  yet → paste your invite link" screen and the awaiting-approval screen. (Invite links
  *opening* the app is Phase 7.)
- **Bearer support** for `auth/avatar` (photo upload) and `orgs/leave`.

Also:
- Add a `mobile` section to `scripts/lint-module-boundaries.sh`: `mobile/` may import
  only `import type` from `lib/api-types` and Zod schemas from `lib/validation`.
- Confirm every route the app calls works without cookies (a test that calls each
  route-map entry with a bearer token and no cookie jar).

**Done when:** `tsc` passes with the contract covering every endpoint a v1 screen uses,
and the bearer-only smoke test passes.

## Phase 2 — Expo project + app shell

- `mobile/` with its own `package.json`, Expo SDK (current stable), TypeScript,
  **expo-router**. Keep it out of the Next build and the root `tsconfig`.
- Metro `watchFolders` + tsconfig `paths` so `@/lib/api-types` and `@/lib/validation`
  resolve. Types only, plus Zod.
- **Temporary dev sign-in:** Supabase Google OAuth in the system browser
  (`expo-web-browser` + PKCE, redirect to `chaptos://auth-callback`), session in
  `expo-secure-store`. It reuses the existing web Google client, so there's no native
  client ID or Apple setup yet. All sign-in code sits behind one `auth/` module, so
  Phase 7 swaps the provider without touching screens.
- **API client:** one `api()` that adds `Authorization: Bearer`, `x-org-slug`,
  `x-app-version`; refreshes the token on 401 once; turns 426 into a blocking
  "Update ChaptOS" screen (store link from `/api/mobile/config`); parses
  `{ error, code, details }`.
- **Data layer:** TanStack Query, with a persisted cache (offline reads in Phase 6).
- **Routing by state:** signed out → sign in; terms pending → terms wall; no
  memberships → "ask for an invite link"; pending request → awaiting approval;
  else → tabs. Org switcher from `MeResponse.memberships`, last org remembered.
- **Look:** paper aesthetic tokens ported from `globals.css` / the iPhone paper mock
  (ivory light; check whether dark is in scope; recommended: light only for v1), fonts
  via `expo-font`.
- EAS: `development`, `preview`, `production` profiles; `app.config.ts` reads the
  API base URL per profile. Dev builds talk to an isolated server, never the shared
  DB for writes (see the isolated dev server notes).
- CI: `tsc` for `mobile/`, plus the existing contract test.

**Done when:** a dev build on a real iPhone and an Android phone signs in (dev
sign-in), switches orgs, and shows `/api/auth/me` data, and the 426 screen appears
when `MOBILE_MIN_VERSION` is set above the build.

## Phase 3 — Core member screens

Built from `_design/Dashboard iPhone Paper Mock.html` and the shipped phone-web pages.

Tabs: **Today · Timeline · Tasks · Members · More** (see `docs/mobile-app-ui-motion-plan.md` for all UI and motion)

- **Home:** Up next ticket, On your plate (tasks due, open polls, unpaid dues),
  announcement, live check-in band when a window is open.
- **Check-in:** the band opens a full-screen check-in (`POST
  /attendance/[eventId]/check-in`, undo). Haptic on success. This is the moment the
  app most has to be fast: preload the live check-in on app foreground.
- **Calendar:** agenda list by week; event detail with details/"who's bringing what"
  claims; excuse filing from the event.
- **Tasks + polls:** Overdue / Upcoming like the web; tick (incl. "each" tasks), task
  detail; vote on polls.
- **Members:** roster search, member profile (respecting `measured` standing).
- **Me:** my attendance, my excuses, my service hours, my dues book; edit photo
  (camera / library → `auth/avatar`); chapters (switch, leave); terms/privacy links;
  sign out; **delete account** (`/api/auth/account`, already built; required by both
  stores).
- Empty/day-one states for each, reusing the web copy where it fits members.

Also the entry screens: terms wall, "no chapter yet → paste your invite link"
(request to join), awaiting approval, and the 426 update screen.

**Done when:** an internal build can do a whole meeting on a phone:
see it on Home, check in, tick an action, vote. Every screen has loading, empty and
error states.

## Phase 4 — Ask Chapt + money

- **Ask Chapt:** SSE over `POST /api/ai/chat`. Use `expo/fetch` streaming (supported
  in recent SDKs) or `react-native-sse`; type events with `ChatStreamEvents`. Port the
  answer shapes members see most first (headline + body block, list/tally/week, row
  peek). Unknown shape → fall back to the plain text answer. The app must never crash
  on a shape added after it shipped, so add a server test that every shape carries
  a text fallback.
- **Attachments:** `expo-document-picker` / camera → `POST /api/ai/attachments`,
  limits from `GET /api/ai/chat`.
- Hide Ask Chapt when `ChatAvailability` says off.
- **Dues:** member dues book (charges, payments, waivers) read-only. No in-app
  payment in v1 (Stripe dues payments would need an IAP review; they are real-world
  services so likely allowed, but out of scope).
- **Reimbursements:** submit a request + receipt photo from the camera; see status.
- **Treasury:** only for members whose role grants it; otherwise hidden.

**Done when:** Ask Chapt answers stream on a phone over cell data with attachments,
and a reimbursement with a photo receipt reaches the web treasury.

## Phase 5 — Push notifications

Server:
- `PushDevice` table: `brotherId`, `token`, `platform`, `appVersion`, `lastSeenAt`,
  unique on token. It's identity-level (one device serves all a person's orgs), so
  it's not org-scoped: decide RLS explicitly, add `GRANT USAGE` on the `_id_seq` to
  `figurints_app`, and cascade/delete it in account deletion and member erasure.
- `NotificationPreference` per membership (per category on/off).
- `POST/DELETE /api/push/devices`. Signing out or deleting the account deletes the row.
- Sender: Expo Push API (one integration for APNs + FCM), batched, receipts checked,
  dead tokens pruned.
- Triggers as **event handlers** in `lib/events/handlers/push.ts`, never inside
  services:

| Event (already emitted) | Who gets it |
|---|---|
| `checkin.opened` | members expected at that event |
| `task.created` / `task.updated` (assignee added) | the assignees |
| `poll.created` | everyone (polls are everyone-mandatory) |
| `join_request.approved` | the requester ("You're in") |
| `dues.charge_issued` | members charged |
| `calendar.notes_saved` (summary published) | attendees, only if minutes are in v1 |
| *new* meeting reminder | members, X min before. Needs a scheduler (Vercel cron or pg_cron) since no event fires |

- Every push carries a deep link (`chaptos://org/<slug>/tasks/<id>`), and
  `x-org-slug` switches org when tapped.

App: `expo-notifications`, ask permission **after** the first useful moment (e.g.
after first check-in), not on launch; settings screen for categories.

**Done when:** on both platforms, opening check-in on the web buzzes a test
member's phone within seconds and the tap lands on the check-in screen.

## Phase 6 — Hardening

- Offline: persisted query cache, so Home/Calendar/Tasks render last-known data with a
  "last updated" note; writes fail clearly, with no queueing in v1.
- Load: test a 60-member chapter all checking in within a minute (the 2026-07 stress
  test hit attendance timeouts at ~59 members; re-check with check-in specifically).
- Accessibility: Dynamic Type up to XXL, VoiceOver/TalkBack labels, contrast on paper
  colours, 44pt targets.
- Crash/error reporting (Sentry for RN) with no PII in payloads.
- EAS Update for JS-only fixes; runtime version policy so OTA never reaches a binary
  that can't run it.

**Done when:** the load test passes, accessibility checks pass on both platforms, and
crash reporting is live on internal builds. (The real-chapter beta waits for Phase 7,
because outside testers need production sign-in.)

## Phase 7 — Sign-in & entry, then external beta

Done last, per the order rule. Everything a reviewer or a new member hits before
the first screen. Replaces the Phase 2 dev sign-in.

1. **Sign in with Apple, on web too.** Guideline 4.8 requires it in an app that offers
   Google. Ship it on `/login` and `/join/[token]` first. Then a chapter has the same
   options everywhere, and the identity path is proven on the web before the app switches to it.
   - Apple "Hide my email" gives a relay address. `Brother.email` and JoinRequest
     `email` must tolerate `@privaterelay.appleid.com`; officers then see a name, not
     a recognisable email. Show "via Apple" on the join-request band.
   - One person, Google on web and Apple on phone, would become **two Supabase users,
     two Brothers**. Use manual linking: Settings → Accounts → "Link Apple" for
     signed-in users, and on the native sign-in, if the Apple email matches an
     existing Google user, prompt "Sign in with Google once to link". There's no
     auto-merge (`authUserId` is globally unique).
2. **App Review login.** Reviewers can't use your Google account (2FA, device
   prompts). Add an email + password (or email OTP) sign-in that is **hidden in the UI
   and enabled only for an allowlist**, e.g. a `REVIEW_LOGIN_EMAILS` env checked
   server-side. Point it at a seeded demo chapter with realistic data, never a real one.
   Remember dev and prod share one DB: make the demo org self-contained and safe to
   reset.
3. **Universal links / App Links.** Serve `/.well-known/apple-app-site-association`
   and `/.well-known/assetlinks.json` from chaptos.com (add both to proxy
   `PUBLIC_PATHS`), claiming `/join/*` (and later `/org/*`). Without the app installed
   the link falls back to the web join page, unchanged.
4. **Native sign-in in the app.** Swap the dev sign-in for
   `@react-native-google-signin/google-signin` + `expo-apple-authentication`, both via
   `signInWithIdToken`. Add the hidden review login (long-press or `?review` link).
5. **External beta with one real chapter** (TestFlight external + Play closed test,
   which also covers the 12-tester rule on a personal Play account). Run it for at
   least 2 real meetings.

**Done when:** a fresh Apple account can tap a `/join/<token>` link, land in the app,
request to join, get approved, accept terms and reach Home with no Google. The review
login works only for allowlisted addresses (vitest). The beta chapter gets through two
meetings with no P0/P1 bugs open and crash-free sessions ≥ 99.5%.

## Phase 8 — Store submission

App Store:
- Privacy nutrition label: name, email, photos (avatar/receipts), user content
  (tasks, chat), financial info (dues amounts), identifiers (push token), crash data.
  Nothing used for tracking → no ATT prompt.
- Age rating questionnaire. The app has member-generated content inside private
  groups: add **report a problem** on member profiles and Ask Chapt answers to satisfy
  guideline 1.2 without a full moderation system.
- Permission strings: camera, photo library, notifications.
- `ITSAppUsesNonExemptEncryption = false` (HTTPS only).
- Screenshots: 6.9" iPhone set (and 6.5" if asked), seeded from the demo chapter.
- Review notes: demo login, what the app is ("companion for members of an existing
  organization; organizations are set up by their officers on chaptos.com"; don't
  mention price), how to see check-in (provide an event with an open window, or
  explain how).
- Sign in with Apple present (Phase 7). Account deletion in-app (built).

Google Play:
- Data safety form (mirrors the label above), account-deletion URL, content rating,
  target API level current, closed-test requirement satisfied (Phase 7 beta).

Release:
- Set `MOBILE_LATEST_VERSION`; leave `MOBILE_MIN_VERSION` unset until a breaking change.
- Phased release (App Store 7-day phased, Play staged rollout 20% → 100%).

**Done when:** both listings are live and a member outside the beta can install, join
from an invite link and check in.

## Phase 9 — v1.1: officer on-the-go

The officer actions that happen with a phone in hand, in the room:
- Open / close / cancel a check-in window; see who's in.
- Approve / reject join requests (the badge + band from `/brothers`), push to
  officers on new requests.
- Take attendance manually for someone without a phone.
Each needs contract types and permission-gated UI (`MANAGE_BROTHERS`, attendance perms).

## Risks to watch

- **Duplicate identities** from Google-on-web + Apple-on-phone (Phase 7 linking).
- **Play personal-account 12-tester rule** adding 2+ weeks.
- **Shared dev/prod DB**: app dev builds must not write to it; demo org must be
  isolated and resettable.
- **Contract drift**: every new web feature that touches a route-map response must
  stay additive; the contract test only guards listed routes.
- **Ask Chapt shapes** evolve weekly; old app builds must degrade to text, not crash.
