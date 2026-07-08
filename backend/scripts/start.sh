#!/bin/sh
# Production entrypoint. Applies pending Prisma migrations, then starts the API.
#
# Migrations are best-effort at boot: a migration failure must NOT prevent the
# server from starting. Historically the start command was
# `prisma migrate deploy && node dist/index.js`, so any migration failure
# short-circuited on `&&` and the server never started — Railway then
# crash-looped until it exhausted its retries and the whole app went dark.
#
# The schema is now gated in CI (.github/workflows/backend.yml runs the same
# `prisma migrate deploy` plus a drift check), so a failure here is an
# operational alert, not a reason to take the entire service down. We log
# loudly and start anyway; the app has runtime schema-compatibility guards for
# optional columns and degrades gracefully. `exec` hands PID 1 to node so
# SIGTERM reaches it for graceful shutdown.
#
# A failure must never be SILENT, though: we export MIGRATE_DEPLOY_FAILED=1
# (plus the tail of the deploy output) so the app can log at fatal level,
# report to Sentry, and expose `migrations: "failed_at_boot"` on /health —
# which the scheduled uptime workflow (.github/workflows/uptime.yml) turns
# into an alert. See src/services/bootStatusService.ts.

set -u

MIGRATE_LOG="$(mktemp)"

echo "[start] Applying database migrations (prisma migrate deploy)..."
if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
  cat "$MIGRATE_LOG"
  echo "[start] Migrations applied successfully."
else
  status=$?
  cat "$MIGRATE_LOG" >&2
  echo "[start] WARNING: 'prisma migrate deploy' failed (exit ${status}). Starting server in degraded mode. INVESTIGATE IMMEDIATELY." >&2
  MIGRATE_DEPLOY_FAILED=1
  MIGRATE_DEPLOY_ERROR_TAIL="$(tail -n 20 "$MIGRATE_LOG" | tr -d '\r')"
  export MIGRATE_DEPLOY_FAILED MIGRATE_DEPLOY_ERROR_TAIL
fi
rm -f "$MIGRATE_LOG"

echo "[start] Starting API server..."
exec node dist/index.js
