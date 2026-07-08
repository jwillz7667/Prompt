# Production Schema-Drift Repair Runbook

Repairs the drift documented in
`prisma/migrations/20260708000000_repair_schema_drift/migration.sql`
(Prompt/ThreadTurn.imageAttachment, Prompt.version/rootPromptId,
Template.modality, SharedPrompt, PlatformType enum values).

`scripts/start.sh` already runs `npx prisma migrate deploy` at boot but
swallows failures (degraded mode), so a redeploy alone is NOT proof the
migration applied — follow the verification steps.

## Step 0 — Diagnose (read-only, run this first)

```bash
railway ssh "npx prisma migrate status"
```

Exactly one of three states will be reported. Do only the matching section.

## State 1 — "Database schema is up to date!"

Both 20260707210000 and (after this branch deploys) 20260708000000 are
applied. If 20260708000000 is not yet in the deployed image, merge/deploy this
branch; the boot-time `migrate deploy` applies it. It is fully idempotent, so
it is safe even if production already has every object (the most likely
state). Go to Verification.

## State 2 — Pending migrations listed (no failed migrations)

```text
Following migrations have not yet been applied:
20260707210000_add_shares_versions_template_modality
20260708000000_repair_schema_drift
```

Deploy this branch (Railway GitHub integration on `main`) — boot runs
`migrate deploy`, which applies them in timestamp order: 20260707210000 first
(its plain `ADD COLUMN` statements are safe because the repair is timestamped
AFTER it and cannot pre-create its columns), then the repair. Or apply without
waiting for a boot:

```bash
railway ssh "npx prisma migrate deploy"
```

Go to Verification.

## State 3 — Failed migration (P3009)

`migrate status` reports 20260707210000 as failed (started but never
finished). Every `migrate deploy` exits P3009 and applies NOTHING until the
failed record is resolved. On Postgres the whole migration file rolled back
atomically, so the database contains none of its DDL — the correct resolution
is ALWAYS `--rolled-back`:

```bash
railway ssh "npx prisma migrate resolve --rolled-back 20260707210000_add_shares_versions_template_modality"
railway ssh "npx prisma migrate deploy"
```

NEVER use `--applied` here: it would record the migration without its DDL or
its built-in Template seed rows. (If someone already did, the repair migration
still converges the schema — but the seed INSERT must be re-run manually from
that migration file.)

Go to Verification.

## Verification (all states)

1. Migration history is clean:

   ```bash
   railway ssh "npx prisma migrate status"
   # Expect: "Database schema is up to date!"
   ```

2. Repaired columns exist and are writable (read-only probe):

   ```bash
   railway ssh "psql \$DATABASE_URL -c 'SELECT \"imageAttachment\", \"version\", \"rootPromptId\" FROM \"Prompt\" LIMIT 1'"
   railway ssh "psql \$DATABASE_URL -c 'SELECT \"imageAttachment\" FROM \"ThreadTurn\" LIMIT 1'"
   ```

3. The affected user's history is still present server-side (substitute the
   user id from `SELECT id FROM "User" WHERE email = '<user email>'`):

   ```bash
   railway ssh "psql \$DATABASE_URL -c 'SELECT count(*) FROM \"Prompt\" WHERE \"userId\" = '\''<userId>'\'''"
   railway ssh "psql \$DATABASE_URL -c 'SELECT count(*) FROM \"Thread\" WHERE \"userId\" = '\''<userId>'\'''"
   ```

   Also check for an account fork (authService creates a NEW user when a
   provider relay/changed email stops matching):

   ```bash
   railway ssh "psql \$DATABASE_URL -c 'SELECT id, email, \"appleId\", \"createdAt\" FROM \"User\" WHERE email ILIKE '\''%<user>%'\'' OR \"appleId\" IS NOT NULL ORDER BY \"createdAt\"'"
   ```

4. API smoke test with a fresh login token:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" https://backend-production-d538.up.railway.app/api/v1/prompts?limit=1
   curl -s -H "Authorization: Bearer $TOKEN" https://backend-production-d538.up.railway.app/api/v1/threads?limit=1
   ```

   Both must return 200 with data (not 500), and boot logs must NOT contain
   the start.sh degraded-mode WARNING for the latest deploy:

   ```bash
   railway logs | grep -i -E 'migrate|WARNING'
   ```

## Notes

- If `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel
  prisma/schema.prisma` is ever run against production and shows EXTRA
  `attachedContext*` columns on "Thread", they are benign leftovers of the
  reverted 2026-03-18 experiment; dropping them is optional cleanup, not part
  of this repair.
- Schema repair does not resolve the "no past chats" report by itself if the
  cause is client-side: the iOS app silently shows an empty sidebar when the
  shared-Keychain access token is missing even though the UI looks logged in,
  and a Sign-in-with-Apple email change can fork the account to a fresh
  userId. Verify step 3/4 distinguishes these: rows present + 200 responses
  but empty app means client/auth issue, not schema.
