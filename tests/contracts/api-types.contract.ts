/**
 * API contract: what the server actually returns must fit lib/api-types.
 *
 * Type-level only — never imported, never run. `tsc --noEmit` checks it like any
 * other file (tsconfig includes **\/*.ts) and vitest ignores it (not *.test.ts),
 * so a service whose return shape drifts from the shared wire type fails the
 * type check, naming the field.
 *
 * Each check models the trip over the wire:
 *   Wire<T>   — what JSON.stringify makes of the server value: Date → string,
 *               toJSON() honored, functions dropped.
 *   Widen<T>  — the shared type with literal unions relaxed to their primitive
 *               ("open" | "done" → string). Prisma hands back status columns as
 *               plain `string`; the DB's CHECK constraints (lib/state) are what
 *               pin the literal set. Everything else — field presence, null vs
 *               absent, primitive kind, nesting — is checked exactly.
 *
 * Routes that build their body inline are checked where they're written, with
 * `satisfies` (/api/auth/me, /api/treasury, /api/auth/avatar, /api/auth/terms,
 * /api/auth/invite-status, /api/auth/request-join, /api/auth/join-status,
 * /api/orgs/leave, /api/attendance/[eventId], /api/calendar/[id]/details), and the chat stream's send() is typed against ChatStreamEvents.
 */
import type {
  ActivityEntry, Brother, DashboardResponse, CalEventType, CalendarEvent, DuesBoard, DuesChargeIssued, DuesChargePreview, DuesWaived, LiveCheckIn, MemberDuesBook, MemberProfile,
  MyAttendance, MyExcuseItem, OwnJoinRequest, Poll, Reimbursement, Task, TaskDetail, Transaction, TransactionCategory,
  ServiceEvent, ServiceParticipationRow, Fundraiser, Doc, DocFolder, MeetingSummary, MeetingSummaryBody, CalendarSubscriptionView, CalendarFeedLive,
  HomeResponse, MemberUpdated, MobileConfig, JoinRequestPage, JoinRequestApproved,
  AttendanceSummaryRow, ExcuseListItem, ExcuseDecided, EventDeletePreview, AgendaTemplate, MeetingSummarized, MinutesSaved,
  ProgrammingEvent, ProgrammingDoc, RoleChip, Party, PartyRollRow, InstagramPost,
  ChatAttachmentInfo, AttachmentUnit, DatedShape, LogbookShape, PastDueShape, RankedShape, TableShape, RollShape, YesNoShape, StatusShape, RecordShape, ZeroShape, PeekCard,
} from "@/lib/api-types";
import type { datedFromThings, logbookFromRecords, pastDueFromTasks } from "@/lib/ai-shapes-calendar";
import type { recordFromCards, zeroFromCounts } from "@/lib/ai-shapes-lookup";
import type { getPeek } from "@/lib/services/peek-service";
import type { yesnoFromJudged, statusFromTasks } from "@/lib/ai-shapes-judge";
import type { rankedFromMembers, rankedFromEvents, tableFromMembers, rollFromPeople } from "@/lib/ai-shapes-people";
import type { listAttachments, uploadAttachment, getAttachmentUnit } from "@/lib/services/chat-attachment-service";
import type { listVisibleBrothers, getMemberProfile } from "@/lib/services/brother-service";
import type { approveJoinRequest, listPendingRequestPage } from "@/lib/services/join-request-service";
import type { publicBrother } from "@/lib/brother-avatar";
import type { createTask, getTaskDetail, listTasks, updateTask } from "@/lib/services/task-service";
import type { listPolls, castVote, createPoll, updatePoll } from "@/lib/services/poll-service";
import type { listCalendar, previewDeleteCalendar, updateCalendar } from "@/lib/services/calendar-service";
import type { listAgendaTemplates } from "@/lib/services/agenda-template-service";
import type { summarizeMeeting } from "@/lib/services/meeting-summary-service";
import type { listEventTypes } from "@/lib/services/calendar-event-type-service";
import type { getLiveCheckIn, listMyAttendance, selfCheckIn, undoSelfCheckIn, summarizeAttendance, openCheckIn, closeCheckIn, reopenCheckIn, cancelCheckIn, restoreCheckIn } from "@/lib/services/attendance-service";
import type { listMyExcuses, listExcuses, decideExcuse } from "@/lib/services/excuse-service";
import type { listRecentActivity } from "@/lib/services/activity-service";
import type { listOwnJoinRequests } from "@/lib/auth/own-join-status";
import type { createTransaction, listTransactions, updateTransaction } from "@/lib/services/transaction-service";
import type { createReimbursement, listReimbursements, updateReimbursement } from "@/lib/services/reimbursement-service";
import type { listTransactionCategories } from "@/lib/services/transaction-category-service";
import type { listServiceEvents } from "@/lib/services/service-event-service";
import type { listParticipationForOrg, listParticipationForEvent, logMyParticipation, removeMyParticipation } from "@/lib/services/service-participation-service";
import type { listFundraisers, getFundraiser } from "@/lib/services/fundraiser-service";
import type { listDocs } from "@/lib/services/doc-service";
import type { listProgrammingTasks, createProgrammingTask, updateProgrammingTask, setStage, listProgrammingEventDocs, attachProgrammingDoc } from "@/lib/services/programming-service";
import type { listRoles } from "@/lib/services/role-service";
import type { listInstagramTasks, createInstagramTask, updateInstagramTask } from "@/lib/services/instagram-service";
import type { listParties, createParty, updateParty, wrapUpParty, summarizePartyAttendance } from "@/lib/services/party-service";
import type { listFolders } from "@/lib/services/doc-folder-service";
import type { getMeetingSummary, setActionItemDone } from "@/lib/services/meeting-summary-service";
import type { calendarFeedLive, getCalendarSubscription } from "@/lib/services/calendar-subscription-service";
import type { getHome } from "@/lib/services/home-service";
import type { getDashboard } from "@/lib/services/dashboard-service";
import type { updateBrother } from "@/lib/services/brother-service";
import type { mobileConfig } from "@/lib/mobile-config";
import type { getDuesBoard, getMemberDuesBook, issueDuesCharge, previewDuesCharge, voidDuesWaiver, waiveDues } from "@/lib/services/dues-charge-service";

