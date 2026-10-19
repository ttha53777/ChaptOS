/**
 * The JSON the API speaks — shared by the web client and the native app.
 *
 * Rules (enforced by scripts/lint-module-boundaries.sh and by tsc):
 *
 *  1. TYPE-ONLY. No runtime code, and every import is `import type`. The native
 *     app bundles nothing from here; it only needs the shapes.
 *  2. WIRE FORMAT. Describe the JSON as it arrives, not the server object it was
 *     serialized from: dates are ISO strings, never `Date`; an admin's unbounded
 *     maxRank is `null`, not Infinity.
 *  3. ADDITIVE ONLY. Shipped app builds live on phones for months. Add fields
 *     (optional, or always sent); never remove, rename, or change the type or
 *     nullability of one a released build reads. A change that can't be additive
 *     ships behind MOBILE_MIN_VERSION (see lib/mobile-config.ts), which turns
 *     older builds away with a 426 instead of letting them misread the payload.
 *  4. CHECKED AGAINST THE SERVER. tests/contracts/api-types.contract.ts asserts
 *     each service's serialized return type fits its shape here, so `tsc` fails
 *     when the two drift. Routes that build their body inline use `satisfies`.
 *
 * Request bodies are NOT here: they are the Zod schemas in lib/validation/*,
 * which both clients import directly (z.input<typeof schema>).
 *
 * Every request from the app sends `Authorization: Bearer <supabase access
 * token>`, `x-org-slug: <org>` for org routes, and `x-app-version: <semver>`.
 *
 * Route map for the member-facing screens:
 *
 *   GET    /api/mobile/config                  MobileConfig            (public)
 *   GET    /api/auth/me                        MeResponse
 *   GET    /api/auth/join-requests             OwnJoinRequest[]        (no roster row needed)
 *   GET    /api/auth/account                   AccountDeletionPreview  (no roster row needed)
 *   DELETE /api/auth/account                   { ok: true }            (body { confirm: "DELETE" }; 409 → details: AccountDeletionPreview)
 *   GET    /api/brothers                       Brother[]
 *   GET    /api/brothers/[id]/profile          MemberProfile
 *   GET    /api/calendar                       CalendarEvent[]
 *   GET    /api/calendar/event-types           CalEventType[]
 *   PATCH  /api/calendar/[id]/details          (claim a "who's bringing what" item)
 *   GET    /api/attendance/live                LiveCheckIn | null
 *   POST   /api/attendance/[eventId]/check-in  LiveCheckIn | null      (DELETE undoes)
 *   GET    /api/excuses/mine                   MyExcuseItem[]
 *   POST   /api/excuses                        (file an excuse)
 *   GET    /api/tasks                          Task[]
 *   PATCH  /api/tasks/[id]                     Task                    (an assignee may tick it)
 *   GET    /api/polls                          Poll[]
 *   POST   /api/polls/[id]/vote                Poll
 *   GET    /api/activity                       ActivityEntry[]
 *   GET    /api/announcement                   Announcement
 *   POST   /api/ai/chat                        SSE: ChatStreamEvents   (or ChatAvailability JSON when off)
 *   GET    /api/treasury                       TreasuryData
 *   GET    /api/transactions                   Transaction[]
 *   GET    /api/reimbursements                 Reimbursement[]
 *   GET    /api/dues                           DuesBoard               (?semester=<label>)
 *   GET    /api/dues/members/[brotherId]       MemberDuesBook
 *   POST   /api/dues/charges/preview           DuesChargePreview       (treasury; body = issueDuesChargeInput)
 *   POST   /api/dues/charges                   DuesChargeIssued        (treasury; PATCH/DELETE [id], DELETE [id]/lines/[brotherId])
 *   POST   /api/dues/waivers                   DuesWaived              (treasury; DELETE [id] → DuesWaived)
 *
 * Errors are `{ error: string, code?: string, details?: unknown }` with an HTTP
 * status (see lib/errors). 426 + code APP_UPDATE_REQUIRED means update the app.
 */
export type * from "./me";
export type * from "./roster";
export type * from "./tasks";
export type * from "./calendar";
export type * from "./treasury";
export type * from "./dues";
export type * from "./activity";
export type * from "./chat";
export type * from "./mobile";
