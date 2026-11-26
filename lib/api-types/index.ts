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
 *   GET    /api/join-requests                  JoinRequestPage         (MANAGE_BROTHERS; ?page=1, query joinRequestPageInput)
 *   POST   /api/join-requests/[id]/approve     JoinRequestApproved     (MANAGE_BROTHERS; body approveJoinRequestInput; 402 out of seats, 409 JOIN_REQUEST_DECIDED)
 *   POST   /api/join-requests/[id]/reject      204                     (MANAGE_BROTHERS; 409 JOIN_REQUEST_DECIDED)
 *   PATCH  /api/brothers/[id]                  MemberUpdated           (own row or MANAGE_BROTHERS: body updateBrotherInput; the app sends { name } | { gpa } | { serviceHours })
 *   POST   /api/orgs/leave                     LeaveOrgResponse        (body leaveOrgInput; last admin → 409)
 *   GET    /api/home                           HomeResponse            (?today=YYYY-MM-DD)
 *   GET    /api/dashboard                      DashboardResponse       (?today=YYYY-MM-DD)
 *   GET    /api/calendar                       CalendarEvent[]
 *   GET    /api/calendar/event-types           CalEventType[]
 *   PATCH  /api/calendar/[id]/details          EventDetailsUpdated     (body detailActionInput: claim or unclaim a "who's bringing what" item)
 *   GET    /api/calendar/[id]/summary          MeetingSummary          (published summary + action items; never the minutes)
 *   PATCH  /api/calendar/[id]/action-items     MeetingSummaryBody      (body toggleActionItemInput; the item's owner, or MANAGE_EVENTS)
 *   GET    /api/calendar/subscription          CalendarSubscriptionView (send ?view=member; ?summary=1 answers CalendarFeedLive)
 *   PATCH  /api/calendar/subscription          CalendarFeedChanged     (org admins; body manageCalendarFeedInput: turnOn, timeZone, disable, rotate, link; the app re-reads the GET without ?view=member)
 *   POST   /api/calendar                       (201; MANAGE_EVENTS; body createCalendarInput, + repeat; the app re-reads GET /api/calendar)
 *   PATCH  /api/calendar/[id]                  MinutesSaved            (MANAGE_EVENTS; body updateCalendarInput; the app re-reads GET /api/calendar, except a minutes autosave { description }, 409 once shared)
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
 *   GET    /api/events/fields                  EventFieldRow[]         (every member; disabled rows too)
 *   POST   /api/events/fields                  EventFieldRow           (201; MANAGE_EVENTS; body createEventFieldInput: label + kind, the server derives the slug)
 *   GET    /api/roles                          RoleChip[]              (MANAGE_ROLES holders get RoleDetail: permissions + isSystem)
 *   POST   /api/roles                          RoleSaved               (201; MANAGE_ROLES; body createRoleInput: ranked below yours, only bits you hold)
 *   PATCH  /api/roles/[id]                     RoleSaved               (MANAGE_ROLES; body updateRoleInput, only what changed; below your rank)
 *   DELETE /api/roles/[id]                     204                     (MANAGE_ROLES; not system roles; comes off its holders)
 *   POST   /api/brothers/[id]/roles            RoleGranted             (201; MANAGE_ROLES; body { roleId }; 409 = already held)
 *   DELETE /api/brothers/[id]/roles/[roleId]   204                     (MANAGE_ROLES; idempotent)
 *   GET    /api/auth/accounts                  AccountRow[]            (Settings → Accounts and Roles; any member)
 *   PATCH  /api/auth/accounts/[id]             AdminChanged            (platform admins; body { isAdmin }; not your own key)
 *   DELETE /api/brothers/[id]                  204                     (MANAGE_BROTHERS; not yourself; erases this org's rows only)
 *   GET    /api/invites                        InviteRow[]             (MANAGE_SETTINGS; ?include=all adds revoked/expired/full)
 *   POST   /api/invites                        InviteRow               (201; MANAGE_SETTINGS; body createInviteInput)
 *   DELETE /api/invites/[id]                   204                     (MANAGE_SETTINGS; revoke)
 *   GET    /api/invites/[id]/redemptions       InviteRedemption[]      (MANAGE_SETTINGS)
 *   PATCH  /api/orgs/config                    OrgConfigSaved          (MANAGE_SETTINGS; body updateOrgConfigInput; Identity sends instagramHandle / vocabularyOverrides, Workflows enabledWorkflows + disabledFeatures (+ navOrder), Thresholds thresholds)
 *   GET    /api/metrics/definitions            MetricDefinition[]      (every member; live ones only)
 *   POST   /api/metrics/definitions            MetricDefinition        (201; MANAGE_SETTINGS; body createMetricDefinitionInput; at most 20)
 *   PATCH  /api/metrics/definitions/[id]       MetricDefinition        (MANAGE_SETTINGS; body updateMetricDefinitionInput; the slug never changes)
 *   DELETE /api/metrics/definitions/[id]       204                     (MANAGE_SETTINGS; soft: recorded values are kept)
 *   POST   /api/orgs/logo                      OrgLogoSaved            (MANAGE_SETTINGS; multipart `file`, image ≤ 2 MB)
 *   DELETE /api/orgs/logo                      OrgLogoSaved            (MANAGE_SETTINGS; clears the icon; logoUrl null)
 *   GET    /api/instagram                      InstagramPost[]         (everyone with the communications workflow)
 *   POST   /api/instagram                      InstagramPost           (201; MANAGE_INSTAGRAM; body createInstagramTaskInput)
 *   PATCH  /api/instagram/[id]                 InstagramPost           (MANAGE_INSTAGRAM; body updateInstagramTaskInput; status "posted" = Mark posted)
 *   DELETE /api/instagram/[id]                 204                     (MANAGE_INSTAGRAM)
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
 *   POST   /api/tasks                          Task                    (201; MANAGE_TASKS; body createTaskInput)
 *   PATCH  /api/tasks/[id]                     Task                    (an assignee may tick it; MANAGE_TASKS edits anything)
 *   DELETE /api/tasks/[id]                     204                     (MANAGE_TASKS)
 *   GET    /api/polls                          Poll[]
 *   POST   /api/polls/[id]/vote                Poll
 *   POST   /api/polls                          Poll                    (201; MANAGE_POLLS; body createPollInput)
 *   PATCH  /api/polls/[id]                     Poll                    (MANAGE_POLLS: edit, close/reopen)
 *   DELETE /api/polls/[id]                     204                     (MANAGE_POLLS)
 *   GET    /api/service-events                 ServiceEvent[]
 *   GET    /api/service-participation          ServiceParticipationRow[] (whole org; filter brotherId for "my hours")
 *   GET    /api/service-events/[id]/participation ServiceParticipationRow[]
 *   POST   /api/service-events/[id]/participation/me ServiceParticipationRow[] (body logMyParticipationInput; DELETE undoes)
 *   POST   /api/service-events                 ServiceEvent            (201; MANAGE_SERVICE; body createServiceEventInput)
 *   PATCH  /api/service-events/[id]            ServiceEvent            (MANAGE_SERVICE; body updateServiceEventInput)
 *   DELETE /api/service-events/[id]            204                     (MANAGE_SERVICE; its hours go with it)
 *   POST   /api/service-events/[id]/participation ServiceParticipationRow[] (201; MANAGE_SERVICE; body logParticipationInput, the event's sheet after)
 *   DELETE /api/service-participation/[id]     204                     (MANAGE_SERVICE)
 *   GET    /api/fundraisers                    Fundraiser[]            (read-only for members)
 *   GET    /api/fundraisers/[id]               Fundraiser
 *   POST   /api/fundraisers                    Fundraiser              (201; MANAGE_FUNDRAISING; body createFundraiserInput; makes its Timeline entry)
 *   PATCH  /api/fundraisers/[id]               Fundraiser              (MANAGE_FUNDRAISING; body updateFundraiserInput)
 *   DELETE /api/fundraisers/[id]               204                     (MANAGE_FUNDRAISING; takes its Timeline entry)
 *   POST   /api/fundraisers/[id]/supplies      Fundraiser              (201; MANAGE_FUNDRAISING; body addSupplyInput, the fundraiser after)
 *   PATCH  /api/fundraisers/[id]/supplies/[supplyId] Fundraiser        (MANAGE_FUNDRAISING; body updateSupplyInput)
 *   DELETE /api/fundraisers/[id]/supplies/[supplyId] Fundraiser        (MANAGE_FUNDRAISING; the fundraiser after)
 *   POST   /api/fundraisers/[id]/wrap          Fundraiser              (MANAGE_FUNDRAISING; body wrapFundraiserInput: the came-in total)
 *   DELETE /api/fundraisers/[id]/wrap          Fundraiser              (MANAGE_FUNDRAISING; reopens it)
 *   GET    /api/docs                           Doc[]                   (read-only for members)
 *   GET    /api/docs/folders                   DocFolder[]
 *   POST   /api/docs                           DocSaved                (201; MANAGE_DOCS; body createDocInput)
 *   PATCH  /api/docs/[id]                      DocSaved                (MANAGE_DOCS; body updateDocInput)
 *   DELETE /api/docs/[id]                      204                     (MANAGE_DOCS)
 *   PATCH  /api/docs/[id]/move                 DocSaved                (MANAGE_DOCS; body moveDocInput, null = Unfiled)
 *   PATCH  /api/docs/[id]/pin                  DocSaved                (MANAGE_DOCS; body pinInput)
 *   POST   /api/docs/refresh-metadata          DocSaved                (MANAGE_DOCS; body { id })
 *   POST   /api/docs/folders                   DocFolder               (201; MANAGE_DOCS; body createFolderInput)
 *   PATCH  /api/docs/folders/[id]              DocFolder               (MANAGE_DOCS; body renameFolderInput)
 *   DELETE /api/docs/folders/[id]              204                     (MANAGE_DOCS; its docs return to Unfiled)
 *   PATCH  /api/docs/folders/[id]/pin          DocFolder               (MANAGE_DOCS; body pinInput)
 *   GET    /api/activity                       ActivityEntry[]
 *   GET    /api/announcement                   Announcement            (null = no pinned note)
 *   PUT    /api/announcement                   Announcement            (MANAGE_ANNOUNCEMENTS; body upsertAnnouncementInput)
 *   POST   /api/ai/chat                        SSE: ChatStreamEvents   (or ChatAvailability JSON when off)
 *   GET    /api/ai/chat                        ChatAvailability        (files/fileLimits present when attachments are on)
 *   GET    /api/ai/peek?type=&id=              PeekCard                (an answer row's record; type: member|event|task|transaction)
 *   POST   /api/ai/attachments                 ChatAttachmentInfo      (multipart `file` + `threadId`; 400 → details.code)
 *   GET    /api/ai/attachments?threadId=       ChatAttachmentInfo[]    (DELETE ?threadId= → { ok, removed })
 *   DELETE /api/ai/attachments/[id]            { ok: true }
 *   GET    /api/ai/attachments/[id]/units/[ref] AttachmentUnit         (ref: p7, s2, l3, sh1, sh1!B2:D9)
 *   GET    /api/treasury                       TreasuryData
 *   GET    /api/transactions                   Transaction[]
 *   POST   /api/transactions                   Transaction             (201; MANAGE_TREASURY; body createTransactionInput)
 *   PATCH  /api/transactions/[id]              Transaction             (MANAGE_TREASURY; body updateTransactionInput)
 *   DELETE /api/transactions/[id]              204                     (MANAGE_TREASURY; soft delete)
 *   GET    /api/treasury/categories            TransactionCategory[]   (every member; hidden ones included)
 *   PATCH  /api/treasury/settings              TreasurySettings        (MANAGE_TREASURY; body { openingBalance }: opens the books)
 *   GET    /api/transactions/export            text/csv                (MANAGE_TREASURY; ?semester=<label>; the app shares the text)
 *   GET    /api/semesters                      SemesterRow[]           (every member; newest first)
 *   POST   /api/semesters                      SemesterRow             (201; MANAGE_SEMESTERS; body createSemesterInput; the new one becomes active)
 *   PATCH  /api/semesters/[id]                 SemesterRow             (MANAGE_SEMESTERS; no body = make it active; body updateSemesterInput + activate: false = fix its label/dates)
 *   GET    /api/reimbursements                 Reimbursement[]
 *   POST   /api/reimbursements                 Reimbursement           (201; body createReimbursementInput; your own, or anyone's with treasury)
 *   PATCH  /api/reimbursements/[id]            Reimbursement           (MANAGE_TREASURY; body updateReimbursementInput, the app sends { status: "approved" | "rejected" })
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
export type * from "./media";
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
export type * from "./dashboard";
export type * from "./settings";
