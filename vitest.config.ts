import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    globalSetup: ["./tests/setup/global.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Single-fork pool keeps Prisma connections sane against the test DB —
    // avoids dozens of pooled clients racing TRUNCATE in beforeEach.
    fileParallelism: false,
  },
});
