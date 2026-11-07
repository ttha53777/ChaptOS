/**
 * Operator-only: delete every expired Ask Chapt attachment, across all orgs.
 * The manual fallback for supabase/cron-chat-attachments.sql. Prints counts only.
 *
 *   npx tsx scripts/purge-chat-attachments.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { prismaPrivileged } = await import("../lib/prisma-privileged");
  // Cross-org by design (BYPASSRLS client); expired content is already unreadable.
  const { count } = await prismaPrivileged.chatAttachment.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  console.log(`purged ${count} expired attachment${count === 1 ? "" : "s"}`);
  await prismaPrivileged.$disconnect();
}

main().catch(e => { console.error(e instanceof Error ? e.name : "error"); process.exit(1); });
