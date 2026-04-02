# CLAUDE.md — Sonata Stack Project Rules

> This file is automatically read by Claude Code at the start of every session.
> It sets behavioral expectations for any AI agent working on this codebase.

---

## ⚠️ MANDATORY READS — Before You Touch Anything

**Before modifying ANY Supabase query**, READ `docs/architecture/AgencyLead-Schema.md` or `docs/architecture/Client-Schema.md` (depending on which table).
**Before debugging ANY agent failure**, READ `docs/playbooks/Debugging-Playbook.md`.
**Before implementing ANY agent**, READ `docs/pipelines/Pipeline-Full-Outbound.md`.
**Before starting ANY session**, READ `docs/lessons.md` and `docs/incidents/Incident-Log.md`.

These files are the source of truth. Do not ask the user for information that is already documented. Do not guess at column names, env var names, or agent behavior — look it up.

---

## Critical Project Context

### Database Naming Convention ⚠️
The Supabase database uses **quoted camelCase** identifiers, NOT snake_case:
- Table: `"AgencyLead"` (never `agency_leads` or `agency_lead`)
- Full column reference: `docs/architecture/AgencyLead-Schema.md`

**Before writing ANY Supabase `.from()`, `.update()`, `.select()`, or `.eq()` call, verify the exact table and column names in the schema doc.**

### Build & Deploy
- Source: TypeScript in `src/`
- Compiled: `dist/` (gitignored — never committed)
- Railway builds from source using `npm run build`
- **After any code change:** run `npm run build` locally AND verify `dist/` output before pushing
- Verify: `grep -n "<search_term>" dist/index.js` to confirm fixes compiled

### Vercel Integration
- Demo site project: `flynerd-demo-lead` deploys from `autumn2busy/flynerd_agency`
- Team ID: `team_uSLsRZHA5u8JAkI9tVVipAFi`
- Deploy hook and API token are in Railway env vars

### Agent Implementation Status

| Agent | Status | Location |
|-------|--------|----------|
| Simon Cowell | STUB | `src/index.ts` line ~23 |
| Yoncé | IMPLEMENTED | `src/index.ts` line ~39 |
| Dre | IMPLEMENTED | `src/index.ts` line ~161 |
| Hov | STUB | `src/index.ts` line ~287 |
| Tyrion | STUB | `src/index.ts` line ~332 |
| Kris Jenner | STUB | `src/index.ts` line ~349 |
| Cersei | STUB | `src/index.ts` line ~319 |
| Tiny Harris | STUB | `src/index.ts` line ~304 |

---

## Working Rules

### 1. Read the Docs First
- Before any task, check if a relevant doc exists in `docs/`
- Before debugging, check `docs/incidents/Incident-Log.md` for known issues
- Before writing DB queries, check `docs/architecture/AgencyLead-Schema.md`
- Do NOT ask the user for information that is already in the docs

### 2. Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 3. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 4. Self-Improvement Loop
- After ANY correction from the user: update `docs/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start

### 5. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- **For Supabase changes:** verify column names match the schema doc
- **For TypeScript changes:** verify `dist/` output matches `src/`

### 6. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer

### 7. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests then resolve them
- Zero context switching required from the user

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `docs/lessons.md` after corrections
7. **Log Incidents**: Update `docs/incidents/Incident-Log.md` after any outage or failure

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **No Blind Retries**: If an MCP tool call fails twice with the same error, switch to local testing. Never burn tokens retrying.
- **Verify the Compiled Output**: This is a TypeScript project. The source being correct means nothing if `dist/` is stale.
- **Docs Are Law**: If it's documented in `docs/`, follow it. If the docs are wrong, fix the docs AND the code.

---

## Debugging Agents

See `docs/playbooks/Debugging-Playbook.md` for the full decision tree and local test commands.

Quick reference:
1. **Do NOT retry more than twice**
2. Check Railway runtime logs for `[Dre]`, `[Yoncé]`, `[Simon]` prefixed output
3. If zero runtime logs: MCP connection is stale — disconnect/reconnect in Claude.ai
4. Check `docs/incidents/Incident-Log.md` for known past failures

---

## Change Logging

After completing any task that modifies files, append to `docs/changelog.md`:

```
### YYYY-MM-DD — [brief title]
**Repo:** sonata-stack

**Files changed:**
- path/to/file.ts — what changed and why

**Decisions made:**
- any choices or tradeoffs

**Notes:**
- anything the owner should know

---
```

Always append to the end of the file. Never overwrite previous entries.

---

## Docs Directory Structure

```
docs/
├── architecture/
│   ├── AgencyLead-Schema.md      ← Pipeline leads (source of truth)
│   └── Client-Schema.md          ← Retained clients (source of truth)
├── pipelines/
│   └── Pipeline-Full-Outbound.md ← Agent flow, inputs, outputs
├── playbooks/
│   ├── Debugging-Playbook.md     ← How to debug failures
│   └── Niche-Selection-Playbook.md ← Market strategy
├── incidents/
│   └── Incident-Log.md           ← Past failures + fixes
├── lessons.md                    ← Mistake patterns to avoid
└── changelog.md                  ← Running change log
```