"""mobile/ import boundary, called by scripts/lint-module-boundaries.sh.

Prints one line per violation (nothing when clean). The native app may take from
the rest of the repo only `import type` from lib/api-types and the Zod request
schemas in lib/validation; relative paths that climb out of mobile/ count too.
A statement whose lines contain "lint-modules:ignore" is exempt.
"""
import os
import re

ROOT = os.path.abspath("mobile")
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
            elif not spec.startswith("@/lib/validation/"):
                print(f"{rel}:{first}: only lib/api-types (types) and lib/validation are allowed: {spec}")
