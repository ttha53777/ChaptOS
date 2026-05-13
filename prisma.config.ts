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
    url: process.env["DATABASE_URL"],
  },
});
