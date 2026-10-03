#!/usr/bin/env bash
# Production build. Compiles with adapter-node, then bootstraps the
# database and serves the compiled output, no hot reload, no dev server.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

npm run build
npm start
