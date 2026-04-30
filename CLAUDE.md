# CLAUDE.md — Sonata Stack Project Rules

> Auto-loaded by Claude Code at session start. Sets behavioral expectations for any AI agent touching this codebase.
> **If a rule here conflicts with something a doc says, this file wins. Update the doc, not your behavior.**

---

## ⚠️ Read These Before You Touch Anything

Run this checklist at the **start of every session**, no exceptions:

1. `docs/lessons.md` — every mistake we've already paid for
2. `docs/incidents/Incident-Log.md` — known past failures + fixes
3. `docs/architecture/AgencyLead-Schema.md` — table contract (see ⚠️ caveat below)
4. `docs/pipelines/Pipeline-Full-Outbound.md` — agent flow

Before any **DB query**: re-read the relevant schema doc.
Before any **agent debug**: read `docs/playbooks/Debugging-Playbook.md`.
Before any **agent implementation or refactor**: read the pipeline doc.

**Do not ask the user for information that is already documented.** If the docs are silent or contradict each other, say so explicitly and ask one targeted question — don't guess.

---

## The Project in 60 Seconds

**Sonata Stack** is the MCP server that runs FlyNerd's outbound agency pipeline. It exposes named agent tools (Simon, Yoncé, Dre, Hov, Tyrion, Kris, Cersei, Tiny, Kendrick) over Streamable HTTP. Railway hosts it. Claude.ai connects to it.

**This is not the only writer.** A separate Next.js app (`flynerd-agency` repo) also writes to the same Supabase `"AgencyLead"` table from `app/api/contact/`, `app/api/agents/closer`, `app/api/agents/expire`, and `app/api/webhooks/*`. The legacy agency scout/intel/build/outreach/growth/orchestrator routes were deleted after migrating orchestration into Sonata. **n8n** runs the `FlyNerd — AC Tag Sync to Supabase Status` workflow (id: `d42cyp27QDIqZczu`) which also writes status. Any rule that lives only in this file is a rule the other writers don't know about — flag cross-repo concerns explicitly.

---

## Critical Contracts

### 1. Database Naming — Quoted camelCase

Table: `"AgencyLead"`. Columns: `camelCase` for pipeline columns, `snake_case` for inbound/tracking columns. The Supabase JS client **silently ignores wrong column names** — no error, just lost data. Always verify against the schema doc before writing `.from()`, `.update()`, `.select()`, or `.eq()`.

Non-negotiables:

- `id` is `text`, no default → supply `crypto.randomUUID()` on every INSERT
- `updatedAt` has no default → set `new Date().toISOString()` on every INSERT/UPDATE
- City lives in `location`, not `city`
- Simon's raw discovery → `scoutData`, not `intelData`

### 2. Status — Canonical 13 (CHECK constraint locked in prod)

```
PROSPECT, DISCOVERED, AUDITED, DEMO_BUILT, OUTREACH_SENT,
REPLIED, CALL_BOOKED, CLOSED_WON, CLOSED_LOST,
OUTREACH_EXHAUSTED, DEMO_EXPIRED, INBOUND_NEW, CLIENT_ACTIVE
```

Forbidden values (writing any of these will throw on the CHECK constraint): `BUILT`, `PITCHED`, `NEGOTIATING`, `ONBOARDING`, `CLOSED_ASSETS_BUILT`, `WON`, `LOST`, `EXPIRED`, `OUTREACHED`, log-message strings, integers.

⚠️ **Known doc drift:** `AgencyLead-Schema.md` still lists pre-refactor status values (BUILT, NEGOTIATING, etc.). The canonical 13 above are the ground truth per the 2026-04-08 status refactor and the live `agency_lead_status_check` constraint. Update the schema doc before trusting it.

### 3. Status vs Stage

- **`status`** = lifecycle (the 13 values above). One source of truth for "where is this lead in the funnel."
- **`stage`** = operational/CRM granularity (Pipeline 5 stages, AC stage IDs). Free-form text, not constrained at DB level (which is itself a known gap — see `2026-04-08-ground-truth-status-stage.md`).

Never put CRM stage IDs (e.g. `"8"`) in `status`. Never put lifecycle values in `stage`. They are not interchangeable.

### 4. Log Before You Return (Simon Crash Rule)

Every error exit path in every MCP tool MUST `console.error("[AgentName] <context>:", err)` BEFORE returning `{ isError: true }` or throwing. The MCP framework converts errors into a generic client-facing string and erases the detail. **Server-side logs are the only forensic trail.** This rule was paid for in the 2026-04-08 Simon silent-crash incident — don't make us pay for it again.

