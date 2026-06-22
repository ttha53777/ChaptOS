#!/usr/bin/env bash
# Warn (or fail with --strict) when request-path code calls the raw prisma client
# directly instead of going through lib/db's org-scoped wrapper. Direct prisma.*
# calls bypass tenant scoping AND won't set app.org_id once RLS enforcement lands
# (Phase 2), so they return zero rows or leak across orgs.
#
# Covers app/api/ AND lib/ — the AI layer (ai-tools, ai-prompt), attendance.ts and
# service-hours.ts live in lib/ and were the original blind spot. lib/services/ is
# covered separately by check-raw-prisma.sh (import-level), which this complements
# at the call-site level.
#
# The model list is DERIVED from prisma/schema.prisma at runtime (camelCased
# delegate names) so it never goes stale when a model is added — the previous
# hardcoded 13-name list missed task, reimbursement, membership, etc.
#
# Exemptions: a line (or its file) is allowed when it carries the comment
# `lint-direct-prisma:ignore`. The bootstrap/infra files that legitimately use the
# raw client (pre-org, privileged, or the wrapper itself) are listed in
# EXEMPT_PATHS below with a one-line reason each.
#
# Usage:  bash scripts/lint-direct-prisma.sh           # warn only
#         bash scripts/lint-direct-prisma.sh --strict  # exit 1 on any hit

set -uo pipefail

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="$ROOT/prisma/schema.prisma"

# Derive delegate names: model FooBar → prisma.fooBar. Lowercase the first char.
# awk (not `sed \L`, which BSD/macOS sed doesn't support — it would emit a literal
# "L" and silently match nothing, the bug this script was born to avoid).
MODELS=$(grep -E '^model ' "$SCHEMA" | sed 's/model //;s/ .*//' \
  | awk '{ print tolower(substr($0,1,1)) substr($0,2) }')

# Build an alternation: brother|role|semester|...
ALT=$(echo "$MODELS" | paste -sd '|' -)

# Files/dirs that may use the raw prisma client by design. Each MUST stay justified:
#   lib/db/**            the wrapper itself (defines db(); raw client is the point)
#   lib/prisma*.ts       the client/pool construction
#   lib/services/org-service.ts  pre-org provisioning on the privileged client
#   lib/auth/**          pre-membership auth bootstrap (account→Brother by authUserId)
#   lib/events/emit.ts   carries an explicit organizationId on every write
#   lib/seed-roles.ts    role provisioning, only ever called from scripts + org-service bootstrap
#   app/api/auth/**, app/api/orgs/**  pre-auth/pre-org bootstrap routes
EXEMPT_PATHS='lib/db/|lib/prisma|lib/services/org-service.ts|lib/auth/|lib/events/emit.ts|lib/seed-roles.ts|app/api/auth/|app/api/orgs/'

HITS=$(grep -rnE \
  --include="*.ts" --include="*.tsx" \
  "prisma\.($ALT)\." \
  "$ROOT/app/api/" "$ROOT/lib/" \
  2>/dev/null \
  | grep -vE "$EXEMPT_PATHS" \
  | grep -v 'lint-direct-prisma:ignore')

if [[ -z "$HITS" ]]; then
  echo "lint-direct-prisma: OK — no direct prisma.<model> calls in app/api/ or lib/ (outside exemptions)"
  exit 0
fi

echo "lint-direct-prisma: found direct prisma.<model> calls in request-path code"
echo "  These should use db(orgId).<model> (ctx.db) from @/lib/db instead, so they"
echo "  are org-scoped and set app.org_id under RLS. If a call is a legitimate"
echo "  pre-auth/privileged path, add a 'lint-direct-prisma:ignore' comment with a"
echo "  reason, or extend EXEMPT_PATHS in this script."
echo ""
echo "$HITS"
echo ""

if [[ "$STRICT" -eq 1 ]]; then
  echo "Failing because --strict was passed."
  exit 1
fi

echo "WARNING only. Pass --strict to treat this as an error."
exit 0
