# FlyNerd System Components Map

> **Master reference for all tools, IDEs, agents, services, and data flows across the FlyNerd ecosystem.**
> Update this doc whenever a new tool or integration is added.
>
> **Last updated:** 2026-04-01

---

## Development IDEs & AI Agents

### Google Antigravity
- **What:** Google's agent-first IDE, forked from VS Code. Runs Gemini 3 Pro and Claude Opus 4.6.
- **Role:** Primary development IDE. Runs autonomous agents for coding, planning, and execution across editor, terminal, and browser. Has direct access to all local and cloud systems (Supabase, ActiveCampaign, Vercel, etc.) via terminal.
- **Obsidian access:** LOCAL — can hit Obsidian Local REST API at `https://127.0.0.1:27124`
- **Repo access:** Direct file system access to local clones
- **Key capability:** Multiple parallel agents, artifact generation, plan-then-execute workflow

### Claude Code (Anthropic)
- **What:** Anthropic's CLI-based agentic coding tool. Runs Claude Opus/Sonnet.
- **Role:** Agentic coding from the terminal. Reads CLAUDE.md at session start. Used for focused implementation tasks.
- **Obsidian access:** LOCAL — can hit Obsidian Local REST API at `https://127.0.0.1:27124`
- **Repo access:** Direct file system access to local clones
- **Key capability:** Reads CLAUDE.md + docs/ automatically, self-improvement loop via lessons.md

### Claude.ai (Anthropic — web interface)
- **What:** This web chat. Runs Claude Opus/Sonnet. Has MCP tool access to Sonata Stack.
- **Role:** Strategic planning, architecture decisions, research, long-form analysis. Connected to Sonata Stack MCP server.
- **Obsidian access:** REMOTE ONLY — cannot reach localhost. Must clone repo via git for docs access.
- **Repo access:** `git clone` from GitHub
- **Key capability:** MCP tools (Sonata agents, Vercel, Google Drive, etc.), web search, file creation

### Codex (Anthropic)
- **What:** Anthropic's async background agent for code tasks. Creates PRs.
- **Role:** Background fixes, refactoring, implementation tasks dispatched from Claude.ai or Claude Code.
- **Obsidian access:** NONE — runs on Anthropic infrastructure. Reads repo files only.
- **Repo access:** Clones from GitHub. Reads CLAUDE.md and docs/.
- **Key capability:** Async execution, PR creation, long-running tasks

---

## Sonata Stack — MCP Agent Server

- **Runtime:** Railway (`sonata-stack-production.up.railway.app/mcp`)
- **Repo:** `autumn2busy/sonata-stack` (GitHub)
- **Transport:** Streamable HTTP (MCP protocol)

### Agent Roster

| Agent | Purpose | Status | External APIs |
|-------|---------|--------|---------------|
| Simon Cowell | Discover leads (Google Places) | STUB | Google Places, Hunter.io |
| Yoncé | Score reputation, generate palettes | IMPLEMENTED | Google Places, Anthropic |
| Dre | Deploy demo sites, generate videos | IMPLEMENTED | Vercel, HeyGen, Supabase |
| Hov | Send outreach emails | STUB | Anthropic, ActiveCampaign |
| Tyrion | Orchestrate full pipeline | STUB | (calls other agents internally) |
| Kris Jenner | Post-call closer assets | STUB | ActiveCampaign, Vercel |
| Cersei | Demo expiry enforcement | STUB | Vercel |
| Tiny Harris | Monthly client growth reports | STUB | Supabase ("Client" table) |

---

## Cloud Services

### Supabase (Database)
- **Tables:** `"AgencyLead"` (pipeline leads + inbound forms), `"Client"` (retained clients)
- **Accessed by:** All Sonata agents, Antigravity, Claude Code
- **Schema docs:** `docs/architecture/AgencyLead-Schema.md`, `docs/architecture/Client-Schema.md`

### Vercel (Hosting & Deployment)
- **Demo sites:** Project `flynerd-demo-lead` (team: `team_uSLsRZHA5u8JAkI9tVVipAFi`)
- **Client sites:** Each client gets their own Vercel project (separate from demos)
- **Accessed by:** Dre, Cersei, Antigravity

