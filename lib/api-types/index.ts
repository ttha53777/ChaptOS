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
 *   POST   /api/auth/terms                     AcceptTermsResponse     (body acceptTermsInput)
 *   POST   /api/auth/avatar                    AvatarResponse          (multipart `file`; DELETE → AvatarResponse)
 *   GET    /api/auth/invite-status             InviteStatusResponse    (?token=; public, session optional; dead link 404/410)
 *   POST   /api/auth/request-join              RequestJoinResponse     (no roster row needed; body submitJoinRequestInput)
 *   GET    /api/auth/join-status               JoinStatusResponse      (?slug=; no roster row needed; 404 = no request)
 *   GET    /api/auth/join-requests             OwnJoinRequest[]        (no roster row needed)
 *   GET    /api/auth/account                   AccountDeletionPreview  (no roster row needed)
 *   DELETE /api/auth/account                   { ok: true }            (body { confirm: "DELETE" }; 409 → details: AccountDeletionPreview)
 *   GET    /api/brothers                       Brother[]
 *   GET    /api/brothers/[id]/profile          MemberProfile
 *   PATCH  /api/brothers/[id]                  MemberUpdated           (own row: body updateBrotherInput, the app sends { name })
 *   POST   /api/orgs/leave                     LeaveOrgResponse        (body leaveOrgInput; last admin → 409)
 *   GET    /api/home                           HomeResponse            (?today=YYYY-MM-DD)
 *   GET    /api/calendar                       CalendarEvent[]
 *   GET    /api/calendar/event-types           CalEventType[]
 *   PATCH  /api/calendar/[id]/details          EventDetailsUpdated     (body detailActionInput: claim or unclaim a "who's bringing what" item)
 *   GET    /api/calendar/[id]/summary          MeetingSummary          (published summary + action items; never the minutes)
 *   PATCH  /api/calendar/[id]/action-items     MeetingSummaryBody      (body toggleActionItemInput; the item's owner, or MANAGE_EVENTS)
 *   GET    /api/calendar/subscription          CalendarSubscriptionView (send ?view=member)
 *   POST   /api/calendar                       (201; MANAGE_EVENTS; body createCalendarInput, + repeat; the app re-reads GET /api/calendar)
 *   PATCH  /api/calendar/[id]                  (MANAGE_EVENTS; body updateCalendarInput; the app re-reads GET /api/calendar)
 *   DELETE /api/calendar/[id]                  204                     (MANAGE_EVENTS)
 *   GET    /api/calendar/[id]/delete-preview   EventDeletePreview      (MANAGE_EVENTS)
 *   GET    /api/calendar/agenda-templates      AgendaTemplate[]        (MANAGE_EVENTS)
 *   GET    /api/programming                    ProgrammingEvent[]      (everyone with the events workflow)
 *   POST   /api/programming                    ProgrammingEvent        (MANAGE_EVENTS; body createProgrammingTaskInput)
 *   PATCH  /api/programming/[id]               ProgrammingEvent        (MANAGE_EVENTS; body updateProgrammingTaskInput; published fields frozen)
 *   DELETE /api/programming/[id]               204                     (MANAGE_EVENTS)
 *   PATCH  /api/programming/[id]/stage         ProgrammingEvent        (MANAGE_EVENTS; body setStageInput; forward moves gated)
 *   GET    /api/programming/[id]/docs          ProgrammingDoc[]
 *   POST   /api/programming/[id]/docs          ProgrammingDoc          (MANAGE_EVENTS; body attachProgrammingDocInput)
 *   DELETE /api/programming/[id]/docs/[docId]  204                     (MANAGE_EVENTS)
 *   GET    /api/roles                          RoleChip[]
 *   GET    /api/parties                        Party[]                 (everyone with the parties workflow)
 *   POST   /api/parties                        Party                   (201; MANAGE_PARTIES; body createPartyInput; makes its Timeline entry)
 *   PATCH  /api/parties/[id]                   Party                   (MANAGE_PARTIES; body updatePartyInput, or wrapUpPartyInput + wrapUp: true)
 *   DELETE /api/parties/[id]                   204                     (MANAGE_PARTIES; takes its Timeline entry, roll and excuses with it)
 *   GET    /api/parties/attendance-summary     PartyRollRow[]          (rolled parties this term)
 *   POST   /api/ai/summarize-meeting           MeetingSummarized       (body { id }; the app offers it with MANAGE_EVENTS, as the web does)
 *   GET    /api/attendance/live                LiveCheckIn | null
 *   POST   /api/attendance/[eventId]/check-in  LiveCheckIn | null      (DELETE undoes)
 *   GET    /api/attendance/mine                MyAttendance
 *   GET    /api/attendance/[eventId]           EventAttendance         (who came to a required event; any member)
 *   GET    /api/attendance/summary             AttendanceSummaryRow[]  (?category=chapter)
 *   POST   /api/attendance                     (MANAGE_ATTENDANCE; body recordAttendanceInput `changes`; the app re-reads)
 *   POST   /api/attendance/[eventId]/window    LiveCheckIn | null      (MANAGE_ATTENDANCE; body checkInWindowInput: open | close | reopen | cancel | restore)
 *   GET    /api/excuses/mine                   MyExcuseItem[]
 *   POST   /api/excuses                        (file an excuse; brotherId honoured with MANAGE_ATTENDANCE, which also approves it)
 *   GET    /api/excuses                        ExcuseListItem[]        (MANAGE_ATTENDANCE; ?status=pending)
 *   PATCH  /api/excuses/[id]                   ExcuseDecided           (MANAGE_ATTENDANCE; body decideExcuseInput)
 *   GET    /api/tasks                          Task[]
 *   GET    /api/tasks/[id]                     TaskDetail              (each-task ticks + history)
 *   PATCH  /api/tasks/[id]                     Task                    (an assignee may tick it)
 *   GET    /api/polls                          Poll[]
 *   POST   /api/polls/[id]/vote                Poll
 *   GET    /api/service-events                 ServiceEvent[]
 *   GET    /api/service-participation          ServiceParticipationRow[] (whole org; filter brotherId for "my hours")
 *   GET    /api/service-events/[id]/participation ServiceParticipationRow[]
 *   POST   /api/service-events/[id]/participation/me ServiceParticipationRow[] (body logMyParticipationInput; DELETE undoes)
 *   GET    /api/fundraisers                    Fundraiser[]            (read-only for members)
 *   GET    /api/fundraisers/[id]               Fundraiser
 *   GET    /api/docs                           Doc[]                   (read-only for members)
 *   GET    /api/docs/folders                   DocFolder[]
 *   GET    /api/activity                       ActivityEntry[]
 *   GET    /api/announcement                   Announcement
 *   POST   /api/ai/chat                        SSE: ChatStreamEvents   (or ChatAvailability JSON when off)
 *   GET    /api/ai/chat                        ChatAvailability        (files/fileLimits present when attachments are on)
 *   GET    /api/ai/peek?type=&id=              PeekCard                (an answer row's record; type: member|event|task|transaction)
 *   POST   /api/ai/attachments                 ChatAttachmentInfo      (multipart `file` + `threadId`; 400 → details.code)
 *   GET    /api/ai/attachments?threadId=       ChatAttachmentInfo[]    (DELETE ?threadId= → { ok, removed })
 *   DELETE /api/ai/attachments/[id]            { ok: true }
 *   GET    /api/ai/attachments/[id]/units/[ref] AttachmentUnit         (ref: p7, s2, l3, sh1, sh1!B2:D9)
 *   GET    /api/treasury                       TreasuryData
 *   GET    /api/transactions                   Transaction[]
 *   GET    /api/treasury/categories            TransactionCategory[]   (every member; hidden ones included)
 *   GET    /api/reimbursements                 Reimbursement[]
 *   POST   /api/reimbursements                 Reimbursement           (201; body createReimbursementInput; your own, or anyone's with treasury)
 *   POST   /api/reimbursements/[id]/receipt    Reimbursement           (multipart `file`; requester while pending, or treasury)
 *   GET    /api/reimbursements/[id]/receipt    302 → 60s signed URL    (Accept: application/json → { url }; requester or treasury)
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
export type * from "./programming";
export type * from "./parties";
export type * from "./treasury";
export type * from "./dues";
export type * from "./activity";
export type * from "./chat";
export type * from "./chat-attachments";
export type * from "./mobile";
export type * from "./fundraisers";
export type * from "./service";
export type * from "./docs";
export type * from "./home";
