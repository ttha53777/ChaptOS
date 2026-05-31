/**
 * Integration tests for GET /api/orgs/slug-check.
 *
 * Like /api/orgs/lookup, this route is unauthenticated and only touches Prisma
 * + the in-memory rate limiter, so it can be called directly with a NextRequest.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/orgs/slug-check/route";
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
    ? "http://localhost/api/orgs/slug-check"
    : `http://localhost/api/orgs/slug-check?slug=${encodeURIComponent(slug)}`;
  const ip = opts.ip ?? `10.0.1.${Math.floor(Math.random() * 250) + 1}`;
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

describe("GET /api/orgs/slug-check", () => {
  it("returns available for a well-formed unused slug", async () => {
    const res = await GET(buildReq("brand-new"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, available: true });
  });

  it("returns taken when the slug is already in use", async () => {
    await createOrg("Alpha", "alpha");
    const res = await GET(buildReq("alpha"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("taken");
  });

  it("returns reserved without hitting the DB", async () => {
    const res = await GET(buildReq("admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("reserved");
  });

  it("returns bad-format for uppercase", async () => {
    const res = await GET(buildReq("Alpha"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("bad-format");
  });

  it("returns too-short for slugs < 3 chars", async () => {
    const res = await GET(buildReq("ab"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("too-short");
  });

  it("returns empty for missing slug param", async () => {
    const res = await GET(buildReq(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("empty");
  });

  it("rate-limits per IP", async () => {
    const ip = "10.99.99.100";
    let lastStatus = 0;
    // Limit is 120/min.
    for (let i = 0; i < 130; i++) {
      const res = await GET(buildReq("anything", { ip }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
