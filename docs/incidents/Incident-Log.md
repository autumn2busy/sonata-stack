# Incident Log — Sonata Stack

> **Check this log BEFORE investigating any failure.**
> If the symptoms match a past incident, apply the known fix instead of re-investigating.

---

### 2026-04-01 — Schema Doc vs Actual DDL Mismatch

**Symptoms:** `CREATE TABLE "Client"` failed with `foreign key constraint "Client_originLeadId_fkey" cannot be implemented — Key columns "originLeadId" and "id" are of incompatible types: uuid and text.`

**Root Cause:** The AgencyLead-Schema.md doc was written based on assumptions from CLAUDE.md and code analysis, NOT from an actual database export. The doc stated `id` was `uuid` with `gen_random_uuid()` default. In reality, `id` is `text` with no default. Additional discrepancies: 25+ columns were missing from the doc, default status is `PROSPECT` not `DISCOVERED`, city is stored in `location` not a `city` column, raw discovery data goes in `scoutData` not `intelData`, and `updatedAt` has no default value.

**Fix Applied:**
1. Exported actual schema via `information_schema.columns` query
2. Rewrote `docs/architecture/AgencyLead-Schema.md` from the real DDL
3. Fixed Client DDL: `originLeadId` changed from `uuid REFERENCES "AgencyLead"("id")` to `text` with no FK constraint
4. Updated `docs/lessons.md` with 11 corrected database rules

**Lesson:** NEVER write schema docs from code analysis alone. Always validate against the actual database using `information_schema.columns` or Supabase dashboard export. When a schema doc says "source of truth," it must have been validated against the real DDL — add the validation date to the doc header.

---

### 2026-03-30 — MCP Transport Failure (SSE / Streamable HTTP)

**Symptoms:** All Sonata stack agents return generic `"Error occurred during tool execution"` when called from Claude.ai. Zero runtime logs appear on Railway.

**Root Cause:** Claude.ai's MCP client sends requests that differ from standard HTTP clients (likely SSE transport differences). The server's input handling was too strict — Dre's deeply-typed Zod schema rejected payloads that didn't exactly match the expected `intelPayload` shape, throwing validation errors before the handler ran. With no error logging in the catch block, failures were invisible.

**Fix Applied (Codex V2 — PR #1, commit b16040b):**
1. Loosened Dre's input schema: `rating` from `z.number()` → `z.any().optional()`, `intelPayload` from deep Zod object → `z.any()`
2. Added defensive parsing for all `intelPayload` fields (null coalescing, type guards, fallback defaults)
3. Added `console.error("[Dre] Unhandled error:", err)` to catch block
4. Merged to `main`, Railway auto-deployed

**Verification:** Simon Cowell MCP call from Claude.ai returned a response (stub, but transport working). Confirms SSE connection is functioning.

**Lesson:** Never use deeply-typed Zod schemas for MCP tool inputs that receive data from other agents. Claude may reshape the payload slightly. Use `z.any()` with runtime validation inside the handler.

---

### 2026-03-28 — Database Column Name Mismatch

**Symptoms:** Supabase writes failing silently. Agents appeared to succeed but no data was persisted.

**Root Cause:** Code used `snake_case` column names (`demo_site_url`, `agency_leads`) but Supabase uses quoted `camelCase` (`"demoSiteUrl"`, `"AgencyLead"`).

**Fix Applied:**
1. Changed table references: `agency_leads` → `AgencyLead` (4 occurrences, 2 files)
2. Changed column references: `demo_site_url` → `demoSiteUrl`, etc.
3. Tested Supabase write locally — confirmed working

**Lesson:** ALWAYS verify column names against `docs/architecture/AgencyLead-Schema.md` before writing any Supabase query. The Supabase JS client doesn't error on wrong column names — it just silently ignores them.

---

### 2026-03-28 — Vercel Fallback Repo Mismatch

**Symptoms:** Vercel API deploy (fallback path) pointed to wrong GitHub repo.

**Root Cause:** `src/lib/vercel.ts` line ~53 had `repo: "autumn2busy/FN-real-estate"` instead of `repo: "autumn2busy/flynerd_agency"`.

**Fix Applied:** Updated to correct repo name. Verified in current codebase (commit 9c24030).

**Lesson:** Vercel fallback deploy uses `gitSource.repo` — must match the actual GitHub repo name exactly.

---

### 2026-03-27 — HeyGen Env Var Name

**Symptoms:** Dre failed to generate avatar video. Error: `HEYGEN_API_KEY is required`.

**Root Cause:** Code was looking for a different env var name than what was set in Railway.

**Fix Applied:** Standardized on `HEYGEN_API_KEY` in both code and Railway env vars.

**Lesson:** When adding new env vars, check both the code AND Railway dashboard. They must match exactly.