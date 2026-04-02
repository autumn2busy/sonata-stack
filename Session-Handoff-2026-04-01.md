# Sonata Stack — Session Handoff (April 1, 2026)

## Who I Am
I'm building FlyNerd, a web agency that uses AI agents (the "Sonata Stack") to discover local service businesses without websites, score their digital opportunity, build personalized demo sites, and send outreach. The stack runs as an MCP server on Railway.

## Project Architecture
- **MCP Server:** Railway (`sonata-stack-production.up.railway.app/mcp`) — repo: `autumn2busy/sonata-stack`
- **Database:** Supabase — tables `"AgencyLead"` (pipeline) and `"Client"` (retained clients). Both use quoted PascalCase table names and camelCase columns.
- **Demo Sites:** Vercel — project `flynerd-demo-lead` (team: `team_uSLsRZHA5u8JAkI9tVVipAFi`)
- **Video:** HeyGen — avatar walkthrough videos
- **CRM:** ActiveCampaign — tag-triggered automations, outreach tag is `FLYNERD_OUTREACH_PENDING`
- **Workflow Automation:** n8n tied to ActiveCampaign for niche-specific campaigns
- **Knowledge Base:** Obsidian vault at `C:/Users/Mother/Vault/command-center/`, synced to GitHub at `autumn2busy/command-center` (private repo)
- **Obsidian REST API:** Running at `https://127.0.0.1:27124` with cert trusted. API key is in local .env files.
- **IDEs:** Google Antigravity (primary dev), Claude Code (secondary), Claude.ai (architecture/planning)

## Vault & Knowledge Base (CRITICAL — READ THESE FIRST)
The vault repo at `autumn2busy/command-center` contains the full knowledge base. **Clone it and read the docs before doing anything.**

Key files in the vault:
- `Sonata/Architecture/AgencyLead-Schema.md` — VALIDATED against actual Supabase DDL on 2026-04-01
- `Sonata/Architecture/Client-Schema.md` — Client table for retained clients
- `Sonata/Architecture/ActiveCampaign-Strategy.md` — AC hybrid workflow (tag-triggered delivery, IaC scripts)
- `Sonata/Architecture/System-Components.md` — Full system map of all tools, IDEs, agents, services
- `Sonata/Pipelines/Pipeline-Full-Outbound.md` — Agent roster with inputs, outputs, dependencies
- `Sonata/Playbooks/Debugging-Playbook.md` — Decision tree for every failure mode
- `Sonata/Incidents/Incident-Log.md` — Past failures and fixes
- `Sonata/lessons.md` — Structured mistake patterns (READ THIS)

## Database — Known Gotchas (from actual DDL validation)
- `"AgencyLead"."id"` is **TEXT with NO default** — must supply on INSERT via `crypto.randomUUID()`
- `"updatedAt"` has **NO default** — must set explicitly on every INSERT and UPDATE
- City is stored in `"location"`, NOT a `"city"` column
- Raw discovery data goes in `"scoutData"`, NOT `"intelData"`
- Default status is `'PROSPECT'`, not `'DISCOVERED'` — Simon must set explicitly
- `"outreachHistory"` JSONB exists — Hov should append to it
- Table is dual-purpose: pipeline leads AND inbound form submissions from demo sites
- Duplicate timestamp columns exist: `createdAt`/`updatedAt` (without tz) AND `created_at`/`updated_at` (with tz) — use camelCase pair

## Agent Status
| Agent | Status | Notes |
|-------|--------|-------|
| Simon Cowell | **STUB** | Returns placeholder text. Needs Google Places API (New) Text Search implementation |
| Yoncé | **IMPLEMENTED** | Google Places reviews → Claude Haiku analysis → Supabase write |
| Dre | **IMPLEMENTED** | Vercel deploy + HeyGen video + Supabase write. Codex V2 hardened input validation |
| Hov | **STUB** | Needs: Claude email gen → AC contact/deal creation → tag `FLYNERD_OUTREACH_PENDING` → AC automation sends |
| Tyrion | **STUB** | Orchestrator — chain Simon → Yoncé → Dre → Hov internally |
| Kris Jenner | **STUB** | Post-call closer |
| Cersei | **STUB** | Demo expiry enforcement |
| Tiny Harris | **STUB** | Monthly client reports — queries `"Client"` table, NOT `"AgencyLead"` |

