#!/bin/sh
set -e

# Migrations that ALTER TABLE can hang forever waiting on locks held by the
# still-running old container (long-polling connections). Fail fast instead of
# blocking boot, and retry a few times while the old task drains.
export PGOPTIONS="-c lock_timeout=15s -c statement_timeout=180s -c idle_in_transaction_session_timeout=30s"

attempt=1
until [ "$attempt" -gt 10 ]; do
  echo "[signage] applying database migrations (attempt ${attempt}/10)..."
  if bunx drizzle-kit migrate; then
    echo "[signage] migrations applied."
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    echo "[signage] migrations failed after 10 attempts (likely a lock held by another container). Aborting."
    exit 1
  fi
  echo "[signage] migration blocked or failed, retrying in 10s..."
  attempt=$((attempt + 1))
  sleep 10
done

echo "[signage] starting server on port ${PORT:-3000}..."
if [ -f out/server/index.mjs ]; then
  exec node out/server/index.mjs
fi
# Fallback for images built before the Nitro 3 output-path change.
exec node .output/server/index.mjs