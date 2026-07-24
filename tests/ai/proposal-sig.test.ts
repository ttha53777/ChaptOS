/**
 * lib/ai-approval-sig.ts — the trust anchor for the approvals-only record.
 *
 * Proposals aren't persisted at draft time; the ChatApproval audit row is built
 * from a blob the CLIENT echoes back on confirm. These tests pin the properties
 * that make that safe: round-trip verification, key-order independence (the
 * blob survives JSON.parse/stringify on the client), tamper rejection, iat
 * windowing, and fail-closed behavior when no signing key is configured.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signProposalBlob,
  verifyProposalBlob,
  stableStringify,
  PROPOSAL_SIG_MAX_AGE_MS,
} from "@/lib/ai-approval-sig";

const savedSecret = process.env.PROPOSAL_SIGNING_SECRET;
const savedApiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.PROPOSAL_SIGNING_SECRET = "test-secret";
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.PROPOSAL_SIGNING_SECRET;
  else process.env.PROPOSAL_SIGNING_SECRET = savedSecret;
  if (savedApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedApiKey;
});

function blob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "propose_record_dues_payment",
    endpoint: "/api/transactions",
    method: "POST",
    payload: { type: "income", category: "Dues", brotherId: 3, amount: 200 },
    display: { kind: "dues", title: "Record a dues payment", rows: [{ k: "Amount", v: "$200", em: true }] },
    perm: "MANAGE_TREASURY",
    orgId: 1,
    actorId: 7,
    iat: Date.now(),
    ...overrides,
  };
}

describe("stableStringify", () => {
  it("is key-order independent and drops undefined properties (JSON round-trip parity)", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(stableStringify({ a: 1, gone: undefined })).toBe(stableStringify({ a: 1 }));
    expect(stableStringify({ nested: { z: [1, { y: 2, x: 3 }], a: "s" } }))
      .toBe(stableStringify({ nested: { a: "s", z: [1, { x: 3, y: 2 }] } }));
  });
});

describe("sign + verify", () => {
  it("round-trips, including after a client-side JSON round-trip", () => {
    const b = blob();
    const sig = signProposalBlob(b);
    expect(sig).toBeTruthy();
    expect(verifyProposalBlob(b, sig)).toBe(true);
    const roundTripped = JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
    expect(verifyProposalBlob(roundTripped, sig)).toBe(true);
  });

  it("rejects any tampered field", () => {
    const b = blob();
    const sig = signProposalBlob(b);
    expect(verifyProposalBlob(blob({ ...b, actorId: 8 }), sig)).toBe(false);
    const bumped = JSON.parse(JSON.stringify(b)) as { payload: { amount: number } };
    bumped.payload.amount = 9999;
    expect(verifyProposalBlob(bumped as unknown as Record<string, unknown>, sig)).toBe(false);
    expect(verifyProposalBlob(b, `${sig!.slice(0, -1)}0`)).toBe(false);
    expect(verifyProposalBlob(b, "")).toBe(false);
    expect(verifyProposalBlob(b, "not-hex")).toBe(false);
  });

  it("rejects expired and future-dated iat", () => {
    const stale = blob({ iat: Date.now() - PROPOSAL_SIG_MAX_AGE_MS - 1000 });
    expect(verifyProposalBlob(stale, signProposalBlob(stale))).toBe(false);
    const future = blob({ iat: Date.now() + 10 * 60 * 1000 });
    expect(verifyProposalBlob(future, signProposalBlob(future))).toBe(false);
    const missing = blob({ iat: undefined });
    expect(verifyProposalBlob(missing, signProposalBlob(missing))).toBe(false);
  });

  it("fails closed with no signing key configured", () => {
    delete process.env.PROPOSAL_SIGNING_SECRET;
    delete process.env.OPENAI_API_KEY;
    const b = blob();
    expect(signProposalBlob(b)).toBeNull();
    expect(verifyProposalBlob(b, "deadbeef")).toBe(false);
  });

  it("falls back to a key derived from OPENAI_API_KEY", () => {
    delete process.env.PROPOSAL_SIGNING_SECRET;
    process.env.OPENAI_API_KEY = "sk-test";
    const b = blob();
    const sig = signProposalBlob(b);
    expect(sig).toBeTruthy();
    expect(verifyProposalBlob(b, sig)).toBe(true);
  });
});
