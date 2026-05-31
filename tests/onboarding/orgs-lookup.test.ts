/**
 * Integration tests for GET /api/orgs/lookup.
 *
 * Calls the route handler directly with a constructed NextRequest. The route
 * is unauthenticated (used on /welcome before a Brother exists) and only
 * touches Prisma + the in-memory rate limiter, so no Supabase setup needed.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/orgs/lookup/route";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg } from "../setup/factories";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function buildReq(slug: string | null, opts: { ip?: string } = {}): NextRequest {
  const url = slug === null
    ? "http://localhost/api/orgs/lookup"
    : `http://localhost/api/orgs/lookup?slug=${encodeURIComponent(slug)}`;
  // Use a unique IP per test by default so the shared in-process rate limiter
  // doesn't bleed between cases.
  const ip = opts.ip ?? `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

describe("GET /api/orgs/lookup", () => {
  it("returns 200 with name + slug for an existing org", async () => {
    await createOrg("Alpha Chapter", "alpha");
    const res = await GET(buildReq("alpha"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ name: "Alpha Chapter", slug: "alpha" });
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await GET(buildReq("ghost-slug"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no organization/i);
  });

  it("returns 400 with the format reason for an empty slug", async () => {
    const res = await GET(buildReq(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 for a reserved slug without hitting the DB", async () => {
    // 'admin' is in the reserved list. Even if an org somehow had this slug,
    // the format validator rejects it before the DB lookup.
    const res = await GET(buildReq("admin"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/reserved/i);
  });

  it("returns 400 for a slug with uppercase characters", async () => {
    const res = await GET(buildReq("Alpha"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lowercase|format/i);
  });

  it("returns 400 for a slug that's too long", async () => {
    const res = await GET(buildReq("a".repeat(50)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most/i);
  });

  it("does NOT leak member counts, ids, or other org fields", async () => {
    const org = await createOrg("Alpha", "alpha");
    // Add some sibling data so the JSON shape can be inspected.
    await testPrisma.brother.create({
      data: {
        organizationId: org.id,
        name: "Sensitive Member",
        role: "Brother",
        attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0,
      },
    });
    const res = await GET(buildReq("alpha"));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["name", "slug"]);
    expect(JSON.stringify(body)).not.toContain("Sensitive Member");
  });

  it("rate-limits per IP and returns 429 after the burst window", async () => {
    await createOrg("Alpha", "alpha");
    const ip = "10.99.99.99";
    // 60 requests per minute is the configured limit. Burst past it.
    let lastStatus = 0;
    for (let i = 0; i < 65; i++) {
      const res = await GET(buildReq("alpha", { ip }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