### ActiveCampaign (CRM & Email)
- **Role:** Contact management, deal pipeline, email automations, tag-based triggers
- **Accessed by:** Hov, Kris Jenner, Tiny Harris, Antigravity
- **Outreach tag:** `FLYNERD_OUTREACH_PENDING` — triggers native AC automation to send AI-generated email
- **IaC scripts:** `create-ac-pipeline.mjs` (deal stages), `create-deal-fields.mjs` (custom fields for AI copy)
- **Sync module:** `ac-sync-logic.ts` — all AC writes go through this for data formatting
- **Multi-env:** Each workspace subfolder has its own `.env` with `ACTIVECAMPAIGN_URL` and `ACTIVECAMPAIGN_KEY`
- **Strategy doc:** `activecampaign_strategy.md` in vault

### n8n (Workflow Automation)
- **Role:** Complex multi-stage workflows tied to ActiveCampaign. Niche-specific campaigns (film, medical, etc.) route through n8n nodes.
- **Accessed by:** AC automations, workspace scripts
- **Integration:** `n8n-nodes-base.activeCampaign` components
- **Inbound routing:** Form data from `flynerdtech` and `flynerd-agency` flows through `ac-sync-logic.ts` → n8n → AC

### HeyGen (Video)
- **Role:** AI avatar walkthrough videos for demo sites
- **Accessed by:** Dre
- **Avatar:** Abigail (default)

### Hunter.io (Email Enrichment)
- **Role:** Domain search for business email addresses
- **Accessed by:** Simon Cowell
- **Tier:** Free (25 domain searches/month)

---

## Knowledge Base — Obsidian

### Vault Location
`C:/Users/Mother/Vault/`

### Sonata Stack Docs
Located at `command-center/Sonata/repo/docs/` (via git submodule) or directly in the repo at `docs/`.

### Access Patterns

```
┌─────────────────────────────────────────────────────────────┐
│                    OBSIDIAN VAULT                            │
│                                                             │
│  Obsidian Local REST API (plugin)                           │
│  https://127.0.0.1:27124                                    │
│  Auth: Bearer <API_KEY>                                     │
│                                                             │
│  Endpoints:                                                 │
│    GET  /vault/{path}           → read file                 │
│    PUT  /vault/{path}           → create/replace file       │
│    PATCH /vault/{path}          → append/prepend/replace    │
│    DELETE /vault/{path}         → delete file               │
│    GET  /vault/                 → list root                 │
│    GET  /vault/{directory}/     → list directory            │
│    POST /search/simple/         → fuzzy search              │
│                                                             │
└──────────┬──────────┬──────────┬────────────────────────────┘
           │          │          │
    ┌──────┘    ┌─────┘    ┌────┘
    ▼           ▼          ▼
┌────────┐ ┌────────┐ ┌──────────┐
│Antigrav│ │Claude  │ │ Local    │
│  ity   │ │ Code   │ │ Scripts  │
│ (local)│ │(local) │ │ (curl,  │
│        │ │        │ │  node)   │
└────────┘ └────────┘ └──────────┘
    LOCAL ACCESS ONLY (127.0.0.1)


┌─────────────────────────────────────────────────────────────┐
│                    GITHUB REPO                              │
│                                                             │
│  autumn2busy/sonata-stack                                   │
│  └── docs/   (same content, synced via Obsidian Git)        │
│                                                             │
└──────────┬──────────┬──────────────────────────────────────┘
           │          │
    ┌──────┘    ┌─────┘
    ▼           ▼
┌────────┐ ┌────────┐
│Claude  │ │ Codex  │
│  .ai   │ │(async) │
│(remote)│ │(remote)│
└────────┘ └────────┘
    REMOTE ACCESS (git clone)
```

### Who Can Write to Obsidian

| Tool | Can Read Vault | Can Write Vault | Method |
|------|---------------|-----------------|--------|
| Antigravity | ✅ | ✅ | Local REST API (`PUT /vault/{path}`) |
| Claude Code | ✅ | ✅ | Local REST API (`PUT /vault/{path}`) |
| Claude.ai | ✅ (via git) | ❌ (creates files for download) | `git clone` repo |
| Codex | ✅ (via git) | ✅ (commits to repo) | Git push → Obsidian Git sync |
| Local scripts | ✅ | ✅ | Local REST API or direct filesystem |

