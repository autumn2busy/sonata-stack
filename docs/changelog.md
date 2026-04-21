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

### 2026-04-18 — Prompt C: Kris Jenner webhook wired + agent de-stubbed
**Repo:** sonata-stack

**Files changed:**
- `src/webhook.ts` — renamed route `/webhook/post-call` → `/webhooks/ac/call-completed`, parses AC payload shape (deal context from URL query params, contact context from form-encoded POST body). Returns 202 immediately and dispatches `runKrisJennerClose` via `setImmediate` so Kris's 15-60s work doesn't block AC's webhook timeout.
- `src/agents/kris.ts` — full de-stub. Real Supabase lookup via `getLeadById`, real `execDre` call for demo rebuild, status snapshot/restore around Dre's side-effect, real Stripe Checkout Session via inline `price_data`, Claude `claude-haiku-4-5-20251001` email draft, AC writeback to contact field 171 (CLOSE_DEMO_URL).
- `src/index.ts` — `kris_jenner` MCP tool signature updated to new input shape `{ agencyLeadId, contactId, dealId, dealValueDollars? }`. Dropped `websiteUrl` because Kris uses cached intel, not a fresh scrape.
- `src/lib/stripe.ts` — NEW. Lazy-initialized Stripe client + `createCloseCheckoutSession` helper using inline `price_data` so no pre-existing Stripe Product is required.
- `src/lib/ac.ts` — NEW. Minimal AC helper for sonata-stack (`updateContactField`). Mirrors flynerd-agency's helper.
- `CLAUDE.md` — agent status table: Kris Jenner STUB → IMPLEMENTED (2026-04-18).
- `docs/specs/2026-04-18-kris-jenner-webhook.md` — NEW. Full AC automation config spec (URL format, headers, body shape, env vars, manual activation steps).
- `docs/lessons.md` — NEW lesson: "Never grep `.env` with `output_mode: content`" (live Stripe key leak incident).
- `package.json` — added `stripe ^22.0.2` dependency.

**Decisions made:**
- Chose Stripe Checkout Sessions API (not Payment Links) because Sessions support inline `price_data` — no pre-created Stripe Product required. Matches owner's "no Stripe products yet" constraint.
- Kris reuses the same demo URL rather than generating a new one. Dre's `getCanonicalDemoUrl(leadId)` is deterministic, and the prospect already has the URL from cold outreach. Rebuilding refreshes content in place.
- Status snapshot/restore around Dre call: Dre unconditionally writes `status=DEMO_BUILT`. That's correct for round 1 but wrong post-call. Kris snapshots original status before and restores after. One extra DB write, avoids forking `execDre`.
- Stripe amount: uses AC `%DEAL_VALUE%` if parsable, else falls back to $2,500 default (matches `flynerd-agency` outreach route's `dealValue = 250000`).
- Email is drafted only, not sent. AC automation sends the templated email with `%CLOSE_DEMO_URL%` personalization. Kris's draft is for owner visibility in logs.
- `client_id` (166), `niche` (167), `demo_url` (168) are in the webhook payload but intentionally unused by Kris this iteration. They're referenced in the parser for resilience but not read.

**Notes:**
- AC automation "FlyNerd — Call Completed Post-Call Close" remains **DRAFT**. Do NOT activate until: STRIPE_API_KEY rotated + set on Railway, ACTIVECAMPAIGN_URL/KEY + WEBHOOK_SECRET set on Railway, sonata-stack deployed, end-to-end smoke test with `autumn.s.williams+kris_smoke@gmail.com` lead passes.
- Discovery-notes capture (Google Meet transcript → structured notes → AC deal note) remains future work. When wired, Kris reads those notes and passes them into Dre config + Claude prompt.
- AgencyLead → Client transition on successful Stripe payment is still the separate n8n workflow (decision #8) — not this commit.

---

---
### 2026-04-20 — Kris Jenner profile-aware deposits

**Repo:** sonata-stack

**Files changed:**
- `src/lib/profile.ts` — NEW. `QualificationProfile` type, `getQualificationProfile(lead)` classifier (mirrors `flynerd-agency/components/demo/nicheConfig.ts` MEDSPA_KEYWORDS), `PROFILE_DEPOSIT_CENTS` map, `profileProductName()` helper.
- `src/agents/kris.ts` — classifies profile after Supabase lookup, picks deposit amount from PROFILE_DEPOSIT_CENTS, passes profile-specific productName to Stripe. AC `dealValueDollars` still overrides when explicitly set.
- `CLAUDE.md` — updated Kris agent status row with new behavior.

**Decisions made:**
- Profile classifier ported (not imported) into sonata-stack. Two reasons: (1) flynerd-agency is a Next.js project and sonata-stack is a Node server — no shared import path without extra tooling. (2) Ports are safer across MCP tool boundaries than runtime imports. Tradeoff: the MEDSPA_KEYWORDS list must stay in sync between both repos. Documented with a clear `// Keep in sync with ...` comment in profile.ts.
- Default deposit amounts match the 2026-04-20 live catalog 50% deposits: $750 UL / $1,750 TP. If the catalog ever moves off 50/50 splits, update PROFILE_DEPOSIT_CENTS AND the catalog at the same time.
- Did NOT switch Kris to Payment Links keyed by lookup_key (option D2 in the original plan). Kept Checkout Sessions with inline price_data (option D1) because: (1) per-deal Stripe metadata is cleaner with Checkout Sessions, (2) one less AC deploy blocker, (3) we can migrate to Payment Links later if we want to deprecate the script route.
- `productName` on the Stripe checkout page now reads "FlyNerd AI Website Quickstart - {businessName}" or "FlyNerd AI Website Concierge - {businessName}" depending on profile, replacing the generic "FlyNerd Build Package - {businessName}".

**Verification:**
- `npm run build` passed.
- `grep -c` on dist/ confirms profile.ts compiled (3 refs) and kris.ts references (4 refs, imports + call sites).

**Notes / pending:**
- AC automation "FlyNerd — Call Completed Post-Call Close" is still DRAFT. Activation still blocked on Railway env deploy + smoke test.
- If Jovel/any client signs up under a custom deal value, AC must set the deal value on the close deal before the webhook fires so `dealValueDollars` override kicks in. Otherwise Kris uses the profile default, which may differ from a negotiated rate.
- flynerd-agency's profile classifier at `components/demo/nicheConfig.ts` must stay in sync — consider extracting to a shared package if we ever add a third agent that classifies.

---
