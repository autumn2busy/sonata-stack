# Sonata Stack — MCP Agent Core

## Project role
MCP server — the agent core for FlyNerd's outbound automation pipeline.
Deployed to Railway, always-on.

## The Roster
Simon Cowell, Yoncé, Dre, Hov, Tiny Harris, Cersei, Tyrion, Kris Jenner

## Architecture rules
- All outbound agent logic lives HERE, not in flynerd-agency
- flynerd-agency calls Sonata Stack via MCP — never the reverse
- Package manager: npm

## Related repos
- **The Face:** flynerd-agency (marketing site + demo widget)
- **The Brain:** flynerdtech (client demo site template)

---

## Development Standards

### Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Write detailed specs upfront to reduce ambiguity

### Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Review lessons at session start for relevant project

### Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip this for simple, obvious fixes — don't over-engineer

### Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests then resolve them

## Task Management
1. Write plan to tasks/todo.md with checkable items
2. Check in before starting implementation
3. Mark items complete as you go
4. High-level summary at each step
5. Add review section to tasks/todo.md
6. Update tasks/lessons.md after corrections

## Core Principles
- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.

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