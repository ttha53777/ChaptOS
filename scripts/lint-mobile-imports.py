"""mobile/ import boundary, called by scripts/lint-module-boundaries.sh.

Prints one line per violation (nothing when clean). The native app may take from
the rest of the repo only `import type` from lib/api-types, the Zod request
schemas in lib/validation, and the PURE shared rules in SHARED (the dashboard's
derivations, so the app and the web compute standing, health, the plate, the
week and the headline numbers with the same code). A SHARED module must stay
free of Node, Prisma, Temporal and React, and so must everything it imports.
Relative paths that climb out of mobile/ count too.
A statement whose lines contain "lint-modules:ignore" is exempt.
"""
import os
import re

ROOT = os.path.abspath("mobile")
SHARED = (
    "@/lib/dashboard/", "@/lib/dashboard-layout", "@/lib/nav-order", "@/lib/tracked-metrics",
    "@/lib/thresholds", "@/lib/money", "@/lib/dates", "@/lib/tasks/", "@/lib/workflow-features",
    "@/lib/event-hue", "@/lib/timeline/",
    "@/lib/treasury/", "@/lib/treasury-term", "@/lib/treasury-balance", "@/lib/dues-ledger", "@/lib/dues-targets",
    "@/lib/docs/", "@/lib/media/", "@/lib/service/", "@/lib/parties/", "@/lib/fundraising/", "@/lib/fundraisers", "@/lib/state/fundraiser-kind", "@/lib/programme/", "@/lib/calendar-feed/legacy-time", "@/lib/state/programming-stage", "@/lib/event-owner", "@/lib/event-fields", "@/lib/meetings/", "@/lib/agenda-template", "@/lib/meeting-summary", "@/lib/collaboration/notes-protocol",
)
SKIP_DIRS = {"node_modules", ".expo", "dist", "ios", "android"}
STMT = re.compile(
    r'(?ms)^\s*(import|export)\b([^;]*?)\bfrom\s*["\']([^"\']+)["\']'
    r'|\brequire\(\s*["\']([^"\']+)["\']\s*\)'
    r'|\bimport\(\s*["\']([^"\']+)["\']\s*\)'
)

for d, dirs, files in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
    for f in files:
        if not f.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")):
            continue
        path = os.path.join(d, f)
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        lines = src.splitlines()
        for m in STMT.finditer(src):
            kind, clause = m.group(1), m.group(2) or ""
            spec = m.group(3) or m.group(4) or m.group(5)
            first = src.count("\n", 0, m.start()) + 1
            last = src.count("\n", 0, m.end()) + 1
            if any("lint-modules:ignore" in l for l in lines[first - 1:last]):
                continue
            rel = os.path.relpath(path)
            if spec.startswith("."):
                target = os.path.abspath(os.path.join(d, spec))
                if not (target == ROOT or target.startswith(ROOT + os.sep)):
                    print(f"{rel}:{first}: relative import leaves mobile/: {spec}")
                continue
            if not spec.startswith("@/"):
                continue
            type_only = kind is not None and re.match(r"\s*type\b", clause) is not None
            if spec == "@/lib/api-types" or spec.startswith("@/lib/api-types/"):
                if not type_only:
                    print(f"{rel}:{first}: lib/api-types must be `import type`: {spec}")
            elif not spec.startswith("@/lib/validation/") and not spec.startswith(SHARED):
                print(f"{rel}:{first}: only lib/api-types (types), lib/validation and the shared pure rules are allowed: {spec}")
