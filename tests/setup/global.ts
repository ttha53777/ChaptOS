/**
 * Vitest global setup. Runs once before any test file.
 *
 *  - Verifies the test DB is reachable.
 *  - Pushes the current Prisma schema onto it (db push --force-reset).
 *
 * We use `db push` rather than `migrate deploy` for the test DB because the
 * production migration chain has a gap: ServiceEvent was created outside the
 * migration history and therefore never appears in any migration SQL. On a
 * fresh container `migrate deploy` errors with "relation does not exist" when
 * the Phase 0 migration tries to ALTER it. `db push` reads the current schema
 * directly and creates every table in dependency order, bypassing that gap.
 *
 * Assumes `npm run test:db:up` has been run (docker-compose). The test runner
 * itself does NOT start docker — that's the developer's responsibility, and CI
 * starts it via the workflow file.
 */

import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://figurints_test:figurints_test@localhost:54330/figurints_test?schema=public";

const ENV = {
  ...process.env,
  // Set both vars so prisma.config.ts (which loads .env.local via dotenv)
  // doesn't override with the production Supabase URL. dotenv config() skips
  // vars that are already present in process.env.
  DATABASE_URL: TEST_DATABASE_URL,
  DIRECT_URL:   TEST_DATABASE_URL,
  // Required by Prisma's AI-agent safety guard for --force-reset.
  // This is explicitly safe: the target is the ephemeral test container.
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes, proceed",
};

export default async function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // Tests do not use Supabase auth — stub creds so any indirect import of
  // require-user.ts / supabase client doesn't choke at module load time.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

  try {
    execSync("npx prisma db push --force-reset --accept-data-loss", {
      env: ENV,
      stdio: "pipe",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Failed to push schema to test DB. Is it running? Try: npm run test:db:up\n${msg}`,
    );
  }
}