### 5. Build Verification

TypeScript source in `src/`, compiled to `dist/` (gitignored). Railway compiles from source. Local testing uses `dist/`. **After any source change:**

```bash
npm run build
grep -n "<your_change>" dist/index.js  # confirm it actually compiled
```

A correct `src/` with a stale `dist/` is the same as broken code.

---

## Hov Contract — Read Before Touching Anything Named "Hov"

There are TWO distinct components named "Hov." This is a known foot-gun.
Days have been lost to confusing them. Read this before writing or debugging
anything in the outreach path.

## Working Rules

### Read First, Ask Second, Guess Never

If `docs/` covers it, use it. If it doesn't, ask one specific question. Never invent column names, env var names, status values, or agent behavior.

### Plan Before You Build

For any task with 3+ steps or an architectural choice, write the plan to `tasks/todo.md` first, get it approved, then execute. If something goes sideways mid-execution, **stop and re-plan** — don't push through.

### No Blind Retries

If an MCP tool call fails twice with the same error, stop. Switch to local testing (`node dist/index.js` + `curl`). Three failed retries means you're guessing in production.

### Subagents for Parallel Work

Offload research, codebase exploration, and parallel analysis to subagents. Keep the main context focused on decisions and integration.

### Verification Before Done

A task is not done until you've proven it works. For DB changes: query and confirm the row. For tool changes: invoke and confirm the response. For TS changes: grep `dist/`. "Should work" doesn't ship.

### Find the Root Cause

No band-aids. No "let's just catch this and move on." If you don't understand why something failed, you haven't fixed it — you've muffled it.

### Demand Elegance, Proportionally

Non-trivial change → pause and ask "is this the elegant version, or the first version that compiled?" Trivial fix → just ship it. Don't over-engineer a one-line null check.

### Capture Every Correction

User corrects you → update `docs/lessons.md` with the pattern and a rule that prevents the repeat. Outage or production failure → update `docs/incidents/Incident-Log.md` with symptoms, root cause, fix, lesson. The point is to make the same mistake twice impossible.

---

## Agent Implementation Status

| Agent        | Status                           | Location                 | Notes                                                                                     |
| ------------ | -------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Simon Cowell | IMPLEMENTED (post-crash patched) | `src/index.ts` ~L27      | qualification.ts + per-item try/catch added 2026-04-08; verify logging on all error paths |
| Yoncé        | IMPLEMENTED                      | `src/index.ts` ~L39      |                                                                                           |
| Dre          | IMPLEMENTED                      | `src/index.ts` ~L161     | Codex V2 hardened (z.any() inputs, defensive parsing)                                     |
| Hov          | STUB                             | `src/index.ts` ~L287     | Must use AC tag-trigger flow, not direct send                                             |
| Tyrion       | STUB                             | `src/index.ts` ~L332     | Per-lead error isolation required                                                         |
| Kris Jenner  | IMPLEMENTED (2026-04-21)         | `src/agents/kris.ts`     | Supabase lookup + profile classifier + profile-aware Stripe Checkout Session + Claude internal draft + AC writeback to field 173 (%OFFER_SLUG%). Does NOT rebuild the demo or touch fields 168/171 — those belong to the outreach flow (Dre) and a future post-build launch process respectively. Profile classifier at `src/lib/profile.ts`: underserved_local defaults to $750 (UL), tech_enabled_premium to $1,750 (TP). AC `dealValueDollars` overrides. Triggered by POST /webhooks/ac/call-completed. |
| Cersei       | STUB                             | `src/index.ts` ~L319     | Hourly sweep, sets `DEMO_EXPIRED` (NOT `EXPIRED`)                                         |
| Tiny Harris  | STUB                             | `src/index.ts` ~L304     | Queries `"Client"` table, NOT `"AgencyLead"`                                              |
| Kendrick     | STUB                             | `src/agents/kendrick.ts` | SEO/AEO execution                                                                         |

Update this table the moment status changes. A stale agent status table is how Simon got debugged for hours under the wrong assumption.

---

## Testing Conventions

- **Test lead aliases:** `autumn.s.williams+<scenario>@gmail.com` (e.g. `+execution_stage`, `+execution_ac`, `+webhook`). Never test against real prospect emails.
- **Local MCP test:** `node dist/index.js &` then `curl -X POST http://localhost:8080/mcp -H "Content-Type: application/json" -d '<jsonrpc payload>'`
- **DB sanity check before any insert path test:**
  ```sql
  SELECT id, "placeId", "businessName", status, "createdAt"
  FROM "AgencyLead"
  WHERE "leadSource" IN ('simon_cowell', 'COLD')
  ORDER BY "createdAt" DESC LIMIT 50;
  ```

