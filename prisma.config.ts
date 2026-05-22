import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local (Next.js convention) before Prisma reads DATABASE_URL
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations/introspection need a DIRECT (session) connection — the pooled
    // DATABASE_URL (PgBouncer, port 6543) doesn't support DDL or advisory locks
    // and hangs `migrate`. The runtime app client connects separately via its own
    // pooled Pool in lib/prisma.ts, so this only affects Prisma CLI commands.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
