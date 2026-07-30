#!/bin/sh
set -e

echo "[signage] applying database migrations..."
bunx drizzle-kit migrate

echo "[signage] starting server on port ${PORT:-3000}..."
exec node .output/server/index.mjs