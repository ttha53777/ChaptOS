import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent, joinOrg } from "../setup/factories";
import { seedNotes } from "@/lib/collaboration/notes-document";
import { notesTopic } from "@/lib/collaboration/notes-protocol";

// Exercise the actual SQL policies as a restricted database role. The auth/topic
// functions are local test shims; real WebSocket/JWT expiry remains a staging gate.
const client = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://figurints_test:figurints_test@localhost:54330/figurints_test" });
beforeAll(async () => {
  await client.connect();
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS realtime;
    DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.auth_uid', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.topic', true) $$;
    CREATE TABLE IF NOT EXISTS realtime.messages (extension text);
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, auth, realtime TO authenticated;
    GRANT SELECT, INSERT ON realtime.messages TO authenticated;
  `);
  await client.query(await readFile("supabase/realtime-meeting-notes.sql", "utf8"));
});
beforeEach(async () => { await resetDb(); await client.query("TRUNCATE realtime.messages; INSERT INTO realtime.messages VALUES ('broadcast')"); });
afterAll(async () => { await client.end(); await testPrisma.$disconnect(); });

async function access(uid: string, topic: string, write = false) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('test.auth_uid', $1, true), set_config('test.topic', $2, true)", [uid, topic]);
    await client.query("SET LOCAL ROLE authenticated");
    if (write) return (await client.query("INSERT INTO realtime.messages VALUES ('broadcast') RETURNING extension")).rowCount;
    return (await client.query("SELECT extension FROM realtime.messages")).rowCount;
  } finally { await client.query("ROLLBACK"); }
}

async function setup() {
  const org = await createOrg("A", "notes-a"), other = await createOrg("B", "notes-b");
  const brother = await createBrother({ orgId: org.id });
  const uid = randomUUID();
  await testPrisma.brother.update({ where: { id: brother.id }, data: { authUserId: uid } });
  const event = await createCalendarEvent({ orgId: org.id });
  const foreign = await createCalendarEvent({ orgId: other.id });
  await testPrisma.calendarEvent.updateMany({ data: { notesDoc: new Uint8Array(seedNotes("")) } });
  return { org, other, brother, uid, topic: notesTopic(org.id,event.id), foreignTopic: notesTopic(other.id,foreign.id) };
}

describe("Realtime notes SQL authorization", () => {
  it("denies a member without MANAGE_EVENTS on both receive and send", async () => {
    const { uid, topic } = await setup();
    expect(await access(uid,topic)).toBe(0);
    await expect(access(uid,topic,true)).rejects.toThrow("row-level security");
    expect(await access(randomUUID(), topic)).toBe(0);
  });
  it("uses same-org role grants and removes access when the role is revoked", async () => {
    const { org, brother, uid, topic, foreignTopic } = await setup();
    const role = await testPrisma.role.create({ data: { organizationId:org.id, name:"Editor", permissions:4 } });
    await testPrisma.brotherRole.create({ data: { organizationId:org.id, brotherId:brother.id, roleId:role.id } });
    expect(await access(uid,topic)).toBe(1);
    expect(await access(uid,topic,true)).toBe(1);
    expect(await access(uid,foreignTopic)).toBe(0);
    await testPrisma.role.update({ where:{ id:role.id }, data:{ permissions:0 } });
    expect(await access(uid,topic)).toBe(0);
  });
  it("does not use the identity's origin org to authorize a second membership", async () => {
    const { other, brother, uid, topic, foreignTopic } = await setup();
    await joinOrg({ orgId:other.id, brotherId:brother.id, isOrgAdmin:true });
    expect(await access(uid,foreignTopic)).toBe(1);
    expect(await access(uid,topic)).toBe(0);
    await testPrisma.membership.deleteMany({ where: { brotherId:brother.id, organizationId:other.id } });
    expect(await access(uid,foreignTopic)).toBe(0);
  });
  it("matches both platform-admin representations", async () => {
    const { brother, uid, foreignTopic } = await setup();
    await testPrisma.platformAdmin.create({ data:{ brotherId:brother.id } });
    expect(await access(uid,foreignTopic)).toBe(1);
    await testPrisma.platformAdmin.deleteMany();
    await testPrisma.brother.update({ where:{ id:brother.id }, data:{ isAdmin:true } });
    expect(await access(uid,foreignTopic)).toBe(1);
  });
  it("denies malformed topics without cast errors", async () => {
    const { uid } = await setup();
    for (const topic of ["notes:1", "notes:v1:org:9999999999:event:1", "notes:v1:org:1:event:1:extra", "notes:v1:org:0:event:1"]) {
      expect(await access(uid,topic)).toBe(0);
    }
  });
});
