import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "@/lib/db/runtime-url";

describe("runtimeDatabaseUrl", () => {
  it("moves a Supabase session-pool URL to transaction mode", () => {
    expect(runtimeDatabaseUrl(
      "postgresql://app.project:secret@aws-1.pooler.supabase.com:5432/postgres?sslmode=require",
    )).toBe(
      "postgresql://app.project:secret@aws-1.pooler.supabase.com:6543/postgres?sslmode=require",
    );
  });

  it("leaves an existing transaction-pool URL unchanged", () => {
    const value = "postgresql://app:secret@aws-1.pooler.supabase.com:6543/postgres";
    expect(runtimeDatabaseUrl(value)).toBe(value);
  });

  it("leaves non-Supabase and invalid values unchanged", () => {
    const local = "postgresql://app:secret@localhost:5432/postgres";
    expect(runtimeDatabaseUrl(local)).toBe(local);
    expect(runtimeDatabaseUrl("not a URL")).toBe("not a URL");
  });

  it("preserves an absent value", () => {
    expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
  });
});
