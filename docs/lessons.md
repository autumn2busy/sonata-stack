# Lessons — Sonata Stack

> **Read at the start of every session. Check before making changes in each category.**
> After ANY correction from the user, add a new entry here.

---

## Database

- **NEVER use snake_case** for AgencyLead pipeline columns. Table is `"AgencyLead"` (quoted PascalCase), pipeline columns are `camelCase`. Note: some inbound/tracking columns use snake_case — see schema doc for the full list.
- **ALWAYS verify column names** against the schema doc before writing any `.from()`, `.update()`, `.select()`, or `.eq()` call. The Supabase JS client silently ignores wrong column names — it does not throw an error.
- **`id` is TEXT with NO default.** Always supply it on INSERT using `crypto.randomUUID()`. Do NOT assume uuid auto-generation.
- **`updatedAt` has NO default.** Must be set explicitly on every INSERT and UPDATE: `updatedAt: new Date().toISOString()`.
- **The city column is `location`, NOT `city`.** There is no `city` column on AgencyLead.
- **Simon's raw data goes in `scoutData`, NOT `intelData` or `discoveryData`.** `intelData` is for Yoncé's analysis output.
- **Default status is `PROSPECT`, NOT `DISCOVERED`.** Simon must explicitly set `status: "DISCOVERED"` on insert.
- **`outreachHistory` JSONB exists.** Hov should append to this, not just flip the status.
- **Table is dual-purpose.** AgencyLead stores both outbound pipeline leads AND inbound form submissions from demo sites. Filter by `leadSource` to distinguish.
- **Duplicate timestamp columns exist:** `createdAt`/`updatedAt` (without tz) AND `created_at`/`updated_at` (with tz). Use the camelCase pair for consistency.
- **Client table `originLeadId` is `text`, not `uuid`.** AgencyLead `id` is text, so any FK reference must also be text. No database-level FK constraint — enforce in application code.

## MCP / Transport

- If MCP tool returns generic error and Railway shows **zero logs** → the problem is the connection, not the code. Disconnect/reconnect MCP in Claude.ai settings.
- **NEVER use deeply-typed Zod schemas** for MCP tool inputs that receive data from other agents. Claude may reshape payloads slightly. Use `z.any()` with runtime validation inside the handler.
- **NEVER retry an MCP tool call more than twice.** Switch to local testing.

## TypeScript / Build

- `dist/` is gitignored. Railway compiles from `src/` via `npm run build`. **Always verify compiled output matches source** before pushing.
- **NEVER add `express.json()` globally.** StreamableHTTPServerTransport reads the raw body. A body parser kills it.
- After editing source, run `npm run build` and `grep` the relevant change in `dist/index.js` to confirm it compiled.

## Vercel

- Fallback repo is `autumn2busy/flynerd_agency` (NOT `FN-real-estate`). Fixed 2026-03-28.
- Deploy hook URL changes when regenerated. If deploy returns 404, get the new URL from Vercel dashboard.
- Team ID: `team_uSLsRZHA5u8JAkI9tVVipAFi`. Project: `flynerd-demo-lead`.

## HeyGen

- Env var is `HEYGEN_API_KEY`. Not `HEYGEN_KEY` or `HEY_GEN_API_KEY`.
- Video generation is async. Dre polls for up to 10 minutes. Don't await synchronously.

## Enrichment

- Google Places API does NOT return email addresses. Email enrichment comes from Hunter.io Domain Search.
- Hunter.io free tier: 25 domain searches/month. Prioritize NO_WEBSITE leads.
- If a business has no website domain to search, fall back to phone number only.

## AI Agent Design

- Don't ask the user for information that's already documented in `docs/`. Read the docs first.
- When a new session starts, check `docs/incidents/Incident-Log.md` for known issues before investigating.
- Check this lessons file before making changes in any category listed above.

## ActiveCampaign

- The outreach tag is `FLYNERD_OUTREACH_PENDING` (NOT `outreach_ready` — that was a placeholder). This tag triggers the AC automation that sends the actual email.
- AC API URL format: `https://youraccountname.api-us1.com`
- Each workspace subfolder (`flynerd-agency`, `flynerdtech`, `sonata-stack`, `raidsecuritycorp`) has its own `.env` with `ACTIVECAMPAIGN_URL` and `ACTIVECAMPAIGN_KEY` — they may point to different AC accounts.
- **Infrastructure as Code:** AC pipelines and custom fields are created programmatically via `create-ac-pipeline.mjs` and `create-deal-fields.mjs`. Run these before testing any agent that touches AC.
- **n8n** handles complex multi-stage workflows tied to AC — niche-specific campaigns route through n8n nodes.
- **`ac-sync-logic.ts`** handles data formatting between AI agents and AC deal schema. All AC writes go through this module.
- Hov does NOT send emails directly. It creates the contact, pushes AI-generated copy into a custom field, tags with `FLYNERD_OUTREACH_PENDING`, and AC's native automation handles delivery (preserving deliverability and tracking).

## Client Management

- Retained clients live in the `"Client"` table, NOT `"AgencyLead"`. These are separate tables with separate schemas.
- `"AgencyLead"` is the sales pipeline. `"Client"` is post-sale.
- When a lead converts to WON, create a `"Client"` row with `originLeadId` pointing back to the AgencyLead.
- Clients onboarded outside the pipeline (referrals, existing relationships) have `originLeadId: NULL`.
- Each client gets their own Vercel project — do NOT deploy to `flynerd-demo-lead` (that's for demos only).
- Tiny Harris queries `"Client"` for monthly reports, NOT `"AgencyLead"`.