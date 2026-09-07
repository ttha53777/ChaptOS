/**
 * Coverage for the live check-in window.
 *
 * The load-bearing assertion here is that CLOSING the window is what makes the
 * numbers true. lib/attendance.ts computes a member's denominator from the
 * AttendanceRecord rows that EXIST, so a member with no row is not counted
 * absent — they are not counted at all. If only the people who tap "I'm here"
 * ever got rows, every ratio in the chapter would read 100%.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, rosterOf } from "../setup/factories";
import { db } from "@/lib/db";
import {
  closeCheckIn,
  getLiveCheckIn,
  getLiveRoster,
  openCheckIn,
  recordAttendance,
  reopenCheckIn,
  selfCheckIn,
  undoSelfCheckIn,
} from "@/lib/services/attendance-service";
import { CHECKIN_WINDOW_MS } from "@/lib/checkin";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

// MANAGE_ATTENDANCE is enforced at the route, not the service, so permissions
// stay 0 here — these tests exercise the service's own guards.
function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId,
    actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0,
    isOrgAdmin: true, isPlatformAdmin: false,
    db: db(orgId),
  };
}

async function scenario() {
  const org = await createOrg("Check Org", "check-org");
  const officer = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Officer" });
  const present = await createBrother({ orgId: org.id, name: "Present" });
  const absent = await createBrother({ orgId: org.id, name: "Absent" });
  const semester = await createSemester({ orgId: org.id, isActive: true });
  const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
  return { org, officer, present, absent, semester, event };
}

describe("live check-in window", () => {
  it("closing records the no-shows as absent and moves the ratios", async () => {
    const { org, officer, present, absent, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);
    await selfCheckIn(officerCtx, event.id);

    // Before the close, the absent member has NO row at all — which is exactly
    // why the close matters: no row means no denominator, not an absence.
    expect(await testPrisma.attendanceRecord.count({
      where: { calendarEventId: event.id, brotherId: absent.id },
    })).toBe(0);

    await closeCheckIn(officerCtx, event.id);

    const rows = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    expect(rows).toHaveLength(3);
    const byBrother = new Map(rows.map(r => [r.brotherId, r.attended]));
    expect(byBrother.get(present.id)).toBe(true);
    expect(byBrother.get(officer.id)).toBe(true);
    expect(byBrother.get(absent.id)).toBe(false);

    // The recalc handler fired off attendance.recorded, so the roster numbers
    // must actually have moved — 100% for the two who showed, 0% for the one
    // who didn't.
    expect((await rosterOf(present.id, org.id))?.attendance).toBe(100);
    expect((await rosterOf(absent.id, org.id))?.attendance).toBe(0);
  });

  it("reopening deletes the absences it created and reverts the ratios", async () => {
    const { org, officer, present, absent, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);
    await closeCheckIn(officerCtx, event.id);
    expect((await rosterOf(absent.id, org.id))?.attendance).toBe(0);

    await reopenCheckIn(officerCtx, event.id);

    const rows = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    // Only the genuine check-in survives; the absence rows are gone.
    expect(rows).toHaveLength(1);
    expect(rows[0].brotherId).toBe(present.id);
    expect(rows[0].attended).toBe(true);

    // With no row, the absent member is out of the denominator again.
    expect((await rosterOf(absent.id, org.id))?.attendance).toBe(0);
    expect((await rosterOf(present.id, org.id))?.attendance).toBe(100);

    // And the window accepts check-ins again.
    const live = await getLiveCheckIn(officerCtx);
    expect(live?.state).toBe("open");
  });

  // openCheckIn no longer ends in getLiveCheckIn() — it assembles the answer
  // from the same batch of reads that backs the write, so the officer's tap
  // costs one round of queries instead of two. These pin the assembled payload
  // to what a fresh read of the same window would have said, which is the whole
  // correctness burden that shortcut takes on.

  it("the window it returns matches a fresh read of the same window", async () => {
    const { org, officer, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    const returned = await openCheckIn(officerCtx, event.id);
    const read = await getLiveCheckIn(officerCtx);

    // openedAt/msRemaining drift by the milliseconds between the two calls;
    // everything else must agree exactly.
    expect(read).not.toBeNull();
    expect(returned!.event).toEqual(read!.event);
    expect(returned!.state).toBe(read!.state);
    expect(returned!.presentCount).toBe(read!.presentCount);
    expect(returned!.eligibleCount).toBe(read!.eligibleCount);
    expect(returned!.me).toEqual(read!.me);
    expect(returned!.closedAt).toBe(read!.closedAt);
    expect(returned!.closedByName).toBe(read!.closedByName);
  });

  it("its eligible count drops approved excuses and exempt members", async () => {
    const { org, officer, present, absent, semester, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await testPrisma.attendanceExcuse.create({
      data: {
        calendarEventId: event.id, brotherId: absent.id,
        semesterId: semester.id, status: "approved", reason: "Away",
      },
    });
    await testPrisma.attendanceExemption.create({
      // AttendanceExemption, unlike AttendanceExcuse, does carry an org column.
      data: { organizationId: org.id, brotherId: present.id, semesterId: semester.id },
    });

    // Three on the roster, two accounted for another way — so the denominator
    // the band shows the room is 1, not 3. A hardcoded roster count here would
    // have the officer reading a target nobody can hit.
    const live = await openCheckIn(officerCtx, event.id);
    expect(live!.eligibleCount).toBe(1);
    expect(live!.presentCount).toBe(0);
  });

  it("reopening returns the tally it already had, not a zeroed one", async () => {
    const { org, officer, present, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);
    await closeCheckIn(officerCtx, event.id);

    // openCheckIn also REOPENS (it clears checkInClosedAt), and a reopened
    // window carries the records from before the close. Assuming presentCount
    // is 0 because the window is "new" would blank a tally mid-meeting.
    const live = await openCheckIn(officerCtx, event.id);
    expect(live!.state).toBe("open");
    expect(live!.closedAt).toBeNull();
    expect(live!.presentCount).toBe(1);
  });

  it("reports the actor's own state rather than assuming it is blank", async () => {
    const { org, officer, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(officerCtx, event.id);
    await closeCheckIn(officerCtx, event.id);

    // The officer reopening is themself already checked in. `me` is derived,
    // not defaulted, so the band shows them their receipt instead of asking an
    // already-present officer to check in again.
    const live = await openCheckIn(officerCtx, event.id);
    expect(live!.me.checkedIn).toBe(true);
    expect(live!.me.checkedInAt).not.toBeNull();
  });

  it("a double tap is idempotent, not a conflict", async () => {
    const { org, officer, present, event } = await scenario();
    await openCheckIn(ctxFor(org.id, officer.id), event.id);
    const memberCtx = ctxFor(org.id, present.id);

    await selfCheckIn(memberCtx, event.id);
    await expect(selfCheckIn(memberCtx, event.id)).resolves.toBeTruthy();

    expect(await testPrisma.attendanceRecord.count({
      where: { calendarEventId: event.id, brotherId: present.id },
    })).toBe(1);
  });

  it("refuses a check-in when the window was never opened", async () => {
    const { org, present, event } = await scenario();
    await expect(selfCheckIn(ctxFor(org.id, present.id), event.id))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a check-in after the window is closed", async () => {
    const { org, officer, present, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);
    await openCheckIn(officerCtx, event.id);
    await closeCheckIn(officerCtx, event.id);

    await expect(selfCheckIn(ctxFor(org.id, present.id), event.id))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a check-in once the window has aged out", async () => {
    const { org, officer, present, event } = await scenario();
    await openCheckIn(ctxFor(org.id, officer.id), event.id);
    // Backdate past the auto-expiry. An expired window reads as closed without
    // any write, so check-in stops even though nobody closed it.
    await testPrisma.calendarEvent.update({
      where: { id: event.id },
      data: { checkInOpenedAt: new Date(Date.now() - CHECKIN_WINDOW_MS - 1000) },
    });

    await expect(selfCheckIn(ctxFor(org.id, present.id), event.id))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("an approved excuse blocks check-in, a pending one does not", async () => {
    const { org, officer, present, absent, semester, event } = await scenario();
    await openCheckIn(ctxFor(org.id, officer.id), event.id);

    await testPrisma.attendanceExcuse.create({
      data: { calendarEventId: event.id, brotherId: absent.id, semesterId: semester.id,
              reason: "Away", status: "approved" },
    });
    await testPrisma.attendanceExcuse.create({
      data: { calendarEventId: event.id, brotherId: present.id, semesterId: semester.id,
              reason: "Maybe away", status: "pending" },
    });

    await expect(selfCheckIn(ctxFor(org.id, absent.id), event.id))
      .rejects.toBeInstanceOf(ConflictError);

    // A pending excuse may yet be rejected, in which case they still needed to
    // be in the room — so it must not stand in the way of showing up.
    await expect(selfCheckIn(ctxFor(org.id, present.id), event.id)).resolves.toBeTruthy();
  });

  it("undo removes the actor's own row while the window is open", async () => {
    const { org, officer, present, event } = await scenario();
    await openCheckIn(ctxFor(org.id, officer.id), event.id);
    const memberCtx = ctxFor(org.id, present.id);

    await selfCheckIn(memberCtx, event.id);
    await undoSelfCheckIn(memberCtx, event.id);

    expect(await testPrisma.attendanceRecord.count({
      where: { calendarEventId: event.id, brotherId: present.id },
    })).toBe(0);
  });

  it("an officer's roll does NOT erase self-check-ins", async () => {
    // The regression the recordAttendance merge exists to prevent: the old
    // deleteMany spanned every eligible member, so an officer opening the sheet
    // to correct one person wiped every member's own check-in.
    const { org, officer, present, absent, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);

    // The officer submits the sheet marking only the late arrival present.
    await recordAttendance(officerCtx, { calendarEventId: event.id, attendedIds: [present.id, absent.id] });

    const rows = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    const byBrother = new Map(rows.map(r => [r.brotherId, r.attended]));
    expect(byBrother.get(present.id)).toBe(true);   // the self-check-in survived
    expect(byBrother.get(absent.id)).toBe(true);
    expect(byBrother.get(officer.id)).toBe(false);
  });

  it("getLiveCheckIn reports the room filling up and returns null when idle", async () => {
    const { org, officer, present, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    expect(await getLiveCheckIn(officerCtx)).toBeNull();

    await openCheckIn(officerCtx, event.id);
    let live = await getLiveCheckIn(officerCtx);
    expect(live?.state).toBe("open");
    expect(live?.presentCount).toBe(0);
    expect(live?.eligibleCount).toBe(3);
    expect(live?.me.checkedIn).toBe(false);

    await selfCheckIn(ctxFor(org.id, present.id), event.id);
    live = await getLiveCheckIn(ctxFor(org.id, present.id));
    expect(live?.presentCount).toBe(1);
    expect(live?.me.checkedIn).toBe(true);
    expect(live?.me.checkedInAt).toBeTruthy();

    await closeCheckIn(officerCtx, event.id);
    live = await getLiveCheckIn(officerCtx);
    expect(live?.state).toBe("closed");
    expect(live?.closedByName).toBe("Officer");
  });
});

/**
 * The "Who's here" sheet.
 *
 * These all guard ONE property: the sheet's rows must add up to the tally on
 * the card that opened it. A member who counts the list and gets a different
 * number than the band shows has been told the room is a different size than
 * it is, and there is no way for them to tell which number is the lie.
 */