type Fn = (...args: never[]) => unknown;

type Wire<T> =
  T extends Date ? string
  : T extends string | number | boolean | null | undefined ? T
  : T extends Fn ? never
  : T extends { toJSON(): infer J } ? Wire<J>
  : T extends readonly (infer U)[] ? Wire<U>[]
  : T extends object ? { [K in keyof T as T[K] extends Fn ? never : K]: Wire<T[K]> }
  : never;

type Widen<T> =
  T extends string ? string
  : T extends number ? number
  : T extends boolean ? boolean
  : T extends null | undefined ? T
  : T extends readonly (infer U)[] ? Widen<U>[]
  : T extends object ? { [K in keyof T]: Widen<T[K]> }
  : T;

/** The JSON a route answers when it returns `await fn(...)` verbatim. */
type Served<F extends Fn> = Wire<Awaited<ReturnType<F>>>;

declare function served<T>(): T;

// GET /api/brothers — listVisibleBrothers → hydrateBrotherAvatars (same rows) → publicBrother
type RosterRow = Awaited<ReturnType<typeof listVisibleBrothers>>[number];
export const brothers: Widen<Brother[]> = served<Wire<ReturnType<typeof publicBrother<RosterRow>>[]>>();
export const memberProfile: Widen<MemberProfile> = served<Served<typeof getMemberProfile>>();

export const tasks: Widen<Task[]> = served<Served<typeof listTasks>>();
export const taskUpdate: Widen<Task> = served<Served<typeof updateTask>>();
export const taskCreated: Widen<Task> = served<Served<typeof createTask>>();
export const taskDetail: Widen<TaskDetail> = served<Served<typeof getTaskDetail>>();

export const polls: Widen<Poll[]> = served<Served<typeof listPolls>>();
export const pollCreated: Widen<Poll> = served<Served<typeof createPoll>>();
export const pollUpdate: Widen<Poll> = served<Served<typeof updatePoll>>();
export const vote: Widen<Poll> = served<Served<typeof castVote>>();

export const calendar: Widen<CalendarEvent[]> = served<Served<typeof listCalendar>>();
export const eventTypes: Widen<CalEventType[]> = served<Served<typeof listEventTypes>>();

export const liveCheckIn: Widen<LiveCheckIn | null> = served<Served<typeof getLiveCheckIn>>();
export const checkIn: Widen<LiveCheckIn | null> = served<Served<typeof selfCheckIn>>();
export const undoCheckIn: Widen<LiveCheckIn | null> = served<Served<typeof undoSelfCheckIn>>();
export const myAttendance: Widen<MyAttendance> = served<Served<typeof listMyAttendance>>();
export const myExcuses: Widen<MyExcuseItem[]> = served<Served<typeof listMyExcuses>>();