## MCP Transport: WORKING
Codex V2 fixed the SSE transport issue. Simon Cowell returns a stub response confirming the connection works. The fix: loosened Dre's Zod schema from deep types to `z.any()` with runtime validation.

## ActiveCampaign Integration (from Antigravity)
- **Hybrid approach:** Hov creates contact + deal via AC API, pushes AI-generated email into custom field, tags with `FLYNERD_OUTREACH_PENDING`. AC native automation delivers the email.
- **IaC scripts:** `create-ac-pipeline.mjs` (deal stages), `create-deal-fields.mjs` (custom fields)
- **Sync module:** `ac-sync-logic.ts` handles data formatting between agents and AC
- **Multi-env:** Each workspace subfolder has its own `.env` with `ACTIVECAMPAIGN_URL` and `ACTIVECAMPAIGN_KEY`

## Implementation Plan Exists
A detailed implementation plan was created at `sonata-stack-implementation-plan.md` covering:
- **Phase 1:** Simon Cowell — Google Places API (New) Text Search, niche-to-type mapping, lead qualification, Hunter.io email enrichment (free tier, 25/mo)
- **Phase 1.5:** Email enrichment waterfall (Hunter.io Domain Search → phone fallback)
- **Phase 2:** Hov — AC-only approach (no separate email provider), tag-triggered delivery
- **Phase 3:** Tyrion — Internal function calls (not MCP self-call), extract agents into `src/agents/`, process all qualified leads up to 20

## First Retained Client
- Pre-pipeline client retained for SEO + monthly maintenance
- Wix → Vercel migration (separate Vercel project from demos)
- `"Client"` table created in Supabase with `originLeadId: NULL` (acquired outside pipeline)

## Submodules in Vault
The vault repo has 4 submodules:
- `nested-objects-starter` → `autumn2busy/nested-objects-starter.git`
- `flynerd-agency` → `autumn2busy/flynerd_agency.git`
- `raidsecuritycorp` → `autumn2busy/raidsecuritycorp.git`
- `sonata-stack` → `autumn2busy/sonata-stack.git`

## Claude Code MCP Bridge — NOT YET WORKING
Attempted to connect Obsidian vault to Claude Code via MCP bridge. `uvx mcp-obsidian` failed (uvx/Python not installed). `npx obsidian-mcp` attempted but not confirmed connected. Claude Code CAN still read vault files directly from filesystem since its working directory is `~\Vault\command-center`. The MCP bridge is a nice-to-have, not a blocker.

## What Needs to Happen Next
1. **Get Claude Code MCP bridge working** — try `npx -y obsidian-mcp "C:/Users/Mother/Vault/command-center"` or install `uv` (`pip install uv`) and retry `uvx mcp-obsidian`
2. **Review and validate the implementation plan** against the now-correct schema docs
3. **Implement Simon Cowell** — Google Places API (New) Text Search, qualification filters, Supabase insert, Hunter.io enrichment
4. **Test Yoncé + Dre** on an existing lead to validate the working agents
5. **Implement Hov** — AC hybrid workflow per `ActiveCampaign-Strategy.md`
6. **Implement Tyrion** — refactor agents into `src/agents/`, wire orchestration

## Key Files in Codebase
- `CLAUDE.md` — project rules (updated with mandatory reads pointing to docs/)
- `src/index.ts` — all agent handlers (stubs and implemented)
- `src/lib/db.ts` — Supabase client
- `src/lib/vercel.ts` — Vercel API (fallback repo is correct: `flynerd_agency`)
- `src/lib/heygen.ts` — HeyGen video generation
- `src/lib/prompts.ts` — LLM prompt registry
- `src/lib/activecampaign.ts` — EMPTY STUB (`export {}`)

## Environment Variables (Railway)
`GOOGLE_PLACES_API_KEY`, `YELP_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_API_TOKEN`, `VERCEL_DEPLOY_HOOK_URL`, `HEYGEN_API_KEY`, `HUNTER_API_KEY` (to be added), `ACTIVECAMPAIGN_API_URL` (to be added), `ACTIVECAMPAIGN_API_KEY` (to be added)