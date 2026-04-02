# 00-Inbox

> **This is the landing zone for all incoming notes from AI agents and automations.**
> Notes arrive here unsorted. They are routed to their project folder based on the `project` field in frontmatter.

## How It Works

Every note posted to `00-Inbox/` MUST include YAML frontmatter with at minimum:

```yaml
---
project: flynerd          # REQUIRED — routing key
type: note                # what kind of content
source: antigravity       # which tool/agent created it
created: 2026-04-01       # date created
---
```

### Project Routing

| `project` value | Destination folder | Description |
|-----------------|-------------------|-------------|
| `flynerd` | `command-center/Sonata/` | FlyNerd agency — Sonata Stack, pipeline, agents |
| `client-{name}` | `clients/{name}/` | Client-specific work (e.g., `client-sarah`) |
| `personal` | `personal/` | Personal notes, ideas, non-business |
| `admin` | `command-center/Admin/` | Business operations, finances, legal |

### Content Types

| `type` value | Purpose |
|-------------|---------|
| `note` | General note |
| `ac-change` | ActiveCampaign workflow/automation change |
| `incident` | System failure or bug |
| `decision` | Architecture or strategy decision |
| `meeting` | Meeting notes or summary |
| `status` | Client or project status update |
| `strategy` | Strategy recommendation |
| `changelog` | Code or system change log entry |
| `lesson` | Mistake pattern or learning |

### Source Tags

| `source` value | Origin |
|---------------|--------|
| `antigravity` | Google Antigravity IDE |
| `claude-code` | Anthropic Claude Code CLI |
| `claude-ai` | Claude.ai web chat |
| `codex` | Anthropic Codex (async) |
| `sonata` | Sonata Stack MCP agent |
| `manual` | Written by hand |

## Example: Antigravity Posts an AC Change

```yaml
---
project: flynerd
type: ac-change
source: antigravity
created: 2026-04-01
tags: [activecampaign, automation, outreach]
---

# Updated outreach automation trigger

Changed the outreach automation trigger tag from `outreach_ready` to `fn_outreach_v2`.

## What Changed
- Old tag: `outreach_ready`
- New tag: `fn_outreach_v2`
- Automation: "FlyNerd Outreach Sequence v2"

## Why
The old tag conflicted with a test automation. Renamed for clarity.

## Impact
- Hov agent needs to apply `fn_outreach_v2` instead of `outreach_ready`
- Update `docs/lessons.md` and `docs/pipelines/Pipeline-Full-Outbound.md`
```

## Sorting — Manual or Automated

### Manual Sorting
Review notes in `00-Inbox/`, check the `project` frontmatter, drag to the correct folder in Obsidian.

### Automated Sorting (Templater + Obsidian Scripts)
A Templater script or Obsidian plugin (like "Auto Note Mover") can read the `project` frontmatter and auto-move notes on creation. Setup:

1. Install **Auto Note Mover** plugin (Community Plugins → Browse)
2. Add rules:
   - If `project` contains `flynerd` → move to `command-center/Sonata/notes/`
   - If `project` contains `client-` → move to `clients/` + extract client name
   - If `project` contains `personal` → move to `personal/`
   - If `project` contains `admin` → move to `command-center/Admin/`

## API Endpoint for Posting Notes

All tools should POST new notes to:

```
PUT https://127.0.0.1:27124/vault/command-center/00-Inbox/{filename}.md
```

**Headers:**
```
Authorization: Bearer <OBSIDIAN_API_KEY>
Content-Type: text/markdown
```

**The filename should be descriptive and include the date:**
`2026-04-01-ac-outreach-tag-change.md`

## Notes Currently in Inbox

_(empty — notes will appear here as they arrive)_