// Meetings: the phone's officer tools.
export const attendanceSummary: Widen<AttendanceSummaryRow[]> = served<Served<typeof summarizeAttendance>>();
export const windowOpened: Widen<LiveCheckIn | null> = served<Served<typeof openCheckIn>>();
export const windowClosed: Widen<LiveCheckIn | null> = served<Served<typeof closeCheckIn>>();
export const windowReopened: Widen<LiveCheckIn | null> = served<Served<typeof reopenCheckIn>>();
export const windowCancelled: Widen<LiveCheckIn | null> = served<Served<typeof cancelCheckIn>>();
export const windowRestored: Widen<LiveCheckIn | null> = served<Served<typeof restoreCheckIn>>();
export const excuseList: Widen<ExcuseListItem[]> = served<Served<typeof listExcuses>>();
export const excuseDecided: Widen<ExcuseDecided> = served<Served<typeof decideExcuse>>();
export const eventDeletePreview: Widen<EventDeletePreview> = served<Served<typeof previewDeleteCalendar>>();
export const agendaTemplates: Widen<AgendaTemplate[]> = served<Served<typeof listAgendaTemplates>>();
export const meetingSummarized: Widen<MeetingSummarized> = served<Served<typeof summarizeMeeting>>();
// The minutes autosave reads these off the PATCH answer (the rest of the row rides along).
export const minutesSaved: Widen<MinutesSaved> = served<Served<typeof updateCalendar>>();

export const activity: Widen<ActivityEntry[]> = served<Served<typeof listRecentActivity>>();
export const ownJoinRequests: Widen<OwnJoinRequest[]> = served<Served<typeof listOwnJoinRequests>>();

export const transactions: Widen<Transaction[]> = served<Served<typeof listTransactions>>();
export const transactionCreated: Widen<Transaction> = served<Served<typeof createTransaction>>();
export const transactionUpdated: Widen<Transaction> = served<Served<typeof updateTransaction>>();
export const reimbursements: Widen<Reimbursement[]> = served<Served<typeof listReimbursements>>();
export const reimbursementCreated: Widen<Reimbursement> = served<Served<typeof createReimbursement>>();
export const reimbursementUpdated: Widen<Reimbursement> = served<Served<typeof updateReimbursement>>();
export const categories: Widen<TransactionCategory[]> = served<Served<typeof listTransactionCategories>>();

export const duesBoard: Widen<DuesBoard> = served<Served<typeof getDuesBoard>>();
export const memberDuesBook: Widen<MemberDuesBook> = served<Served<typeof getMemberDuesBook>>();
export const duesChargePreview: Widen<DuesChargePreview> = served<Served<typeof previewDuesCharge>>();
export const duesChargeIssued: Widen<DuesChargeIssued> = served<Served<typeof issueDuesCharge>>();
export const duesWaived: Widen<DuesWaived> = served<Served<typeof waiveDues>>();
export const duesWaiverVoided: Widen<DuesWaived> = served<Served<typeof voidDuesWaiver>>();

export const serviceEvents: Widen<ServiceEvent[]> = served<Served<typeof listServiceEvents>>();
export const serviceParticipation: Widen<ServiceParticipationRow[]> = served<Served<typeof listParticipationForOrg>>();
export const serviceEventParticipation: Widen<ServiceParticipationRow[]> = served<Served<typeof listParticipationForEvent>>();
export const myServiceLogged: Widen<ServiceParticipationRow[]> = served<Served<typeof logMyParticipation>>();
export const myServiceRemoved: Widen<ServiceParticipationRow[]> = served<Served<typeof removeMyParticipation>>();

export const fundraisers: Widen<Fundraiser[]> = served<Served<typeof listFundraisers>>();
export const fundraiser: Widen<Fundraiser> = served<Served<typeof getFundraiser>>();

export const docs: Widen<Doc[]> = served<Served<typeof listDocs>>();

