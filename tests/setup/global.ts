/**
 * Vitest global setup. Runs once before any test file.
 *
 *  - Verifies the test DB is reachable.
 *  - Applies Prisma migrations to it.
 *
 * Assumes `npm run test:db:up` has been run (docker-compose). The test runner
 * itself does NOT start docker — that's the developer's responsibility, and CI
 * starts it via the workflow file. Lets us fail fast with a helpful message
 * instead of opaque connection errors.
 */

import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://figurints_test:figurints_test@localhost:54330/figurints_test?schema=public";

export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // Tests do not use Supabase auth — stub creds so the prisma client init that
  // touches require-user.ts indirectly doesn't choke.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

  // Migrate the test DB. Idempotent — re-runs are cheap when nothing changed.
  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Failed to apply migrations to test DB. Is it running? Try: npm run test:db:up\n${msg}`,
    );
  }
}
