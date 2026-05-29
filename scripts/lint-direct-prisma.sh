#!/usr/bin/env bash
# Warn when app/api/ files call prisma directly instead of going through lib/db.
# In Phase 0 this is a WARNING only (existing files are grandfathered).
# Flip EXIT_CODE to 1 to make it a hard error once Phase 1 migration is complete.
#
# Usage:  bash scripts/lint-direct-prisma.sh          # check all files (warn)
#         bash scripts/lint-direct-prisma.sh --strict  # exit 1 on any hit

STRICT=0
[[ "$1" == "--strict" ]] && STRICT=1

# Grep for direct prisma.* calls (not inside lib/db/ or lib/prisma.ts itself)
HITS=$(grep -rn \
  --include="*.ts" --include="*.tsx" \
  'prisma\.\(brother\|role\|semester\|calendarEvent\|serviceEvent\|partyEvent\|deadline\|instagramTask\|doc\|transaction\|budget\|activityLog\|chapterAnnouncement\)\.' \
  app/api/ \
  2>/dev/null)

if [[ -z "$HITS" ]]; then
  echo "lint-direct-prisma: OK — no direct prisma model calls in app/api/"
  exit 0
fi

echo "lint-direct-prisma: found direct prisma.<model> calls in app/api/"
echo "  These should use db(orgId).<model> from @/lib/db instead."
echo ""
echo "$HITS"
echo ""

if [[ "$STRICT" -eq 1 ]]; then
  echo "Failing because --strict was passed."
  exit 1
fi

echo "WARNING only (Phase 0). Pass --strict to treat this as an error."
exit 0