### Writing Notes to Obsidian (REST API Examples)

**Create or replace a file:**
```bash
curl -k -X PUT \
  -H "Authorization: Bearer <OBSIDIAN_API_KEY>" \
  -H "Content-Type: text/markdown" \
  --data-binary @new-note.md \
  "https://127.0.0.1:27124/vault/command-center/Sonata/notes/my-note.md"
```

**Append to an existing file (e.g., incident log):**
```bash
curl -k -X PATCH \
  -H "Authorization: Bearer <OBSIDIAN_API_KEY>" \
  -H "Operation: append" \
  -H "Content-Type: text/markdown" \
  --data "### 2026-04-01 — New incident entry here" \
  "https://127.0.0.1:27124/vault/command-center/Sonata/repo/docs/incidents/Incident-Log.md"
```

**Read a file:**
```bash
curl -k \
  -H "Authorization: Bearer <OBSIDIAN_API_KEY>" \
  "https://127.0.0.1:27124/vault/command-center/Sonata/repo/docs/architecture/AgencyLead-Schema.md"
```

---

## Integration: Antigravity → Obsidian

Antigravity agents can write to Obsidian via the Local REST API using terminal commands or scripts. Use cases:

1. **AC workflow changes** — When Antigravity updates ActiveCampaign automations, it appends the change to the Obsidian changelog and updates relevant docs
2. **Client status updates** — After deploying a client site or running SEO analysis, write a status note to the vault
3. **Strategy & meeting notes** — Antigravity can create structured notes from strategy sessions
4. **Implementation decisions** — When Antigravity makes architectural choices, it logs them in the vault

### Antigravity Agent Rule (add to .agents/ config)
```
After completing any task that modifies ActiveCampaign, Supabase, or Vercel:
1. Write a summary to Obsidian via Local REST API
2. Append to the appropriate doc (changelog, incident log, or lessons)
3. Path: https://127.0.0.1:27124/vault/command-center/Sonata/repo/docs/
```

---

## Data Flow Summary

```
Discovery:
  Simon Cowell → Google Places API → Hunter.io → Supabase ("AgencyLead")

Scoring:
  Yoncé → Google Places (reviews) → Claude API → Supabase ("AgencyLead")

Building:
  Dre → Vercel (deploy) + HeyGen (video) → Supabase ("AgencyLead")

Outreach:
  Hov → Claude API (email gen) → ActiveCampaign (contact + tag) → AC Automation (sends email) → Supabase ("AgencyLead")

Client Management:
  Manual/Kris Jenner → Supabase ("Client") → Vercel (client project) → ActiveCampaign

Monthly Reports:
  Tiny Harris → Supabase ("Client") → site health checks → ActiveCampaign

Knowledge Sync:
  Any local IDE → Obsidian REST API → vault → Obsidian Git → GitHub repo → remote agents
```

---

## Setup Checklist

### One-Time Setup
- [ ] Install Obsidian Local REST API plugin (Settings → Community Plugins → Browse)
- [ ] Copy API key from Settings → Local REST API
- [ ] Add git submodule to vault (`git submodule add` — see `docs/setup/Obsidian-Vault-Setup.md`)
- [ ] Configure Obsidian Git plugin for auto-sync
- [ ] Add Obsidian MCP bridge to Claude Code config (see below)
- [ ] Create `"Client"` table in Supabase (DDL in `docs/architecture/Client-Schema.md`)
- [ ] Validate `"AgencyLead"` schema matches `docs/architecture/AgencyLead-Schema.md`

### Claude Code MCP Config
Add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:27124/"],
      "env": {
        "OBSIDIAN_API_KEY": "<your-api-key-from-obsidian-settings>"
      }
    }
  }
}
```

### Antigravity Setup
Add a workspace rule or `.agents/rules.md`:
```markdown
## Obsidian Integration
- Obsidian Local REST API is available at https://127.0.0.1:27124
- API Key: <stored in .env or workspace secrets>
- After any infrastructure change, append a summary to the appropriate Obsidian doc
- Read docs/lessons.md before making database or deployment changes
```