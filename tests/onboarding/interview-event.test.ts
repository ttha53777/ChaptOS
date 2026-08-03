/**
 * Tests for POST /api/ai/interview/event — the pre-auth beacon that records why
 * the /create interview fell off the AI concierge onto the scripted spine.
 *
 * Two things matter here and nothing else does:
 *   1. It logs a usable line for a well-formed beacon (the whole point — this
 *      degradation was previously invisible on both sides of the wire).
 *   2. It carries NO founder content. The route is unauthenticated and the
 *      /create flow is full of typed answers, so the schema is the guarantee
 *      that none of them can ride along. See the telemetry inventory in
 *      docs/trust-and-privacy-source-of-truth.md.
 *
 * Pre-auth, so the handler can be invoked directly with a NextRequest.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ai/interview/event/route";

let ipCounter = 0;
function buildPost(body: unknown, ip?: string): NextRequest {
  return new NextRequest("http://localhost/api/ai/interview/event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `10.7.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID = {
  reason: "timeout",
  stage: "concierge",
  turn: 3,
  sessionId: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  elapsedMs: 10_021,
};

/** logTiming writes one JSON line per call via console.log. */
function captureLogs() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

let logSpy: ReturnType<typeof captureLogs>;
beforeEach(() => { logSpy = captureLogs(); });
afterEach(() => { logSpy.mockRestore(); });

function loggedLines() {
  return logSpy.mock.calls.map(c => JSON.parse(String(c[0])) as Record<string, unknown>);
}

describe("POST /api/ai/interview/event", () => {
  it("records a well-formed beacon and answers 204", async () => {
    const res = await POST(buildPost(VALID));
    expect(res.status).toBe(204);

    const line = loggedLines().find(l => l.message === "interview-fallback");
    expect(line).toBeDefined();
    expect(line!.route).toBe("/api/ai/interview/event");
    expect(line!.extra).toEqual({
      reason: "timeout",
      stage: "concierge",
      turn: 3,
      sessionId: VALID.sessionId,
      elapsedMs: 10_021,
    });
  });

  it("accepts every reason the client can report", async () => {
    const reasons = [
      "timeout", "http-429", "http-error", "disabled", "null-result",
      "network", "model-done-early", "turn-cap", "no-next",
    ];
    for (const reason of reasons) {
      expect((await POST(buildPost({ ...VALID, reason }))).status).toBe(204);
    }
    const seen = loggedLines()
      .filter(l => l.message === "interview-fallback")
      .map(l => (l.extra as { reason: string }).reason);
    expect(seen).toEqual(reasons);
  });

  it("omits elapsedMs rather than logging a placeholder", async () => {
    const { elapsedMs: _drop, ...noElapsed } = VALID;
    await POST(buildPost(noElapsed));
    const line = loggedLines().find(l => l.message === "interview-fallback")!;
    expect(line.extra).not.toHaveProperty("elapsedMs");
  });

  // The privacy guarantee. A beacon carrying the founder's typed answer, their
  // org name, or a transcript must not be recordable — the schema drops unknown
  // keys, so extras can never reach the log line.
  it("cannot carry founder content", async () => {
    const res = await POST(buildPost({
      ...VALID,
      orgName: "Sigma Nu Chapter",
      transcript: [{ role: "user", text: "about 60 active brothers" }],
      answer: "we track chapter points",
      email: "founder@example.edu",
    }));
    expect(res.status).toBe(204);

    const line = loggedLines().find(l => l.message === "interview-fallback")!;
    expect(Object.keys(line.extra as object).sort())
      .toEqual(["elapsedMs", "reason", "sessionId", "stage", "turn"]);
    expect(JSON.stringify(line)).not.toMatch(/Sigma Nu|brothers|chapter points|example\.edu/i);
  });

  it("swallows a malformed beacon without logging junk", async () => {
    for (const bad of [
      null,
      { reason: "not-a-reason", stage: "concierge", turn: 0, sessionId: "abcdefgh" },
      { ...VALID, stage: "somewhere-else" },
      { ...VALID, sessionId: "short" },
      { ...VALID, turn: 999 },
    ]) {
      expect((await POST(buildPost(bad))).status).toBe(204);
    }
    expect(loggedLines().filter(l => l.message === "interview-fallback")).toHaveLength(0);
  });

  it("rate limits a flood from one IP", async () => {
    const ip = "10.77.77.77";
    let status = 204;
    for (let i = 0; i < 200; i++) {
      status = (await POST(buildPost(VALID, ip))).status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});