describe("getLiveRoster", () => {
  it("splits the roster into here and not-here, and matches the card's counts", async () => {
    const { org, officer, present, absent, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);

    const live = await getLiveCheckIn(officerCtx);
    const { attendees } = await getLiveRoster(officerCtx, event.id);

    const here = attendees.filter(a => a.present);
    expect(here.map(a => a.name)).toEqual(["Present"]);
    expect(here[0].at).toBeTruthy();

    // The invariant. Both sides are computed independently, so this fails the
    // moment either eligibility rule drifts from the other.
    expect(here.length).toBe(live!.presentCount);
    expect(attendees.length).toBe(live!.eligibleCount);

    const notHere = attendees.filter(a => !a.present).map(a => a.name).sort();
    expect(notHere).toEqual(["Absent", "Officer"]);
    expect(attendees.every(a => a.at === null || a.present)).toBe(true);
    expect(attendees.find(a => a.name === "Absent")!.brotherId).toBe(absent.id);
  });

  it("keeps archived members in the list, because they are in the denominator", async () => {
    const { org, officer, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);
    await createBrother({ orgId: org.id, name: "Archived", archivedAt: new Date() });

    await openCheckIn(officerCtx, event.id);
    const live = await getLiveCheckIn(officerCtx);
    const { attendees } = await getLiveRoster(officerCtx, event.id);

    // ctx.db.member.listIds() excludes only ghosts, so an archived member counts
    // toward eligibleCount. The sheet must list them or the rows come up short.
    expect(attendees.map(a => a.name)).toContain("Archived");
    expect(attendees.length).toBe(live!.eligibleCount);
  });

  it("excludes ghosts, which are not on the roster at all", async () => {
    const { org, officer, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);
    await createBrother({ orgId: org.id, name: "Ghost", isGhost: true });

    await openCheckIn(officerCtx, event.id);
    const live = await getLiveCheckIn(officerCtx);
    const { attendees } = await getLiveRoster(officerCtx, event.id);

    expect(attendees.map(a => a.name)).not.toContain("Ghost");
    expect(attendees.length).toBe(live!.eligibleCount);
  });

  it("shows an approved excuse as excused, not present, even if a record says otherwise", async () => {
    const { org, officer, present, semester, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await openCheckIn(officerCtx, event.id);
    await selfCheckIn(ctxFor(org.id, present.id), event.id);

    // The order that makes this reachable: they checked in, THEN an officer
    // approved an excuse. selfCheckIn refuses the reverse order.
    await testPrisma.attendanceExcuse.create({
      data: {
        // No organizationId: AttendanceExcuse has no org column. Tenancy comes
        // from the event and the org's active semester (see the note on
        // summarizeAttendance).
        calendarEventId: event.id, brotherId: present.id,
        semesterId: semester.id, status: "approved", reason: "Away",
      },
    });

    const live = await getLiveCheckIn(officerCtx);
    const { attendees } = await getLiveRoster(officerCtx, event.id);
    const row = attendees.find(a => a.brotherId === present.id)!;

    expect(row.excused).toBe(true);
    expect(row.present).toBe(false);   // the excuse wins over the stale record
    expect(row.at).toBeNull();
    expect(attendees.filter(a => a.present).length).toBe(live!.presentCount);

    // The one place the sheet is deliberately LONGER than the denominator: an
    // excused member is listed (so you can see they're accounted for) but is
    // out of eligibleCount. The sheet's summary line splits them out for
    // exactly this reason — rows = eligible + excused, and nothing else.
    const excusedCount = attendees.filter(a => a.excused).length;
    expect(excusedCount).toBe(1);
    expect(attendees.length).toBe(live!.eligibleCount + excusedCount);
  });

  it("drops semester-exempt members, who are not expected at all", async () => {
    const { org, officer, semester, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);
    const exempt = await createBrother({ orgId: org.id, name: "Exempt" });
    await testPrisma.attendanceExemption.create({
      data: { organizationId: org.id, brotherId: exempt.id, semesterId: semester.id },
    });

    await openCheckIn(officerCtx, event.id);
    const live = await getLiveCheckIn(officerCtx);
    const { attendees } = await getLiveRoster(officerCtx, event.id);

    // Listing them under "not here yet" would be a standing false accusation.
    expect(attendees.map(a => a.name)).not.toContain("Exempt");
    expect(attendees.length).toBe(live!.eligibleCount);
  });

  it("is org-scoped and refuses an event that was never opened", async () => {
    const { org, officer, event } = await scenario();
    const officerCtx = ctxFor(org.id, officer.id);

    await expect(getLiveRoster(officerCtx, event.id)).rejects.toThrow(ValidationError);

    const other = await createOrg("Other Org", "other-org");
    const otherOfficer = await createBrother({ orgId: other.id, name: "Outsider" });
    await createSemester({ orgId: other.id, isActive: true });
    await openCheckIn(officerCtx, event.id);

    // The event belongs to another org, so it must not resolve at all.
    await expect(
      getLiveRoster(ctxFor(other.id, otherOfficer.id), event.id),
    ).rejects.toThrow(NotFoundError);
  });
});
