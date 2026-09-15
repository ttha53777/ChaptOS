/** Local, disposable test-DB comparison. Does not benchmark OAuth/network time. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { randomUUID } from "node:crypto";

async function main() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set TEST_DATABASE_URL to the local figurints_test database");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/figurints_test") throw new Error("This benchmark is restricted to the local test database");
  process.env.DATABASE_URL = connectionString; process.env.DIRECT_URL = connectionString;
  const { ownJoinStatus } = await import("../lib/auth/own-join-status");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ emit: "event", level: "query" }] });
  let queries = 0;
  client.$on("query", () => queries++);
  const org = await client.organization.create({ data: { name: "Status benchmark", slug: `benchmark-${randomUUID()}` } });
  try {
    const invite = await client.orgInvite.create({ data: { organizationId: org.id, token: randomUUID() } });
    const account = randomUUID();
    await client.joinRequest.create({ data: { organizationId: org.id, inviteId: invite.id, authUserId: account, name: "Benchmark requester" } });
    // Original pending pre-flight query sequence (without Supabase getUser).
    async function previous() {
      await client.orgInvite.findUnique({ where: { token: invite.token }, select: { id: true, expiresAt: true, revokedAt: true, maxUses: true, _count: { select: { redemptions: true } }, organization: { select: { id: true, name: true, slug: true, logoUrl: true } } } });
      await client.membership.count({ where: { organizationId: org.id, brother: { is: { isGhost: false } } } });
      await client.brother.findUnique({ where: { authUserId: account }, select: { id: true } });
      await client.joinRequest.findUnique({ where: { organizationId_authUserId: { organizationId: org.id, authUserId: account } }, select: { status: true } });
    }
    const current = () => ownJoinStatus(account, org.slug, client);
    for (let i = 0; i < 3; i++) { await previous(); await current(); }
    const results = { previous: [] as number[], current: [] as number[] };
    const counts = { previous: [] as number[], current: [] as number[] };
    for (let i = 0; i < 30; i++) for (const [name, fn] of [["previous", previous], ["current", current]] as const) {
      queries = 0; const start = performance.now(); await fn();
      results[name].push(performance.now() - start); counts[name].push(queries);
    }
    const summary = (key: keyof typeof results) => {
      const sorted = results[key].sort((a, b) => a - b);
      return { samples: sorted.length, p50Ms: +sorted[14].toFixed(2), p95Ms: +sorted[28].toFixed(2), queriesPerRead: counts[key][0] };
    };
    console.log(JSON.stringify({ environment: "local PostgreSQL 16 test database; warm pending applicant; excludes HTTP and OAuth", previous: summary("previous"), current: summary("current") }));
  } finally {
    await client.joinRequest.deleteMany({ where: { organizationId: org.id } });
    await client.orgInvite.deleteMany({ where: { organizationId: org.id } });
    await client.organization.delete({ where: { id: org.id } });
    await client.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
