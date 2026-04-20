# Lessons — Sonata Stack + FlyNerd Workspace

> Read at the start of every session. Check the relevant section before making any change in that category.
> After ANY correction from the user, add a new entry here with the pattern that prevents the repeat.

---

## Database

- **The `"AgencyLead"` table has THREE writers**, not one: sonata-stack MCP tools, flynerd_agency API routes, and the n8n workflow `d42cyp27QDIqZczu`. Before adding new write logic anywhere, check whether one of the others already does it.
- **NEVER use snake_case for AgencyLead pipeline columns.** Table is `"AgencyLead"` (quoted PascalCase), pipeline columns are `camelCase`. Some inbound/tracking columns use snake_case — see schema doc.
- **ALWAYS verify column names against the schema doc** before writing any `.from()`, `.update()`, `.select()`, or `.eq()` call. The Supabase JS client silently ignores wrong column names — it does not throw.
- **`id` is TEXT with NO default.** Always supply `crypto.randomUUID()` on INSERT.
- **`updatedAt` has NO default.** Set on every INSERT and UPDATE: `updatedAt: new Date().toISOString()`.
- **The city column is `location`, NOT `city`.** No `city` column exists.
- **Simon's raw data goes in `scoutData`, NOT `intelData` or `discoveryData`.**
- **Default status is `PROSPECT`, NOT `DISCOVERED`.** Simon must explicitly set `status: "DISCOVERED"`.
- **`outreachHistory` JSONB exists.** Hov appends to it, not just flips status.
- **Table is dual-purpose.** Filter by `leadSource` to distinguish outbound (`COLD`/`simon_cowell`) from inbound (form submissions).
- **Duplicate timestamp columns exist.** Use the camelCase pair (`createdAt`/`updatedAt`) for app writes. The snake_case pair auto-populates via `now()`.
- **Client table `originLeadId` is `text`, not `uuid`.** AgencyLead `id` is text, so any FK reference must be text. No DB-level FK constraint — enforce in code.

## Status & Stage

- **Status is CHECK-constrained to the canonical 13.** PROSPECT, DISCOVERED, AUDITED, DEMO_BUILT, OUTREACH_SENT, REPLIED, CALL_BOOKED, CLOSED_WON, CLOSED_LOST, OUTREACH_EXHAUSTED, DEMO_EXPIRED, INBOUND_NEW, CLIENT_ACTIVE. Anything else throws.
- **Forbidden status values** (legacy, will throw): `BUILT`, `PITCHED`, `OUTREACHED`, `NEGOTIATING`, `ONBOARDING`, `WON`, `LOST`, `EXPIRED`, `CLOSED_ASSETS_BUILT`, log-message strings, integers. If you see these in code, they are pre-refactor bugs — fix per `specs/2026-04-08-status-refactor-spec.md`.
- **`status` ≠ `stage`.** Status = lifecycle (the 13 above, CHECK-constrained). Stage = CRM/operational granularity (Pipeline 5 stage names, AC stage IDs). NEVER cross them. NEVER put CRM stage IDs (e.g. `"8"`) into `status`. NEVER put lifecycle values into `stage`.
- **`stage` has no DB-level CHECK constraint.** Application code is the only enforcement. Be careful — invalid values will silently persist.
- **n8n owns most AC-tag-driven status transitions.** Workflow `d42cyp27QDIqZczu`. Before writing new tag-→-status logic, check the workflow first.

## MCP / Transport

- **If MCP tool returns generic error and Railway shows zero `[Agent]` logs** → connection is stale, not the code. Disconnect/reconnect in Claude.ai settings.
- **NEVER use deeply-typed Zod schemas for MCP tool inputs that receive data from other agents.** Claude reshapes payloads. Use `z.any()` with runtime validation inside the handler. (Codex V2 lesson.)
- **NEVER retry an MCP tool call more than twice with the same error.** Switch to local testing (`node dist/index.js` + `curl`).
- **Every error exit path MUST `console.error` BEFORE returning `{ isError: true }` or throwing.** The MCP framework converts errors into a generic client-facing string and erases the detail. Server-side logs are the only forensic trail. (Simon silent-crash, 2026-04-08.)
- **`StreamableHTTPServerTransport` reads the raw request body.** NEVER add `app.use(express.json())` globally — body parser kills it.

## TypeScript / Build

- **`dist/` is gitignored.** Railway compiles from `src/` via `npm run build`. Always verify compiled output matches source before pushing.
- **After editing source, run `npm run build` and `grep` your change in `dist/index.js`** to confirm it compiled. Source-correct + dist-stale = broken in production.
- **MCP SDK version drift:** `package.json` says `^1.12.0`, lockfile may resolve higher. Pin if behavior changes between versions.

## Vercel

