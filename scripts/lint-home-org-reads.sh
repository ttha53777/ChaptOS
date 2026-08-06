#!/usr/bin/env bash
# Guards the Phase 2 boundary: Brother.organizationId is an ORIGIN HINT, not a
# membership. Scoping a roster / attendance / dues / reporting read by it is what
# used to make a multi-org member invisible outside the first org they joined —
# so any new query that filters Brother by organizationId is almost certainly
# that bug coming back. Membership is where "belongs to this org" lives.
#
# Three call sites legitimately read it and are exempt by name:
#   provisionOrg / deleteOrg   set and re-home the pointer itself
#   resolveActiveOrg           uses it as a last-resort default, gated on the
#                              person still holding a real Membership there
set -uo pipefail
cd "$(dirname "$0")/.."

EXEMPT='lib/services/org-service.ts|lib/auth/require-user.ts|app/generated/|prisma/'

# A Brother filter carrying organizationId, on one line or split across two.
hits=$(grep -rn --include='*.ts' --include='*.tsx' \
        -E 'brother[a-zA-Z]*\.(findMany|findFirst|findUnique|count|updateMany|deleteMany)\(.*organizationId' \
        lib app 2>/dev/null | grep -Ev "$EXEMPT" || true)

# The relation form: { brother: { ... organizationId ... } }
hits+=$(grep -rn --include='*.ts' --include='*.tsx' \
        -E 'brother:[[:space:]]*\{[^}]*organizationId' \
        lib app 2>/dev/null | grep -Ev "$EXEMPT" || true)

if [ -n "$hits" ]; then
  echo "lint-home-org-reads: Brother.organizationId used as an org filter:"
  echo "$hits"
  echo
  echo "Brother.organizationId is the ORIGIN org, not a membership. Use ctx.db.member"
  echo "(Membership-backed) to ask whether someone belongs to the active org."
  exit 1
fi

echo "lint-home-org-reads: OK — no roster reads scoped by Brother.organizationId"
