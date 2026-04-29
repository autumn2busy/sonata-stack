# Pipeline — Full Outbound

> **Reference for any agent implementing or debugging the Sonata Stack pipeline.**
> Read this before implementing Tyrion orchestration or testing the pipeline end-to-end.

## Pipeline Flow

```
Simon Cowell → Yoncé → Dre → Hov
   (discover)   (score)  (build)  (outreach)
```

## Agent Roster — Inputs, Outputs, Dependencies

### Simon Cowell — Scout
**Purpose:** Discover local service businesses with no/weak web presence.
**MCP Tool:** `simon_cowell({ city, niche })`
**Inputs:**
- `city` — e.g. "Atlanta, GA"
- `niche` — e.g. "hvac", "plumber", "barbershop"

**External APIs:**
- Google Places API (New) — Text Search endpoint
- Hunter.io — Domain Search for email enrichment (free tier: 25/mo)

**Outputs:**
- INSERT rows into `"AgencyLead"` with status `DISCOVERED`
- Returns JSON: `{ city, niche, totalFound, qualified, leads: [...] }`

**Qualification Filters:**
1. Exclude `businessStatus === "CLOSED_PERMANENTLY"`
2. Classify website presence: NO_WEBSITE > SOCIAL_ONLY > TEMPLATE_SITE > HAS_WEBSITE
3. Require `userRatingCount >= 3`
4. Require `rating >= 3.0`

---

### Yoncé — Intel
**Purpose:** Analyze a business's reputation, generate brand palettes, score opportunity.
**MCP Tool:** `yonce({ businessName, placeId, leadId? })`
**Inputs:**
- `businessName` — from Simon's output
- `placeId` — Google Places ID from Simon's output
- `leadId` — (optional) for DB persistence

**External APIs:**
- Google Places API (New) — Place Details (reviews, rating, userRatingCount)
- Anthropic API — Claude Haiku for analysis

**Outputs:**
- UPDATE `"AgencyLead"` → status `AUDITED`, `intelScore`, `intelData`
- Returns JSON: `{ opportunityScore, painPoints, reputationSummary, operatingContext, socialProofPoints, brandPalettes, selectedPalette }`

**Status:** FULLY IMPLEMENTED

---

### Dre — Builder
**Purpose:** Deploy personalized demo site and generate AI avatar walkthrough video.
**MCP Tool:** `dre({ leadId, businessName, niche, rating, intelPayload })`
**Inputs:**
- `leadId` — must exist in Supabase
- `businessName`, `niche`, `rating` — from Simon/Yoncé
- `intelPayload` — full Yoncé output (pain points, palettes, etc.)

**External APIs:**
- Vercel API — deploy hook or deployments endpoint
- HeyGen API — avatar video generation (async, non-blocking)
- Supabase — write demo URL and video URL

**Outputs:**
- UPDATE `"AgencyLead"` → status `DEMO_BUILT`, `demoSiteUrl`, `walkthroughVideoUrl`, `validUntil`
- Returns JSON: `{ demoUrl, videoStatus, validUntil, deployTriggered, brandColors }`

**Key Details:**
- Demo URL format: `https://flynerd-demo-lead.vercel.app/demo/{leadId}`
- Video generation runs in background (fire-and-forget). Status is "generating" on return.
- `validUntil` is set to 7 days from now. After that, Cersei locks the demo.

**Status:** FULLY IMPLEMENTED (Codex V2 hardened input validation)

---

### Hov — Closer
**Purpose:** Generate personalized outreach, inject into AC, trigger email delivery via automation.
**MCP Tool:** `hov({ leadId, contactEmail, context })`
**Inputs:**
- `leadId` — must have status DEMO_BUILT
- `contactEmail` — from Hunter.io enrichment or manual entry
- `context` — e.g. "initial outreach" or prospect reply content

**External APIs:**
- Anthropic API — generate personalized email as Jordan persona
- ActiveCampaign API — create contact, create deal, push AI copy to custom field, tag with `FLYNERD_OUTREACH_PENDING`

**Workflow (hybrid approach per AC Strategy doc):**
1. AI generates personalized email copy via Anthropic
2. Creates contact + deal in AC via standard API
3. Pushes AI copy into AC custom field (synced through `ac-sync-logic.ts`)
4. Tags contact with `FLYNERD_OUTREACH_PENDING`
5. AC native automation picks up the tag and delivers the email (preserves deliverability, IP reputation, tracking)
6. Updates `"AgencyLead"` → status `OUTREACH_SENT`, `lastInteraction`, `outreachHistory`

