// Throwaway seed for the check-in cancel round trip (never the real DB).
import { randomUUID } from "node:crypto";
import { testPrisma } from "../tests/setup/prisma";
import { createBrother, createCalendarEvent, createOrg, createSemester } from "../tests/setup/factories";
import { TERMS_VERSION } from "../lib/terms";

(async () => {
  if (!process.env.TEST_DATABASE_URL?.includes("54333/figurints_e2e")) throw new Error("refusing: not the throwaway DB");
  const org = await createOrg("Oozma Kappa", "ok-test");
  await createSemester({ orgId: org.id, label: "FA26", isActive: true, startDate: "2026-08-15", endDate: "2026-12-15" });
  const names = ["Maya Rivera", "Dev Okafor", "Jordan Tao", "Leo Park", "Wes Thornton", "Tariq Aziz", "Zane Fowler",
    "Cyrus Pak", "Remy Dubois", "Priya Shah", "Owen Patel", "Aisha Khan", "Sam Ortiz", "Nia Cole"];
  const ids: Record<string, number> = {};
  for (const [i, n] of names.entries()) {
    const b = await createBrother({ orgId: org.id, name: n, isOrgAdmin: i === 0 });
    const authUserId = randomUUID();
    await testPrisma.brother.update({ where: { id: b.id }, data: { authUserId } });
    await testPrisma.termsAcceptance.create({ data: { authUserId, version: TERMS_VERSION, context: "prompt" } });
    ids[n] = b.id;
  }
  const today = new Date().toLocaleDateString("en-CA");
  const meeting = await createCalendarEvent({ orgId: org.id, title: "Chapter Meeting", date: today, mandatory: true });
  const wrong   = await createCalendarEvent({ orgId: org.id, title: "Philanthropy Planning", date: today, mandatory: true });
  await testPrisma.calendarEvent.updateMany({ where: { id: { in: [meeting.id, wrong.id] } }, data: { location: "Chapter Room" } });
  console.log(JSON.stringify({ orgId: org.id, ids, meeting: meeting.id, wrong: wrong.id }));
  await testPrisma.$disconnect();
})();
