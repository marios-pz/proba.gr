#!/usr/bin/env bash
# Dev server with hot reload. Bootstraps the database (migrations +
# reference data) then hands off to `vite dev`; edits to src/ apply live.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

npm run dev
