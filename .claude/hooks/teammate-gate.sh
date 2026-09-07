#!/usr/bin/env bash
# TeammateIdle gate.
#
# A teammate is about to stop. Before it does, run the cheap static gate that is
# this repo's dev loop (typecheck + the ops-blindness, static, motion, R2 and
# selector self-test audits, about 2 seconds). If it is red, exit 2: Claude Code
# feeds stderr back to the teammate and keeps it working instead of letting it
# hand over a broken tree.
#
# Deliberately NOT the Playwright battery. That takes minutes, shares one SQLite
# database and cannot safely run several times over from parallel teammates.
# Suite selection stays with `npm run test:changed`, which the teammate runs
# itself before pushing.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

if ! output="$(npm run --silent check 2>&1)"; then
  {
    echo "npm run check is red. Do not go idle with a broken tree."
    echo
    echo "$output" | tail -40
  } >&2
  exit 2
fi
exit 0
