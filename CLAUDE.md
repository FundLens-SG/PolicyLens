# PolicyLens — canonical fresh clone

This is the canonical PolicyLens working tree (correct remote: `FundLens-SG/PolicyLens`). The older `C:\Creations\PolicyLens\` has the wrong remote (`Policylens-Community`, deleted) — do NOT push from there.

## Where to start

The full project context lives in **`C:\Creations\ckgtools\CLAUDE.md`** under "Phase 7A — PolicyLens migration ✅". Read that first. This file only captures PolicyLens-specific state that wouldn't be obvious from the code alone.

For generic engineering rules read `PLANS.md` next door.

## Current state — Phase 7A done

PolicyLens has been fully migrated to the new ckgtools architecture:

- **Auth:** hub OAuth via `ckgtools-admin` (`cbqbvctnrfbxjscgirpn`). The old `mgbxxwoasrwlraffcvab.supabase.co` project is retired; existing data was discarded (test-only).
- **Data:** lives in the `policylens` schema on ckgtools-admin. 5 tables, user-id-keyed, RLS, realtime. Schema in `ckgtools/sql/03_policylens_schema.sql`.
- **Drive auth:** the `drive-auth-dev` Edge Function (deployed to ckgtools-admin) handles continuous Drive token refresh. PolicyLens reads hub `session.provider_token` (fast path), falls back to Edge Function refresh, periodic refresh every 50min. Edge Function source at `ckgtools/supabase/functions/drive-auth-dev/index.ts`. Two secrets set on the function: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
- **Build:** `npm run build:precompile` regenerates `index.html` from `src/index.babel.html`.

## Cross-tool precedent from Autodial Phase 7B2 (worth knowing)

Autodial's 7B2 migration (just completed 2026-05-03) had to solve a problem PolicyLens may also hit: **the hub's `public.profiles` table is keyed by email and RLS only allows reading your own row** — so client-side cross-user uuid resolution is impossible.

Solution: security-definer SQL functions that read `auth.users` directly. Defined in `ckgtools/sql/06_autodial_uid_by_email.sql`:

- `autodial.uid_by_email(p_email text) returns uuid` — single-email → uuid
- `autodial.emails_by_uids(p_ids uuid[]) returns table(id uuid, email text)` — batch reverse-lookup

If PolicyLens ever needs to write to another user's row or look up another user's UID by email (e.g. Secretary delegation flows surfacing in PolicyLens UI), copy the same pattern into a `policylens.uid_by_email(text)` function. The RPC pattern is the right primitive for this on the hub.

Other lessons reusable from 7B2:

- **The Supabase JS UMD bundle** returns thenables on `upsert/insert/update/delete` that lack `.catch()`. PolicyLens may already be tripping on this if any callsite uses `.catch()`. Autodial's polyfill (in its `_initSupabaseClient`) wraps both `_SB.from(…)` AND `_SB.schema(…).from(…)` — the schema-prefixed chain bypasses the bare-from polyfill in standard supabase-js.
- **`supabase-js` resolves with `{data, error}` instead of throwing** on HTTP 4xx/5xx. Silent `.catch(() => {})` callsites hide errors completely. Autodial now auto-logs `[supa <table>.<method>] <code> <message>` via the same polyfill — same idea is worth adding here for debuggability.
- **Don't store JS-side `Date.now()` in `int` columns** — overflows 32-bit int. Autodial hit this with `sync_version`; the schema was patched to `bigint`.

## Don't push from here without the user's say-so

The canonical remote is `FundLens-SG/PolicyLens`. The current local state matches what's on GitHub (Phase 7A is the latest) but verify with `git status` / `git log` before any push. The auto-sync chain (`notify-ckgtools.yml` → `ckgtools/sync-tools.yml`) fires on push and overwrites `ckgtools/public/tools/policylens/`.
