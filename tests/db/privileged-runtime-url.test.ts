import { describe, expect, it } from "vitest";
import { privilegedRuntimeUrl } from "@/lib/db/privileged-runtime-url";

describe("privilegedRuntimeUrl", () => {
  it("uses the explicit privileged runtime pool when configured", () => {
    expect(privilegedRuntimeUrl({
      PRIVILEGED_DATABASE_URL: "postgresql://privileged@pool.example:6543/postgres",
      DIRECT_URL: "postgresql://privileged@pool.example:5432/postgres",
    })).toBe("postgresql://privileged@pool.example:6543/postgres");
  });

  it("moves a Supabase session-pool URL to transaction mode at runtime", () => {
    expect(privilegedRuntimeUrl({
      DIRECT_URL: "postgresql://postgres.project:secret@aws-1.pooler.supabase.com:5432/postgres",
    })).toBe("postgresql://postgres.project:secret@aws-1.pooler.supabase.com:6543/postgres");
  });

  it("leaves non-Supabase direct connections unchanged", () => {
    const direct = "postgresql://postgres:secret@localhost:5432/app";
    expect(privilegedRuntimeUrl({ DIRECT_URL: direct })).toBe(direct);
  });

  it("falls back to the ordinary database URL", () => {
    const pooled = "postgresql://app:secret@pool.example:6543/app";
    expect(privilegedRuntimeUrl({ DATABASE_URL: pooled })).toBe(pooled);
  });
});
