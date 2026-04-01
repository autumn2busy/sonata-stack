# Sonata Stack — MCP Agent Core

# CLAUDE.md — Sonata Stack Project Rules

> This file is automatically read by Claude Code at the start of every session.
> It sets behavioral expectations for any AI agent working on this codebase.

---

## Critical Project Context

### Database Naming Convention ⚠️
The Supabase database uses **quoted camelCase** identifiers, NOT snake_case:
- Table: `"AgencyLead"` (never `agency_leads` or `agency_lead`)
- Columns: `"demoSiteUrl"`, `"walkthroughVideoUrl"`, `"intelScore"`, `"intelData"`, `"businessName"`, `"contactEmail"`, `"placeId"`, `"createdAt"`, `"updatedAt"`, `"validUntil"`, `"lastInteraction"`, `"leadSource"`, `"sessionId"`

**Before writing ANY Supabase `.from()`, `.update()`, `.select()`, or `.eq()` call, verify the exact table and column names above.**

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
- **Known bug:** `src/lib/vercel.ts` fallback references `FN-real-estate` — should be `flynerd_agency`

---

## Working Rules

### 1. Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- **For Supabase changes:** verify column names match the schema above
- **For TypeScript changes:** verify `dist/` output matches `src/`

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections
Before modifying ANY Supabase query, READ docs/Architecture/AgencyLead Schema.md first.
Before debugging ANY agent failure, READ docs/Playbooks/Debugging Playbook.md first.
Before implementing ANY agent, READ docs/Pipelines/Pipeline - Full Outbound.md first.
---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **No Blind Retries**: If an MCP tool call fails twice with the same error, switch to local testing. Never burn tokens retrying.
- **Verify the Compiled Output**: This is a TypeScript project. The source being correct means nothing if `dist/` is stale.

---

## Debugging Agents (Dre, Yoncé, etc.)

If an agent returns a generic error:
1. **Do NOT retry more than twice**
2. Test each step locally:
   - Supabase write: `node -e "..." ` with the actual update call
   - Vercel deploy: `fetch(process.env.VERCEL_DEPLOY_HOOK_URL, { method: 'POST' })`
   - HeyGen: `fetch('https://api.heygen.com/v2/video/generate', ...)`
3. Check Railway runtime logs for `[Dre]`, `[Yoncé]`, `[Simon]` prefixed output
4. If zero runtime logs: MCP connection is stale — disconnect/reconnect in Claude.ai
---

## Change Logging

After completing any task that modifies files, create or append to:
`C:/Users/Mother/Vault/command-center/00-Inbox/changelog-sonata.md`

Format each entry as:

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