---

## ActiveCampaign / n8n Integration

- Outreach tag: `FLYNERD_OUTREACH_PENDING` (NOT `outreach_ready`). This tag triggers the AC automation that actually sends the email. Hov never sends email directly.
- AC sync writes go through `ac-sync-logic.ts` — no direct AC API calls scattered through agents.
- AC pipelines + custom fields are IaC: `node create-ac-pipeline.mjs` and `node create-deal-fields.mjs`. Run before testing any AC-touching agent.
- **n8n owns status writes triggered by AC tags** (workflow `d42cyp27QDIqZczu`). Tag mappings live in `2026-04-08-ac-tag-sync-workflow-spec.md`. If you're about to write logic that flips status based on an AC event, check whether n8n already does it — don't duplicate.
- Pipeline IDs are hardcoded in `flynerd-agency` (`api/contact/route.ts` uses pipeline 3, stage 8). They drift from `create-ac-pipeline.mjs`. Verify before assuming.

---

## Vercel

- Demo project: `flynerd-demo-lead`, deploys from `autumn2busy/flynerd_agency` (NOT `FN-real-estate` — that was the 2026-03-28 bug).
- Team ID: `team_uSLsRZHA5u8JAkI9tVVipAFi`
- Each retained client gets their own Vercel project. Never deploy client work to `flynerd-demo-lead`.

---

## Debugging — Quick Reference

Full decision tree: `docs/playbooks/Debugging-Playbook.md`. Hot path:

1. Generic `"Error occurred during tool execution"` + **zero** `[Agent]` logs in Railway → MCP connection stale. Disconnect/reconnect in Claude.ai settings. Not a code bug.
2. Generic error + logs present → read the error. Match it to `Incident-Log.md`.
3. "Supabase update failed" silently → almost always wrong column name. Re-check the schema doc.
4. Zod validation error on inter-agent input → loosen to `z.any()` and validate inside the handler. Claude reshapes payloads.
5. `npm run build` then `grep` your change in `dist/index.js`. If it's not there, Railway is running stale code.

---

## Change Logging

After any task that modifies files, append (never overwrite) to `docs/changelog.md`:

```
### YYYY-MM-DD — [brief title]
**Repo:** sonata-stack
**Files changed:**
- path/to/file.ts — what changed and why
**Decisions made:**
- choices and tradeoffs
**Notes:**
- anything the owner needs to know

---
```

If the change touches DB schema, env vars, or AC config, also update the relevant doc in the same commit. Code-without-doc-update is how the schema doc went stale.

---

## Agent Deletion Protocol

Any task that deletes, collapses, or replaces a component, route, API endpoint, database column, or architectural primitive MUST:

1. Log a changelog entry with the literal prefix "DELETED:" in the title
2. List the deleted artifact(s) by file path
3. List what replaces them (by file path) or confirm nothing replaces them
4. State the reason in 1-2 sentences
5. Be flagged for owner review before merge, not after

Consolidation is a form of deletion. Refactoring that removes a component the owner has previously seen in the codebase counts as deletion.

If in doubt, ask the owner before deleting. A clarifying question costs 5 minutes. A silent deletion costs hours of reverse-engineering.

---

## Docs Directory

```
docs/
├── architecture/
│   ├── AgencyLead-Schema.md      ← Pipeline leads (⚠️ status section needs canonical-13 update)
│   └── Client-Schema.md          ← Retained clients
├── pipelines/
│   └── Pipeline-Full-Outbound.md ← Agent inputs/outputs/dependencies
├── playbooks/
│   ├── Debugging-Playbook.md     ← Failure decision tree + local test commands
│   └── Niche-Selection-Playbook.md
├── incidents/
│   └── Incident-Log.md           ← Past failures, root causes, fixes
├── specs/                         ← Refactor + workflow specs (status refactor, AC sync, pipeline 5)
├── investigations/                ← Crash investigations (Simon, Codex, etc.)
├── lessons.md                    ← Mistake patterns + preventive rules
└── changelog.md                  ← Append-only change log
```

---

## Stop Conditions

Stop and surface to the user immediately if:

- Any test fails twice in a row
- A rollback gets triggered
- A new incident gets logged
- You're about to change anything in a production AC pipeline
- You're about to run a database migration
- The docs and the code disagree on a contract (status values, column names, env vars) — do not pick a side silently

---
