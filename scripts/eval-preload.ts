// Side-effect-only preload for the eval runner. MUST be the first import in
// scripts/eval-ask-the-chapter.ts.
//
// ES `import` statements are hoisted and their modules evaluated before the
// importing module's top-level statements run. lib/prisma builds its pg Pool from
// process.env.DATABASE_URL at module-init time, so any env mutation written as a
// plain statement in the runner runs TOO LATE — the pool is already bound to the
// app's transaction-pooler URL. Doing dotenv + the URL swap here, in a module
// imported before lib/prisma, guarantees the env is set first.
import { config } from "dotenv";

config({ path: ".env.local" });

// The app's DATABASE_URL is the Supabase transaction pooler (port 6543), which
// drops connections under the burst of tool queries a full eval makes (surfaces
// as ECONNREFUSED that fails cases spuriously). The session connection
// (DIRECT_URL, port 5432) is stable for a long-lived script. No-op when
// DIRECT_URL isn't set (e.g. a local non-Supabase DB).
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
