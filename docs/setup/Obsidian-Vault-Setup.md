# Obsidian Vault Setup — Git Submodule

> **One-time setup to add the sonata-stack repo into your Obsidian vault.**
> After this, all `docs/` files are visible and linkable in Obsidian.

## Prerequisites

- Git installed and configured with GitHub access
- Obsidian vault at `C:/Users/Mother/Vault/`

## Step 1: Add the Submodule

Open a terminal (Git Bash, PowerShell, or CMD) and run:

```bash
cd "C:/Users/Mother/Vault/command-center/Sonata"
git init   # only if command-center/Sonata isn't already a git repo

git submodule add https://github.com/autumn2busy/sonata-stack.git repo
```

This creates `command-center/Sonata/repo/` inside your vault containing the full codebase.

**If your entire vault is already a git repo:**
```bash
cd "C:/Users/Mother/Vault"
git submodule add https://github.com/autumn2busy/sonata-stack.git command-center/Sonata/repo
git commit -m "Add sonata-stack as submodule"
```

## Step 2: Verify in Obsidian

Open Obsidian. You should now see the `docs/` folder and all markdown files in your file browser under:

```
command-center/Sonata/repo/docs/
├── architecture/
│   ├── AgencyLead-Schema.md
│   └── Client-Schema.md
├── pipelines/
│   └── Pipeline-Full-Outbound.md
├── playbooks/
│   ├── Debugging-Playbook.md
│   └── Niche-Selection-Playbook.md
├── incidents/
│   └── Incident-Log.md
├── lessons.md
└── changelog.md
```

You can now link to these from anywhere in your vault using standard Obsidian links:
```markdown
[[repo/docs/architecture/AgencyLead-Schema|AgencyLead Schema]]
[[repo/docs/lessons|Lessons Learned]]
```

## Step 3: Pulling Updates

When the repo is updated (by you, Claude Code, or Codex), pull the latest:

```bash
cd "C:/Users/Mother/Vault/command-center/Sonata/repo"
git pull origin main
```

If your vault is a git repo with the submodule:
```bash
cd "C:/Users/Mother/Vault"
git submodule update --remote command-center/Sonata/repo
git commit -m "Update sonata-stack submodule"
```

## Step 4: Pushing Edits from Obsidian

If you edit docs in Obsidian and want to push to GitHub:

```bash
cd "C:/Users/Mother/Vault/command-center/Sonata/repo"
git add docs/
git commit -m "Update docs from Obsidian"
git push origin main
```

## Optional: Obsidian Git Plugin

For automatic sync, install the **Obsidian Git** community plugin:
1. Obsidian → Settings → Community Plugins → Browse → search "Obsidian Git"
2. Install and enable
3. Configure auto-pull interval (e.g., every 10 minutes)

**Note:** Obsidian Git works best when the vault root is a git repo. If only the submodule directory is a repo, you may need to configure the plugin's base path or run git commands manually.

## Troubleshooting

**Obsidian doesn't show the files:**
- Check that the submodule was cloned properly: `ls "C:/Users/Mother/Vault/command-center/Sonata/repo/docs/"`
- Restart Obsidian to re-index the vault

**Git says "not a git repository":**
- Make sure you're in the right directory when running `git init` or `git submodule add`
- If your vault isn't a git repo, run `git init` in the vault root first

**Submodule shows empty directory:**
```bash
cd "C:/Users/Mother/Vault"
git submodule init
git submodule update
```