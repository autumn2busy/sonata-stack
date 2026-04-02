# Changelog — Sonata Stack

---

### 2026-04-01 — AC strategy integration + vault git fix + system components update
**Repo:** sonata-stack

**Files changed:**
- `docs/architecture/ActiveCampaign-Strategy.md` — NEW. Imported from Antigravity workspace. Documents hybrid outreach pattern, IaC scripts, n8n integration, and multi-env AC setup.
- `docs/architecture/System-Components.md` — Added n8n as a component. Corrected AC section with real tag (`FLYNERD_OUTREACH_PENDING`), IaC scripts, sync module, and multi-env architecture.
- `docs/pipelines/Pipeline-Full-Outbound.md` — Rewrote Hov section with correct AC hybrid workflow (tag-triggered delivery, not direct API send). Added IaC prerequisites.
- `docs/lessons.md` — Corrected AC tag from placeholder `outreach_ready` to actual `FLYNERD_OUTREACH_PENDING`. Added 7 new AC-specific lessons including IaC scripts, n8n, and `ac-sync-logic.ts`.
- `docs/setup/Vault-GitHub-Setup.md` — Fixed repo URL to `autumn2busy/command-center.git`, vault path to `Vault/command-center/`, and rewrote git commands for PowerShell (not bash).

**Decisions made:**
- AC strategy doc from Antigravity is now canonical reference for all AC integration work
- Corrected outreach tag prevents agent misconfiguration

**Notes:**
- The .gitignore error in Antigravity was from pasting file content directly into PowerShell terminal. Fixed with `Out-File` command.
- n8n was not previously documented in the architecture — now added to System Components.

---

### 2026-04-01 — Client table schema + first retained client architecture
**Repo:** sonata-stack

**Files changed:**
- `docs/architecture/Client-Schema.md` — NEW. Full schema for retained clients table including DDL, status lifecycle (ONBOARDING → MIGRATING → ACTIVE → PAUSED → CHURNED), service plan types, SEO baseline structure, and Tiny Harris query patterns. `originLeadId` is `text` (not uuid) to match AgencyLead.id type.
- `docs/architecture/AgencyLead-Schema.md` — **REWRITTEN FROM ACTUAL DDL.** Previous version was based on assumptions. Now validated against `information_schema.columns` export. Major corrections: `id` is text (not uuid), default status is PROSPECT (not DISCOVERED), 25+ previously undocumented columns added, dual-purpose table structure documented (pipeline + inbound forms).
- `docs/pipelines/Pipeline-Full-Outbound.md` — Added Lead → Client conversion flow and updated Tiny Harris to reference Client table.
- `docs/lessons.md` — Rewrote Database section with 11 corrected rules from actual DDL. Added Client Management section.
- `docs/incidents/Incident-Log.md` — Added schema mismatch incident (uuid vs text FK failure).
- `docs/setup/Obsidian-Vault-Setup.md` — NEW. Git submodule setup instructions.
- `CLAUDE.md` — Added Client-Schema.md to mandatory reads and docs directory listing.
- `docs/changelog.md` — This entry.

**Decisions made:**
- Retained clients get a separate `"Client"` table rather than overloading `"AgencyLead"`. Clean separation between pipeline (sales) and operations (delivery).
- Each client gets their own Vercel project, separate from `flynerd-demo-lead` which is for demos only.
- Clients acquired outside the pipeline (like the first client) have `originLeadId: NULL`.
- Service plans: MAINTENANCE, SEO, FULL, CUSTOM — tracked in `services` JSONB for flexibility.

**Notes:**
- First retained client: Wix → Vercel migration + SEO + monthly maintenance. Acquired pre-pipeline (originLeadId: NULL).
- DDL needs to be executed in Supabase to create the table.
- Tiny Harris implementation should query "Client" table, not "AgencyLead".

---

### 2026-03-31 — Knowledge base + CLAUDE.md overhaul
**Repo:** sonata-stack

**Files changed:**
- `CLAUDE.md` — Complete rewrite. Added mandatory reads section pointing to docs/. Removed stale "known bug" reference to FN-real-estate (already fixed). Added agent implementation status table. Changed lessons/changelog paths from Obsidian vault to in-repo docs/. Added "Docs Are Law" principle.
- `docs/architecture/AgencyLead-Schema.md` — NEW. Full DDL reference with column types, nullability, defaults, status lifecycle, and per-agent write patterns.
- `docs/pipelines/Pipeline-Full-Outbound.md` — NEW. Agent roster with inputs, outputs, dependencies, external APIs, and env var reference.
- `docs/playbooks/Debugging-Playbook.md` — NEW. Decision tree for failure modes, local test commands for every external service, common gotchas.
- `docs/playbooks/Niche-Selection-Playbook.md` — NEW. Market selection criteria, Google Places type mapping, active markets tracker.
- `docs/incidents/Incident-Log.md` — NEW. Four past incidents documented: SSE transport failure, DB column mismatch, Vercel fallback repo, HeyGen env var.
- `docs/lessons.md` — NEW. Structured mistake patterns across Database, MCP, TypeScript, Vercel, HeyGen, Enrichment, AI Agent Design, and ActiveCampaign categories.
- `docs/changelog.md` — NEW. This file. Replaces Obsidian-based changelog.

**Decisions made:**
- Moved knowledge base from local Obsidian vault into the repo so all AI agents (Claude Code, Codex, claude.ai) can access it via git clone
- CLAUDE.md now enforces "read before act" protocol — mandatory doc reads before DB queries, debugging, or agent implementation
- Lessons file uses structured categories instead of a running journal for faster scanning
- Changelog moved from `C:/Users/Mother/Vault/command-center/00-Inbox/changelog-sonata.md` to `docs/changelog.md`

**Notes:**
- Obsidian vault remains the primary authoring environment. Set up Obsidian Git plugin to sync `command-center/Sonata/` → this repo's `docs/` folder
- Schema doc needs validation against actual Supabase DDL — columns listed are based on CLAUDE.md + code analysis, not a direct DB export
- Agent status table in CLAUDE.md should be updated as stubs are implemented

---

### 2026-03-30 — Codex V2: Dre input hardening (PR #1)
**Repo:** sonata-stack

**Files changed:**
- `src/index.ts` — Loosened Dre's Zod schema (rating → z.any().optional(), intelPayload → z.any()). Added defensive parsing for all intelPayload fields. Added console.error in catch block.

**Decisions made:**
- Used z.any() instead of deep Zod types for MCP inputs that receive data from other agents
- Runtime validation inside handler preferred over schema-level validation

**Notes:**
- This fixed the MCP transport failure — agents now respond from Claude.ai
- Simon Cowell returns a stub response (not implemented yet), confirming transport works

---