export const programming: Widen<ProgrammingEvent[]> = served<Served<typeof listProgrammingTasks>>();
export const programmingCreated: Widen<ProgrammingEvent> = served<Served<typeof createProgrammingTask>>();
export const programmingUpdated: Widen<ProgrammingEvent> = served<Served<typeof updateProgrammingTask>>();
export const programmingStaged: Widen<ProgrammingEvent> = served<Served<typeof setStage>>();
export const programmingDocs: Widen<ProgrammingDoc[]> = served<Served<typeof listProgrammingEventDocs>>();
export const programmingDocAttached: Widen<ProgrammingDoc> = served<Served<typeof attachProgrammingDoc>>();
export const parties: Widen<Party[]> = served<Served<typeof listParties>>();
export const partyCreated: Widen<Party> = served<Served<typeof createParty>>();
export const partyUpdated: Widen<Party> = served<Served<typeof updateParty>>();
export const partyWrapped: Widen<Party> = served<Served<typeof wrapUpParty>>();
export const partyRolls: Widen<PartyRollRow[]> = served<Served<typeof summarizePartyAttendance>>();
export const mediaPosts: Widen<InstagramPost[]> = served<Served<typeof listInstagramTasks>>();
export const mediaPostCreated: Widen<InstagramPost> = served<Served<typeof createInstagramTask>>();
export const mediaPostUpdated: Widen<InstagramPost> = served<Served<typeof updateInstagramTask>>();
export const roles: Widen<RoleChip[]> = served<Served<typeof listRoles>>();
export const docFolders: Widen<DocFolder[]> = served<Served<typeof listFolders>>();

export const meetingSummary: Widen<MeetingSummary> = served<Served<typeof getMeetingSummary>>();
export const actionItemToggled: Widen<MeetingSummaryBody> = served<Served<typeof setActionItemDone>>();
// ?view=member answers the base shape; the admin view only adds fields to it.
export const calendarSubscription: Widen<CalendarSubscriptionView> = served<Served<typeof getCalendarSubscription>>();
// The roster's join-requests band (Phase 4): the page the app pages through, and an approval.
export const joinRequestPage: Widen<JoinRequestPage> = served<Served<typeof listPendingRequestPage>>();
export const joinRequestApproved: Widen<JoinRequestApproved> = served<Served<typeof approveJoinRequest>>();
export const calendarFeedSummary: Widen<CalendarFeedLive> = served<Served<typeof calendarFeedLive>>();

export const home: Widen<HomeResponse> = served<Served<typeof getHome>>();
export const dashboard: Widen<DashboardResponse> = served<Served<typeof getDashboard>>();
export const memberUpdated: Widen<MemberUpdated> = served<Served<typeof updateBrother>>();
export const mobileConfigBody: MobileConfig = served<ReturnType<typeof mobileConfig>>();

export const chatAttachments: Widen<ChatAttachmentInfo[]> = served<Served<typeof listAttachments>>();
export const chatAttachmentUploaded: Widen<ChatAttachmentInfo> = served<Served<typeof uploadAttachment>>();
export const chatAttachmentUnit: Widen<AttachmentUnit> = served<Served<typeof getAttachmentUnit>>();

// POST /api/ai/chat `answer.shape` — each list form's pure builder, as sent.
type ShapeOf<F extends Fn> = NonNullable<Served<F>> extends { shape: infer S } ? S : never;
export const datedShape: Widen<DatedShape> = served<ShapeOf<typeof datedFromThings>>();
export const logbookShape: Widen<LogbookShape> = served<ShapeOf<typeof logbookFromRecords>>();
export const pastDueShape: Widen<PastDueShape> = served<ShapeOf<typeof pastDueFromTasks>>();
export const rankedShape: Widen<RankedShape> = served<ShapeOf<typeof rankedFromMembers>>();
export const rankedByDateShape: Widen<RankedShape> = served<ShapeOf<typeof rankedFromEvents>>();
export const tableShape: Widen<TableShape> = served<ShapeOf<typeof tableFromMembers>>();
export const rollShape: Widen<RollShape> = served<ShapeOf<typeof rollFromPeople>>();
export const yesnoShape: Widen<YesNoShape> = served<ShapeOf<typeof yesnoFromJudged>>();
export const statusShape: Widen<StatusShape> = served<ShapeOf<typeof statusFromTasks>>();
export const recordShape: Widen<RecordShape> = served<ShapeOf<typeof recordFromCards>>();
export const zeroShape: Widen<ZeroShape> = served<ShapeOf<typeof zeroFromCounts>>();
// GET /api/ai/peek, and every card inside a record answer.
export const peekCard: Widen<PeekCard> = served<Served<typeof getPeek>>();
