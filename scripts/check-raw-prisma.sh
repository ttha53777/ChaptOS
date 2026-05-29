#!/usr/bin/env bash
# Fail CI if any service file imports prisma directly.
# Services must use ctx.db (the org-scoped wrapper) so tenancy is enforced.
# To suppress a false positive: add `// lint-direct-prisma:ignore` on the import line.

set -euo pipefail

SERVICES_DIR="lib/services"
FAIL=0

while IFS= read -r file; do
  # Skip lines with the explicit ignore comment
  bad=$(grep -n 'from "@/lib/prisma"' "$file" | grep -v 'lint-direct-prisma:ignore' || true)
  if [[ -n "$bad" ]]; then
    echo "ERROR: raw prisma import in service file: $file"
    echo "$bad"
    FAIL=1
  fi
done < <(find "$SERVICES_DIR" -name "*.ts")

if [[ $FAIL -eq 1 ]]; then
  echo ""
  echo "Services must use ctx.db.<model> (org-scoped wrapper), not prisma directly."
  echo "Add a named method to lib/db/tenant.ts if the wrapper is missing a query shape."
  exit 1
fi

echo "check-raw-prisma: OK"
