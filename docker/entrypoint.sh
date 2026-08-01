#!/bin/sh
set -e

echo "[signage] applying database migrations..."
bunx drizzle-kit migrate

echo "[signage] starting server on port ${PORT:-3000}..."
if [ -f out/server/index.mjs ]; then
  exec node out/server/index.mjs
fi
# Fallback for images built before the Nitro 3 output-path change.
exec node .output/server/index.mjs