- **Demo project is `flynerd-demo-lead`** deploying from `autumn2busy/flynerd_agency` (NOT `FN-real-estate` — that was the 2026-03-28 bug).
- **FN-real-estate is DEPRECATED.** All demo logic is in `flynerd_agency`. Don't touch the FN-real-estate repo.
- **Deploy hook URL changes when regenerated.** If deploy returns 404, get the new URL from Vercel dashboard.
- **Team ID:** `team_uSLsRZHA5u8JAkI9tVVipAFi`. Project: `flynerd-demo-lead`.
- **Each retained client gets their own Vercel project.** Never deploy client work to `flynerd-demo-lead` (that's demo-only).

## HeyGen

- Env var is `HEYGEN_API_KEY`. Not `HEYGEN_KEY` or `HEY_GEN_API_KEY`.
- Video generation is async. Dre polls for up to 10 minutes. Don't await synchronously.

## Enrichment

- Google Places API does NOT return email addresses. Email enrichment comes from Hunter.io Domain Search.
- Hunter.io free tier: 25 domain searches/month. Prioritize NO_WEBSITE leads.
- If a business has no website domain to search, fall back to phone number only.

## ActiveCampaign

- The outreach tag is `FLYNERD_OUTREACH_PENDING` (NOT `outreach_ready`). This tag triggers the AC automation that delivers the email.
- AC API URL format: `https://youraccountname.api-us1.com`
- Each workspace subfolder (`flynerd-agency`, `flynerdtech`, `sonata-stack`, `raidsecuritycorp`) has its own `.env` — they may point to different AC accounts.
- **Infrastructure as Code:** AC pipelines and custom fields are created via `create-ac-pipeline.mjs` and `create-deal-fields.mjs`. Run before testing any AC-touching agent.
- **Pipeline IDs are hardcoded** in `flynerd_agency/api/contact/route.ts` (pipeline 3, stage 8). They drift from `create-ac-pipeline.mjs`. Verify before assuming.
- **n8n** handles complex multi-stage workflows tied to AC. The tag-sync workflow is `d42cyp27QDIqZczu`.
- **`ac-sync-logic.ts`** handles data formatting between agents and AC deal schema. All AC writes go through this module.
- **Hov does NOT send emails directly.** It pushes copy into AC, tags `FLYNERD_OUTREACH_PENDING`, and AC's native automation delivers (preserving deliverability and tracking).

## Client Management

- Retained clients live in `"Client"` table, NOT `"AgencyLead"`. Separate tables, separate schemas.
- `"AgencyLead"` is sales pipeline. `"Client"` is post-sale.
- When a lead converts to `CLOSED_WON`, create a `"Client"` row with `originLeadId` pointing back to AgencyLead.
- Clients onboarded outside the pipeline (referrals, existing relationships) have `originLeadId: NULL`.
- Each client gets their own Vercel project.
- Tiny Harris queries `"Client"`, NOT `"AgencyLead"`.
- Pipeline 5 owns the post-sale lifecycle. All Pipeline 5 stages map to `status: CLIENT_ACTIVE` except `Churned` (maps to `CLOSED_LOST`). See `specs/2026-04-08-pipeline-5-spec.md`.

## Agent Routing (which AI tool for which job)

- **TypeScript bugs, build errors, dist/ issues** → Claude Code
- **Static analysis, code review** → Codex
- **Runtime crashes, DB-state-dependent bugs, MCP tool failures** → Claude Code or Antigravity (anything with live execution + DB access). **NEVER Codex** — it cannot reproduce runtime state and produces confident wrong answers. (Simon crash, 2026-04-08: Codex blamed early-exit branches that were empirically refuted by the prior successful response. Codex was honest about the limit; the routing was the bug.)
- **Live API debugging, log inspection** → Antigravity
- **Doc reconciliation, multi-file rewrites** → Claude (web/desktop)

## AI Agent Design

- Don't ask the user for information that's already documented in `docs/`. Read first.
- When a new session starts, check `docs/incidents/Incident-Log.md` for known issues before investigating.
- Check this lessons file before making changes in any category above.
- **If a hypothesis contradicts known empirical evidence, the hypothesis is wrong** — even if it comes from a credible source. Don't override observations with theory.
- **Static analysis cannot find runtime bugs that depend on database state.** When a bug is "depends on what's in Supabase right now," you need live execution access. Route accordingly.

## Repo Boundaries

- **flynerd_agency** is NOT public-facing only. It runs agent and webhook logic in `app/api/agents/*`, `app/api/orchestrator/*`, `app/api/webhooks/*`. It writes directly to Supabase and AC. Treat it as a second agent runtime.
- **sonata-stack** is the MCP server. Always-on, Railway-hosted.
- **FN-real-estate** is DEPRECATED. Don't add code there.
- The aspirational rule "The Face calls Sonata Stack via MCP, never the reverse" is **not yet true.** Until flynerd_agency's agent routes are migrated out, treat all three writers as live.

## Secrets Handling

### 2026-04-18 — Live Stripe key leaked to conversation transcript

- **What happened:** When looking up which env var name the project used for Stripe, I ran the Grep tool against `flynerd-agency/.env` with pattern `^(STRIPE_[A-Z_]+)=` and `output_mode: "content"`. Grep returns full matching LINES in content mode, not just capture groups. The live `STRIPE_API_KEY=sk_live_...` landed verbatim in the conversation transcript.
- **Cost:** User had to rotate the live Stripe secret key and update it in Vercel + flynerd-agency/.env. Low operational cost because the key was only seen in a single private session, but the loss of a live secret is the kind of thing that ends careers if the transcript leaks.
- **Rule:** Never grep `.env`, `.env.local`, `.env.production`, or any file likely to contain secrets with `output_mode: "content"`. Accepted alternatives, in order of preference:
  1. Ask the user directly: "What's the env var name you use for X?"
  2. Use `output_mode: "count"` to check existence without surfacing values.
  3. Use `Grep` with `output_mode: "files_with_matches"` to confirm presence.
  4. If you must read names, pipe through a one-shot script that strips values BEFORE the tool returns.
- **Blast radius:** Applies to every repo in the workspace. Flynerd-agency, sonata-stack, FN-real-estate, command-center. Every future agent session.
- **Prevention:** CLAUDE.md (this file) now carries the rule. When onboarding a new model, the lesson loads at session start.

## Niche Awareness

- **Nested Objects** is a separate business — mortgage services / field inspections, NOT legal/financial. Do not conflate with FlyNerd work or with each other.