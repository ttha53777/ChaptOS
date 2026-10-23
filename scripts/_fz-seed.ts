// Throwaway seed for the isolated Fundraisers round trip (never the real DB).
// TEST_DATABASE_URL=…:54331/fz_dev tsx scripts/_fz-seed.ts
import { randomUUID } from "node:crypto";
import { testPrisma } from "../tests/setup/prisma";
import { createBrother, createOrg, createSemester } from "../tests/setup/factories";
import { ALL_WORKFLOWS } from "../lib/org-types";
import { PERMISSIONS } from "../lib/permissions";

const sup = (name: string, dollars: number) => ({ name, costCents: Math.round(dollars * 100) });

(async () => {
  if (!process.env.TEST_DATABASE_URL?.includes("54331")) throw new Error("refusing: not the throwaway DB");
  const org = await createOrg("Oozma Kappa", "ok-test");
  await testPrisma.organizationConfig.create({ data: { organizationId: org.id, enabledWorkflows: [...ALL_WORKFLOWS], onboardingCompletedAt: new Date() } as never });
  await createSemester({ orgId: org.id, label: "Fall 2026", isActive: true, startDate: "2026-08-15", endDate: "2026-12-15" });
  const names = ["Thalha Thabish", "Dev Okafor", "Leo Park"];
  const ids: Record<string, number> = {};
  for (const [i, n] of names.entries()) {
    const b = await createBrother({ orgId: org.id, name: n, isOrgAdmin: i === 0 });
    await testPrisma.brother.update({ where: { id: b.id }, data: { authUserId: randomUUID() } });
    ids[n] = b.id;
  }
  const chair = await testPrisma.role.create({ data: { organizationId: org.id, name: "Philanthropy chair", rank: 20, permissions: PERMISSIONS.MANAGE_FUNDRAISING } });
  await testPrisma.brotherRole.create({ data: { brotherId: ids["Dev Okafor"], roleId: chair.id, organizationId: org.id } });

  // The mock's term: four wrapped, one ready (Cookie sale), two coming up.
  const seed: { name: string; kind: string; date: string; place: string; goal: number | null; supplies: { name: string; costCents: number }[]; cameIn: number | null }[] = [
    { name: "Back-to-school car wash", kind: "wash", date: "2026-08-30", place: "Parking Lot B", goal: 400, supplies: [sup("Car soap", 14), sup("Sponges & towels", 12), sup("Buckets", 10), sup("Poster board", 6)], cameIn: 580 },
    { name: "Boba sale", kind: "drink", date: "2026-09-17", place: "Student Union", goal: 300, supplies: [sup("Tapioca pearls", 31.4), sup("Black tea", 16), sup("Oat + whole milk", 22.6), sup("Cups, lids, straws", 36), sup("Ice (6 bags)", 12)], cameIn: 505 },
    { name: "Bake sale on the quad", kind: "bake", date: "2026-09-27", place: "Main Quad", goal: null, supplies: [sup("Flour & sugar", 18.2), sup("Butter & eggs", 21), sup("Chocolate chips", 13.8), sup("Boxes & napkins", 13)], cameIn: 462 },
    { name: "Homecoming raffle", kind: "raffle", date: "2026-10-10", place: "Tailgate, Lot 4", goal: 150, supplies: [sup("Two $25 gift cards", 50), sup("Ticket roll", 7)], cameIn: 43 },
    { name: "Cookie sale", kind: "bake", date: "2026-10-20", place: "Library steps", goal: 200, supplies: [sup("Cookie dough (bulk)", 32), sup("Bags & ribbon", 10), sup("Napkins", 4)], cameIn: null },
    { name: "Halloween bake sale", kind: "bake", date: "2026-10-30", place: "Student Union", goal: 250, supplies: [sup("Pumpkin puree", 8), sup("Flour & sugar", 18)], cameIn: null },
    { name: "Fall car wash", kind: "wash", date: "2026-11-14", place: "Parking Lot B", goal: null, supplies: [], cameIn: null },
  ];
  const out: Record<string, { id: number; calendarEventId: number }> = {};
  for (const f of seed) {
    const ev = await testPrisma.calendarEvent.create({ data: { organizationId: org.id, title: f.name, date: f.date, category: "fundraising", mandatory: false, location: f.place } });
    const row = await testPrisma.fundraiser.create({ data: {
      organizationId: org.id, calendarEventId: ev.id, kind: f.kind, goalCents: f.goal == null ? null : f.goal * 100,
      cameInCents: f.cameIn == null ? null : f.cameIn * 100, wrappedAt: f.cameIn == null ? null : new Date(`${f.date}T23:00:00Z`),
      supplies: { create: f.supplies.map((s, i) => ({ organizationId: org.id, ...s, position: i })) },
    } });
    out[f.name] = { id: row.id, calendarEventId: ev.id };
  }
  console.log(JSON.stringify({ orgId: org.id, ids, fundraisers: out }));
  await testPrisma.$disconnect();
})();
