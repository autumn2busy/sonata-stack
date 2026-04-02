# Vault GitHub Setup — Full Sync

> **One-time setup to sync your entire Obsidian vault to a private GitHub repo.**
> This enables remote AI tools (Claude.ai, Codex) to access vault content.

---

## Step 1: Create the Private GitHub Repo

~~Already done:~~ `https://github.com/autumn2busy/command-center.git`

The vault root for git is `C:/Users/Mother/Vault/command-center/` (the `.obsidian` folder is at `Vault/command-center/.obsidian`).

## Step 2: Initialize Git in Your Vault

Open **PowerShell** (not bash) and run:

```powershell
cd "C:\Users\Mother\Vault\command-center"

git init
```

## Step 3: Create .gitignore

**Important:** Run this as a PowerShell command — do NOT paste the gitignore content directly into the terminal.

```powershell
@"
# Obsidian internals
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.obsidian/cache/
.trash/

# OS files
.DS_Store
Thumbs.db
desktop.ini

# Sensitive files
*.env
**/secrets/**
"@ | Out-File -FilePath .gitignore -Encoding utf8
```

## Step 4: Initial Commit and Push

```powershell
cd "C:\Users\Mother\Vault\command-center"

git add .
git commit -m "Initial vault sync"
git branch -M main
git remote add origin https://github.com/autumn2busy/command-center.git
git push -u origin main
```

## Step 5: Install Obsidian Git Plugin

1. In Obsidian: **Settings → Community Plugins → Browse**
2. Search for **"Obsidian Git"**
3. Install and enable
4. Go to **Settings → Obsidian Git** and configure:
   - **Auto pull interval:** 10 minutes (pulls remote changes)
   - **Auto push interval:** 10 minutes (pushes local changes)
   - **Auto commit interval:** 10 minutes
   - **Commit message:** `vault auto-sync {{date}}`
   - **Pull on startup:** ON
   - **Push on backup:** ON

This creates a continuous sync loop — changes made locally in Obsidian push to GitHub, and changes pushed by Codex or other tools pull into Obsidian.

## Step 6: Verify

After setup, make a small edit in Obsidian, wait for the auto-commit interval, then check your GitHub repo — the change should appear.

---

## Sonata Stack Repo as Submodule (Optional)

If you want `sonata-stack` to appear as a subfolder inside your vault:

```bash
cd "C:/Users/Mother/Vault"
git submodule add https://github.com/autumn2busy/sonata-stack.git command-center/Sonata/repo
git commit -m "Add sonata-stack as submodule"
git push
```

This is optional now that the entire vault syncs — the `docs/` files can live directly in the vault without the submodule indirection.

---

## Antigravity Workspace Path Configuration

When Antigravity asks which path to use for posting notes from `flynerd.code-workspace`, configure it to use the Obsidian Local REST API:

**API Base URL:** `https://127.0.0.1:27124`

**Default note path (inbox):**
```
vault/command-center/00-Inbox/
```

**Full PUT URL pattern:**
```
PUT https://127.0.0.1:27124/vault/command-center/00-Inbox/{filename}.md
```

**Headers required:**
```
Authorization: Bearer <your-obsidian-api-key>
Content-Type: text/markdown
```

### Antigravity Agent Rules

Add to your `.agents/rules.md` or workspace config in Antigravity:

```markdown
## Obsidian Knowledge Base Integration

### Writing Notes
- POST all notes to Obsidian via Local REST API
- Base URL: https://127.0.0.1:27124
- Auth: Bearer token from OBSIDIAN_API_KEY env var
- Default inbox: PUT /vault/command-center/00-Inbox/{date}-{slug}.md

### Required Frontmatter
Every note MUST include:
  project: flynerd | client-{name} | personal | admin
  type: note | ac-change | incident | decision | meeting | status | strategy | changelog | lesson
  source: antigravity
  created: {YYYY-MM-DD}

### Reading Docs Before Acting
Before modifying Supabase: read /vault/command-center/Sonata/repo/docs/architecture/AgencyLead-Schema.md
Before modifying ActiveCampaign: read /vault/command-center/Sonata/repo/docs/pipelines/Pipeline-Full-Outbound.md
Before debugging: read /vault/command-center/Sonata/repo/docs/incidents/Incident-Log.md
At session start: read /vault/command-center/Sonata/repo/docs/lessons.md

### After Infrastructure Changes
After modifying AC automations, Supabase schema, or Vercel deployments:
1. Create a note in 00-Inbox with the change details
2. Include frontmatter: project: flynerd, type: changelog or ac-change
3. The note will be sorted to the appropriate project folder
```

### Example: Antigravity Posts a Note

```javascript
// In Antigravity terminal or agent script:
const note = `---
project: flynerd
type: ac-change
source: antigravity
created: ${new Date().toISOString().split('T')[0]}
tags: [activecampaign, automation]
---

# AC Tag Update

Changed outreach trigger tag to \`fn_outreach_v2\`.
`;

fetch('https://127.0.0.1:27124/vault/command-center/00-Inbox/2026-04-01-ac-tag-update.md', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${process.env.OBSIDIAN_API_KEY}`,
    'Content-Type': 'text/markdown'
  },
  body: note
});
```

---

## Claude.ai MCP Connection

Claude.ai (this web chat) **cannot directly reach** `127.0.0.1`. For Claude.ai to read vault content:

**Primary method:** Clone the vault repo via git (after you push to GitHub)
```bash
git clone https://github.com/autumn2busy/vault.git
```

**Alternative method (advanced):** Expose the Obsidian REST API via Cloudflare Tunnel:
```bash
# Install cloudflared
cloudflared tunnel --url https://127.0.0.1:27124
```
This creates a temporary public URL that Claude.ai could fetch from. Only recommended for temporary sessions — not a permanent setup.

**What's already connected:**
- ✅ Sonata Stack MCP (Railway) — all 5 agents accessible
- ✅ Vercel MCP — project management
- ✅ Google Calendar MCP
- ✅ Gmail MCP
- ✅ Notion MCP