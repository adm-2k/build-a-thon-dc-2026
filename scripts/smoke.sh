#!/usr/bin/env bash
# scripts/smoke.sh — the ORCHESTRATION §6 global gate, scripted.
#
# MUST pass in fixture mode with NO .env.local present and no keys
# (the keyless path lanes B/C/E depend on). `pnpm build` is run by the
# caller alongside this script (§6 lists them separately).
set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
failt() { printf 'FAIL  %s\n' "$1"; fail=1; }

# 1 — hex literals outside tokens.css (§6 exit-safe form: bare `grep && exit 1`
#     would fail a CLEAN tree, because grep exits 1 on no match)
if grep -rn --include='*.tsx' --include='*.ts' --include='*.css' \
    -E '#[0-9a-fA-F]{3,8}\b' app components lib | grep -v tokens.css | grep -q .; then
  grep -rn --include='*.tsx' --include='*.ts' --include='*.css' \
    -E '#[0-9a-fA-F]{3,8}\b' app components lib | grep -v tokens.css
  failt 'color literal outside tokens.css'
else
  pass 'hex grep clean'
fi

# 2 — font-family literals outside tokens.css (families come from var(--font-*))
if grep -rn --include='*.css' 'font-family' app components lib/ 2>/dev/null \
    | grep -v 'var(--' | grep -q .; then
  grep -rn --include='*.css' 'font-family' app components lib/ 2>/dev/null | grep -v 'var(--'
  failt 'font-family literal outside tokens.css'
else
  pass 'font grep clean'
fi

# 3 — radius literals: 0 and 2px only, plus 50% for the licensed full circles
#     (DESIGN-BRIEF §6 arrow-circle, §6 event stamp, §12: "circles except
#     arrow buttons and stamp" — soft-rounded corners are the defect)
if grep -rn --include='*.css' --include='*.tsx' -E 'border-radius' app components 2>/dev/null \
    | grep -vE 'var\(--|border-radius:\s*0(px)?\s*[;}"]|border-radius:\s*2px|border-radius:\s*50%' | grep -q .; then
  grep -rn --include='*.css' --include='*.tsx' -E 'border-radius' app components 2>/dev/null \
    | grep -vE 'var\(--|border-radius:\s*0(px)?\s*[;}"]|border-radius:\s*2px|border-radius:\s*50%'
  failt 'radius literal outside {0, 2px, licensed 50% circles}'
else
  pass 'radius grep clean'
fi

# 4 — every fixture zod-parses (keyless: no env, no DB, no network)
if node scripts/seed-fixtures.ts --check; then
  pass 'fixtures zod-parse'
else
  failt 'fixture validation (node scripts/seed-fixtures.ts --check)'
fi

# 5 — every API route exports maxDuration (CLAUDE.md eng rule 6)
missing_md=0
while IFS= read -r route; do
  if ! grep -q 'export const maxDuration' "$route"; then
    printf '      missing maxDuration: %s\n' "$route"
    missing_md=1
  fi
done < <(find app/api -name 'route.ts')
if [ "$missing_md" -eq 0 ]; then pass 'maxDuration on every route'; else failt 'route(s) missing maxDuration'; fi

# 6 — lib/db.ts is server-only by construction (CLAUDE.md eng rule 3)
if head -1 lib/db.ts | grep -q 'server-only'; then
  pass 'lib/db.ts imports "server-only" first'
else
  failt 'lib/db.ts must start with import "server-only"'
fi

# 7 — vercel.json Ignored Build Step (only main deploys — ORCHESTRATION §3.10)
if grep -q 'ignoreCommand' vercel.json; then
  pass 'vercel.json ignoreCommand present'
else
  failt 'vercel.json missing the Ignored Build Step'
fi

if [ "$fail" -eq 0 ]; then
  printf '\nsmoke: IN REGISTER\n'
else
  printf '\nsmoke: OFF REGISTER\n'
fi
exit "$fail"