**Why not send via API?** AC's standard API is optimized for marketing automation, not 1:1 transactional cold emails. Tag-triggered delivery preserves sender reputation and gives you native open/click tracking.

**IaC Prerequisites:**
- Run `node create-ac-pipeline.mjs` to establish deal stages
- Run `node create-deal-fields.mjs` to create custom fields for AI copy
- Verify the `FLYNERD_OUTREACH_PENDING` automation is active in AC dashboard

**Status:** STUB — needs implementation

---

### Tyrion — Orchestrator
**Purpose:** Run the full pipeline in one command.
**MCP Tool:** `tyrion({ city, niche, minScore? })`
**Inputs:**
- `city`, `niche` — passed to Simon Cowell
- `minScore` — minimum Yoncé score to proceed to Dre (default: 50)

**Pipeline Logic:**
```
1. leads = simonCowell(city, niche)           → up to 20 leads
2. for each qualified lead:
     intel = yonceAnalyze(lead)               → score + palettes
     if intel.opportunityScore >= minScore:
       dreBuild(lead, intel)                  → deploy demo
       if lead.contactEmail exists:
         hovOutreach(lead)                    → send email
       else:
         flag as NEEDS_MANUAL_OUTREACH
3. Return pipeline summary
```

**Batch Size:** All qualified leads, up to 20 per run.
**Error Handling:** Per-lead isolation — one lead failure does not kill the pipeline.

**Status:** STUB — needs implementation

---

### Supporting Agents

**Kris Jenner — Post-Call Closer**
- Triggered by AC tag `call_completed`
- Runs Yoncé on prospect's actual website, builds demo via Dre, sends close email
- Status: STUB

**Cersei — Demo Expiry**
- Finds demos older than 7 days, enables Vercel password protection
- Runs hourly via webhook
- Status: STUB

**Tiny Harris — Monthly Growth**
- Generates performance reports for active clients from `"Client"` table (not `"AgencyLead"`)
- Checks site health (uptime, speed, SEO metrics)
- Updates ActiveCampaign with engagement data
- Queries: `SELECT * FROM "Client" WHERE "status" = 'ACTIVE' AND "nextReviewDate" <= now()`
- Schema: `docs/architecture/Client-Schema.md`
- Status: STUB

---

## Lead → Client Conversion

When a lead reaches status `CLOSED_WON` (or a client is onboarded outside the pipeline):

```
1. Create row in "Client" table with:
   - originLeadId → AgencyLead.id (if from pipeline, NULL if referral/existing)
   - status: "ONBOARDING"
   - plan, services, monthlyRate
   - previousPlatform (e.g., "wix")

2. Update AgencyLead row:
   - status: "CLOSED_WON"

3. Create Vercel project for client (separate from flynerd-demo-lead)

4. Begin migration workflow:
   - Client.status: ONBOARDING → MIGRATING → ACTIVE
```

Clients acquired outside the pipeline (referrals, existing relationships) skip the AgencyLead flow entirely. They are inserted directly into `"Client"` with `originLeadId: NULL`.

## Environment Variables (Railway)

| Variable | Used By | Notes |
|----------|---------|-------|
| `GOOGLE_PLACES_API_KEY` | Simon, Yoncé | Google Places API (New) |
| `YELP_API_KEY` | Yoncé (fallback) | Yelp Fusion API |
| `ANTHROPIC_API_KEY` | Yoncé, Hov | Claude API for analysis + email generation |
| `SUPABASE_URL` | All agents | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All agents | Supabase service role key |
| `VERCEL_API_TOKEN` | Dre, Cersei | Vercel API |
| `VERCEL_DEPLOY_HOOK_URL` | Dre | Deploy hook for flynerd-demo-lead |
| `HEYGEN_API_KEY` | Dre | HeyGen avatar video API |
| `HEYGEN_AVATAR_ID` | Dre | Optional override (default: Abigail) |
| `HEYGEN_VOICE_ID` | Dre | Optional override |
| `HUNTER_API_KEY` | Simon | Hunter.io email enrichment |
| `ACTIVECAMPAIGN_API_URL` | Hov, Kris Jenner | e.g. https://yourname.api-us1.com |
| `ACTIVECAMPAIGN_API_KEY` | Hov, Kris Jenner | AC API key |

## Target Markets

| Priority | City | Niche | Notes |
|----------|------|-------|-------|
| 1 | Atlanta, GA | HVAC | Home turf, highest urgency |
| 2 | Nashville, TN | Plumbing | Growing market, less competition |
