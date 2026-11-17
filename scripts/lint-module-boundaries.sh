#!/usr/bin/env bash
# Module-boundary lint. Enforces the import rules codified in Phase 2.5:
#
#   - app/api/** may NOT import @/lib/db directly (use ctx.db).
#   - app/api/** may NOT import @/lib/prisma directly (use ctx.db).
#   - app/api/** may NOT import another service from a different aggregate.
#   - lib/services/** may NOT import other services (cross-service traffic
#     goes through events).
#   - lib/services/** may NOT import from @/app/api.
#   - lib/api-types/** stays type-only.
#   - mobile/** may import only `import type` from lib/api-types and Zod
#     schemas from lib/validation.
#
# Lines containing "lint-modules:ignore" are exempted.
#
# Usage:  bash scripts/lint-module-boundaries.sh
#         bash scripts/lint-module-boundaries.sh --strict   # exit 1 on hits

STRICT=0
[[ "$1" == "--strict" ]] && STRICT=1
HITS=""

# 1. Routes should not import lib/db (use ctx.db from buildContext).
A=$(grep -rn 'from "@/lib/db"' app/api/ 2>/dev/null | grep -v 'lint-modules:ignore')
if [[ -n "$A" ]]; then HITS="$HITS\n[ROUTE→lib/db] Use ctx.db from buildContext instead:\n$A\n"; fi

# 2. Routes should not import lib/prisma (use ctx.db, or service if include needed).
B=$(grep -rn 'from "@/lib/prisma"' app/api/ 2>/dev/null | grep -v 'lint-modules:ignore')
if [[ -n "$B" ]]; then HITS="$HITS\n[ROUTE→lib/prisma] Use ctx.db, or push the query into a service:\n$B\n"; fi

# 3. Services should not import other services (use events.emit instead).
C=$(grep -rn 'from "@/lib/services/' lib/services/ 2>/dev/null | grep -v 'lint-modules:ignore')
if [[ -n "$C" ]]; then HITS="$HITS\n[SERVICE→SERVICE] Cross-service calls violate ownership; emit an event:\n$C\n"; fi

# 4. Services should not import app code.
D=$(grep -rn 'from "@/app/api' lib/services/ 2>/dev/null | grep -v 'lint-modules:ignore')
if [[ -n "$D" ]]; then HITS="$HITS\n[SERVICE→APP] Services must not reach into route handlers:\n$D\n"; fi

# 5. lib/api-types is the wire contract the native app compiles against: type-only,
#    so nothing it imports ever reaches the app's bundle (see lib/api-types/index.ts).
E=$( {
  grep -rn '^import ' lib/api-types/ 2>/dev/null | grep -v ':import type '
  grep -rnE '^import type .* from "[^@.]' lib/api-types/ 2>/dev/null
  grep -rnE '^export (default|const|let|var|function|async|class|enum|\{|\* )' lib/api-types/ 2>/dev/null
} | grep -v 'lint-modules:ignore')
if [[ -n "$E" ]]; then HITS="$HITS\n[API-TYPES RUNTIME] lib/api-types must stay type-only (import type / export type / interfaces):\n$E\n"; fi

# 6. mobile/ is the native app. From the rest of the repo it may take only the
#    wire types (`import type` from lib/api-types) and the request schemas
#    (lib/validation, plain Zod). Anything else would bundle server code into
#    the app or couple it to web internals. Relative paths that climb out of
#    mobile/ count too. Multi-line imports are parsed whole: scripts/lint-mobile-imports.py.
if [[ -d mobile ]]; then
F=$(python3 scripts/lint-mobile-imports.py)
if [[ -n "$F" ]]; then HITS="$HITS\n[MOBILE→REPO] mobile/ may take only 'import type' from lib/api-types and Zod schemas from lib/validation:\n$F\n"; fi
fi

if [[ -z "$HITS" ]]; then
  echo "lint-modules: OK — module boundaries respected"
  exit 0
fi

echo "lint-modules: module-boundary violations:"
echo -e "$HITS"

if [[ "$STRICT" -eq 1 ]]; then
  echo "Failing because --strict was passed."
  exit 1
fi

echo "WARNING only. Pass --strict to treat as an error."
exit 0
