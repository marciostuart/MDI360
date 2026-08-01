#!/bin/sh
set -e

# Serialize migrations across every Swarm task through a PostgreSQL advisory
# lock. lock_timeout exposes the real database error instead of hanging boot.
export PGOPTIONS="-c lock_timeout=30s -c statement_timeout=180s -c idle_in_transaction_session_timeout=30s"

echo "[signage] applying database migrations..."
node ./docker/migrate.mjs

echo "[signage] starting server on port ${PORT:-3000}..."
if [ -f out/server/index.mjs ]; then
  exec node out/server/index.mjs
fi
echo "[signage] server bundle was not found."
exit 1