# Debugging Playbook — Sonata Stack

> **Read this BEFORE debugging any agent failure.**
> Check the Incident Log (docs/incidents/Incident-Log.md) for known past failures first.

## Rule #1: Never Retry More Than Twice

If an MCP tool call fails twice with the same error, STOP. Switch to local testing. Blind retries waste tokens and hide root causes.

## Failure Decision Tree

```
Agent returns error
  │
  ├── "Error occurred during tool execution" (generic)
  │     └── Check Railway runtime logs
  │           ├── Zero logs → MCP connection stale (not a code bug)
  │           │     └── FIX: Disconnect/reconnect MCP in Claude.ai settings
  │           └── Logs present → Read the error, check below
  │
  ├── Zod validation error
  │     └── Input schema mismatch — check the tool's z.object() definition
  │           └── FIX: Loosen schema with z.any() or fix the caller's payload shape
  │
  ├── "Supabase update failed" / "Supabase read failed"
  │     └── Check column names against docs/architecture/AgencyLead-Schema.md
  │           ├── Column name wrong → Fix to exact camelCase
  │           └── Column name right → Check if row exists (.eq("id", leadId))
  │
  ├── "VERCEL_API_TOKEN is required"
  │     └── Env var missing in Railway → Add it in Railway dashboard
  │
  ├── "HEYGEN_API_KEY is required"
  │     └── Env var missing in Railway → Add it in Railway dashboard
  │
  └── Dre-specific: "[Dre] Unhandled error: ..."
        └── Check the full error in Railway logs (Codex V2 added console.error)
              ├── intelPayload parsing → Check Yoncé output shape
              └── Vercel deploy failed → Test deploy hook manually
```

## Local Test Commands

### Test Supabase Write
```bash
node -e "
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  sb.from('AgencyLead').select('*').limit(3).then(r => console.log(r));
"
```

### Test Vercel Deploy Hook
```bash
curl -X POST "$VERCEL_DEPLOY_HOOK_URL" -w "\nHTTP Status: %{http_code}\n"
# Expect: HTTP Status: 201
```

### Test HeyGen API Key
```bash
curl -s -H "X-Api-Key: $HEYGEN_API_KEY" \
  "https://api.heygen.com/v1/avatar.list" | head -c 200
```

### Test Google Places API
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $GOOGLE_PLACES_API_KEY" \
  -H "X-Goog-FieldMask: places.displayName,places.id" \
  -d '{"textQuery": "hvac services in Atlanta, GA", "maxResultCount": 3}' \
  "https://places.googleapis.com/v1/places:searchText" | head -c 500
```

### Test Hunter.io API
```bash
curl -s "https://api.hunter.io/v2/domain-search?domain=example.com&api_key=$HUNTER_API_KEY" | head -c 300
```

### Test MCP Server Locally
```bash
# Build first
npm run build

# Start server
node dist/index.js &

# Health check
curl http://localhost:8080/health

# Kill after testing
kill %1
```

### Test Compiled Output Matches Source
```bash
npm run build
grep -n "Scout stub" dist/index.js    # Should NOT appear after Simon is implemented
grep -n "AgencyLead" dist/index.js    # Should show quoted table name
```

## Railway Logs

```bash
# View recent Railway logs (requires Railway CLI)
railway logs --tail 50

# Filter for specific agent
railway logs --tail 100 | grep "\[Dre\]"
railway logs --tail 100 | grep "\[Yoncé\]"
railway logs --tail 100 | grep "\[Simon\]"
railway logs --tail 100 | grep "\[HeyGen\]"
railway logs --tail 100 | grep "\[Vercel\]"
```

## Common Gotchas

1. **`dist/` is stale** — You edited `src/` but forgot to run `npm run build`. Railway compiles from source, but local testing uses `dist/`. Always rebuild.
2. **express.json() body parser** — NEVER add `app.use(express.json())` globally. StreamableHTTPServerTransport reads the raw request body. A body parser consumes the stream first, causing "Parse error: Invalid JSON".
3. **MCP session not found** — The `mcp-session-id` header didn't match. Usually means the session expired. Reconnect the MCP in Claude.ai.
4. **HeyGen video stuck at "processing"** — HeyGen can take 5-10 minutes. Dre polls for up to 10 minutes (20 attempts × 30s). If it times out, the share link is returned as fallback.
5. **Vercel deploy hook returns 404** — Hook was regenerated. Get the new URL from Vercel dashboard → flynerd-demo-lead → Settings → Git → Deploy Hooks.