# Sonata Stack — Tier 1 Implementation Plan

**Date:** March 30, 2026  
**Scope:** Implement Simon Cowell, Tyrion orchestrator, and Hov closer to unblock the Atlanta HVAC launch  
**Approach:** Google Places API (New) for discovery; ActiveCampaign API for outreach; internal tool chaining for orchestration

---

## Current State Summary

| Agent | Status | Notes |
|-------|--------|-------|
| Simon Cowell | **STUB** | Returns placeholder text, no API calls |
| Yoncé | **IMPLEMENTED** | Google Places reviews → Claude analysis → DB write |
| Dre | **IMPLEMENTED** | Vercel deploy + HeyGen video + DB write (Codex V2 hardened) |
| Hov | **STUB** | Returns placeholder text, no email sending |
| Tyrion | **STUB** | No orchestration logic |
| Kris Jenner | **STUB** | Post-call closer (Tier 2) |
| Cersei | **STUB** | Demo expiry (Tier 2) |
| Tiny Harris | **STUB** | Monthly nurture (Tier 3) |

**MCP transport:** ✅ Working (Codex V2 fix deployed)  
**Vercel fallback repo:** ✅ Already fixed (`flynerd_agency`)  
**CLAUDE.md stale bug note:** ⚠️ Needs cleanup (line 31 references a bug that's already fixed)

---

## Phase 1: Simon Cowell — Discovery Agent

### Objective

Search Google Places API (New) for local service businesses by niche and city. Filter for businesses with no website or weak digital presence. Write qualified leads to Supabase `"AgencyLead"` table. Return structured results for downstream agents.

### API Strategy

**Text Search (New)** — single POST call to `https://places.googleapis.com/v1/places:searchText`

**Why Text Search over Nearby Search:** Text Search accepts natural language queries like `"hvac services in Atlanta, GA"` which maps directly to our `{niche} in {city}` input signature. Nearby Search requires explicit lat/lng coordinates and a radius, adding an unnecessary geocoding step.

### Field Mask (Cost-Optimized)

We need to balance lead quality data against API cost. Google charges by SKU tier based on fields requested.

**Pro tier fields** (per-request cost, but necessary):
- `places.id` — unique place identifier (feeds into Yoncé's `placeId` param)
- `places.displayName` — business name
- `places.formattedAddress` — full address
- `places.businessStatus` — filter out CLOSED_PERMANENTLY
- `places.primaryType` — verify niche match
- `places.types` — broader category info
- `places.pureServiceAreaBusiness` — flag for service-area businesses (no physical location)

**Enterprise tier fields** (higher cost, but essential for lead scoring):
- `places.websiteUri` — **THE critical filter** — null/missing = high-priority lead
- `places.rating` — feeds into Yoncé's analysis
- `places.userRatingCount` — review volume indicator
- `places.nationalPhoneNumber` — needed for outreach

**Excluded to save cost:**
- `places.reviews` — Yoncé fetches these separately via Place Details
- `places.photos` — not needed at discovery stage
- `places.regularOpeningHours` — not used in our pipeline

### Request Body

```json
{
  "textQuery": "{niche} services in {city}",
  "maxResultCount": 20,
  "includedType": "{mapped_place_type}",
  "includePureServiceAreaBusinesses": true,
  "languageCode": "en"
}
```

### Niche → Place Type Mapping

Google Places uses specific type identifiers. We need a mapping table:

| Niche Input | `includedType` | Notes |
|-------------|----------------|-------|
| hvac | `hvac_contractor` | Exact match available |
| plumber / plumbing | `plumber` | Exact match |
| electrician / electrical | `electrician` | Exact match |
| roofing | `roofing_contractor` | Exact match |
| landscaping | `landscaper` | Exact match |
| pest control | `pest_control_service` | Exact match |
| cleaning | `house_cleaning_service` | Specific to residential |
| painting | `painter` | Exact match |
| locksmith | `locksmith` | Exact match |
| barbershop | `barber_shop` | Exact match |
| auto repair | `auto_repair` | Exact match |

For niches without a direct type match, omit `includedType` and rely on text query matching.

### Lead Qualification Logic

After fetching results, apply these filters **in order**:

1. **Exclude closed businesses:** `businessStatus === "CLOSED_PERMANENTLY"`
2. **Classify website presence:**
   - `websiteUri` is null/undefined → **NO_WEBSITE** (highest priority)
   - `websiteUri` contains facebook.com, yelp.com, yellowpages.com → **SOCIAL_ONLY** (high priority)
   - `websiteUri` contains wix.com, weebly.com, squarespace.com → **TEMPLATE_SITE** (medium priority)
   - `websiteUri` is a real domain → **HAS_WEBSITE** (low priority, skip for now)
3. **Require minimum reviews:** `userRatingCount >= 3` (too few reviews = too small/new)
4. **Require minimum rating:** `rating >= 3.0` (below 3.0 = reputation problems we can't solve with a website)

### Supabase Write

For each qualified lead, insert into `"AgencyLead"`:

```typescript
{
  id: crypto.randomUUID(),
  businessName: place.displayName.text,
  niche: niche,
  city: city,
  placeId: place.id,
  contactEmail: null,        // Not available from Google Places
  contactPhone: place.nationalPhoneNumber || null,
  status: "DISCOVERED",
  rating: place.rating || 0,
  reviewCount: place.userRatingCount || 0,
  websitePresence: classifiedPresence, // "NO_WEBSITE" | "SOCIAL_ONLY" | "TEMPLATE_SITE"
  formattedAddress: place.formattedAddress,
  leadSource: "simon_cowell",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```

**Schema consideration:** The current `"AgencyLead"` schema may not have columns for `contactPhone`, `websitePresence`, `reviewCount`, `formattedAddress`, or `city`. We'll need to either add these columns to Supabase or store them in a JSON `discoveryData` column. **Recommendation: use a `discoveryData` JSONB column** to avoid schema migrations — store all Simon Cowell's raw output there, and keep the top-level columns for data that other agents need.

### Return Payload

Simon Cowell returns a structured JSON payload for Tyrion to consume:

```typescript
{
  city: string,
  niche: string,
  totalFound: number,
  qualified: number,
  leads: Array<{
    leadId: string,
    businessName: string,
    placeId: string,
    rating: number,
    reviewCount: number,
    websitePresence: "NO_WEBSITE" | "SOCIAL_ONLY" | "TEMPLATE_SITE",
    address: string,
    phone: string | null,
  }>
}
```

### Files to Modify

1. `src/index.ts` — Replace Simon Cowell stub (lines 23-34) with full implementation
2. `src/lib/db.ts` — Add `insertLead()` function for creating new leads
3. (Optional) `src/lib/places.ts` — Extract Google Places API logic into its own module for testability

### Estimated Size

~120 lines of new code (handler + places logic + db insert + type mapping)

---

## Phase 1.5: Email Enrichment — Filling the Contact Gap

### The Problem

Google Places API does not return email addresses. Without emails, Hov can't send outreach and the pipeline stalls after Dre builds the demo. Your original plan was to pull emails from Yelp, but Yelp's API has limitations — it doesn't reliably expose business owner/decision-maker emails, only generic business contact info that's often just a contact form URL.

### Free-Tier Email Enrichment Options (Ranked)

| Tool | Free Tier | API Access | Best For | Limitation |
|------|-----------|------------|----------|------------|
| **Hunter.io** | 25 searches + 50 verifications/mo | Yes (free key) | Domain Search — enter a business domain, get all associated emails | Only works if business HAS a domain; 25/mo is tight |
| **Apollo.io** | 50 credits/mo (emails) | Limited on free | Largest B2B database (210M+ contacts) | Free tier burns fast (50 credits = ~50 emails); API restricted on free plan |
| **Snov.io** | 50 credits/mo | Yes | Email finder + drip campaigns | Small free allocation |
| **Clearout** | Free trial + Autocomplete API | Yes (Autocomplete is free) | Domain → company matching | Finder credits limited |

### Recommended Approach: Hunter.io Domain Search (Free Tier) + Fallback Pattern

**Why Hunter.io wins for your use case:**

1. **Domain Search is the key feature** — Simon Cowell will classify leads as `NO_WEBSITE`, `SOCIAL_ONLY`, or `TEMPLATE_SITE`. For `TEMPLATE_SITE` and leads where Google Places returns a `websiteUri`, Hunter's Domain Search can extract associated emails from that domain.
2. **Free API key** — 25 searches/mo with no credit card, includes API access.
3. **Simple REST API** — `GET https://api.hunter.io/v2/domain-search?domain=example.com&api_key=KEY` returns emails with confidence scores.
4. **0 credits if no emails found** — you only pay for successes.

**The enrichment waterfall (executed between Simon and Yoncé):**

```
1. If lead has websiteUri → Hunter.io Domain Search on that domain
2. If no websiteUri → construct "{businessname}.com" pattern and try Hunter
3. If Hunter finds nothing → store phone number only, flag as "NEEDS_MANUAL_ENRICHMENT"
4. Leads with email → proceed to full pipeline
5. Leads without email → proceed to Dre (build demo), but skip Hov (no outreach until email found)
```

**Scaling beyond free tier:** Once FlyNerd has revenue, upgrade to Hunter Starter ($34/mo annual) for 2,000 credits/mo — enough for ~100 leads/mo with Domain Search + verification. Alternatively, Apollo.io Basic ($49/mo) gets you 5,000 credits/year with API access.

### Implementation

1. `src/lib/hunter.ts` — New file: Hunter.io API client (`domainSearch()`, `emailFinder()`)
2. Add `HUNTER_API_KEY` env var to Railway
3. Simon Cowell calls Hunter after Google Places, before DB insert
4. Store `contactEmail` (best match) and `enrichmentSource` ("hunter" | "yelp" | "manual") on the lead

### Estimated Size

~50 lines of new code

---

## Phase 2: Hov — Outreach Closer

### Objective

Send personalized 1:1 sales emails to discovered leads. Uses the Anthropic API to generate a personalized email from lead context, then sends via ActiveCampaign (email + CRM in one system). Updates deal stage.

### Design Decision: ActiveCampaign Only

Per your preference, Hov will use ActiveCampaign for both email delivery and CRM management. This keeps the stack simple — one system for contacts, deals, pipelines, and email sending.

**AC API capabilities needed:**
- `POST /api/3/contacts` — Create contact with email, phone, custom fields
- `POST /api/3/deals` — Create deal in pipeline with lead data
- `PUT /api/3/deals/{id}` — Update deal stage (e.g., move to "Outreached" or "Negotiating")
- `POST /api/3/campaigns` — Send 1:1 personalized email (or use AC's transactional email API)

**Important caveat:** ActiveCampaign's standard API is designed for marketing automation, not transactional 1:1 emails. For true 1:1 outreach, you have two sub-options within AC:

- **Option A: AC Campaigns API** — Create a campaign with a single recipient. Works but is clunky for 1:1.
- **Option B: AC + Postmark (included in some AC plans)** — AC acquired Postmark; some plans include transactional email. Check your AC plan.
- **Option C: AC Automations** — Create the contact with a tag (e.g., `outreach_ready`), then trigger an AC automation that sends the personalized email. This is the most "AC-native" approach and gives you deliverability features, open/click tracking, and unsubscribe management for free.

**Recommendation: Option C (AC Automations with tag trigger)** — Hov creates the contact, attaches custom field data (demo URL, video URL, pain points), applies the `outreach_ready` tag, and AC's automation fires the email. This leverages AC's built-in deliverability infrastructure.

### Email Generation

Hov uses Claude (via the Anthropic SDK already in the project) to generate personalized emails. The prompt should include:

- Lead's business name, niche, city
- Yoncé's intel (pain points, reputation summary, opportunity score)
- Dre's output (demo site URL, video URL)
- FlyNerd's value prop and tone guidelines (the "Jordan" persona)

The generated email body is stored as a custom field on the AC contact, then the AC automation uses that field as the email content.

### Implementation Scope

1. `src/lib/activecampaign.ts` — Implement: `createContact()`, `addTag()`, `createDeal()`, `updateDealStage()`, `setCustomField()`
2. `src/lib/prompts.ts` — Add: `buildOutreachPrompt()` function
3. `src/index.ts` — Replace Hov stub (lines 287-298) with:
   - Fetch lead from Supabase (get intel data, demo URL, video URL)
   - Generate personalized email via Claude
   - Create/update AC contact with custom fields (email body, demo URL, video URL)
   - Apply `outreach_ready` tag to trigger AC automation
   - Create AC deal in pipeline
   - Update lead status to `"OUTREACHED"` in Supabase

### Required Env Vars (Railway)

- `ACTIVECAMPAIGN_API_URL` (e.g., `https://youraccountname.api-us1.com`)
- `ACTIVECAMPAIGN_API_KEY`
- `FROM_EMAIL` (e.g., `jordan@flynerd.com`)

### AC Automation Setup (Manual, in AC Dashboard)

You'll need to create an automation in ActiveCampaign:
- **Trigger:** Tag `outreach_ready` is applied
- **Action:** Send email using the custom field `%OUTREACH_EMAIL_BODY%` as the email content
- **From:** Jordan @ FlyNerd
- **Subject:** Pull from custom field `%OUTREACH_SUBJECT%`

This is a one-time setup in the AC dashboard — Hov just pushes data and applies the tag.

### Estimated Size

~150 lines of new code across 3 files

---

## Phase 3: Tyrion — Orchestrator

### Objective

Chain Simon → Yoncé → Dre → Hov into a single automated pipeline. Tyrion is the "run the whole thing" button.

### Design Decision: Internal vs. MCP Self-Call

**Option A: Internal function calls** — Tyrion directly calls the same handler functions
- Pros: Fast, no network overhead, simpler error handling
- Cons: Duplicates the handler wiring, harder to test individual stages

**Option B: MCP self-call via Anthropic API** — Tyrion calls Claude with its own MCP tools
- Pros: Each agent runs independently, exactly like manual invocation
- Cons: Expensive (Anthropic API costs per call), slow (network round-trips), complex

**Recommendation: Option A (internal function calls)**

Extract each agent's core logic into standalone async functions, then have both the MCP handler and Tyrion call the same function. This is the cleanest pattern:

```
MCP handler (simon_cowell) → simonCowell(city, niche)
MCP handler (yonce)         → yonceAnalyze(businessName, placeId, leadId)
MCP handler (dre)           → dreBuild(leadId, businessName, niche, rating, intelPayload)
MCP handler (hov)           → hovOutreach(leadId, contactEmail, context)

Tyrion orchestrator (processes ALL qualified leads, up to 20):
  1. leads = await simonCowell(city, niche)  // returns up to 20 leads
  2. for each lead (NO_WEBSITE or SOCIAL_ONLY):
       intel = await yonceAnalyze(lead.businessName, lead.placeId, lead.leadId)
       if intel.opportunityScore >= minScore:
         build = await dreBuild(lead.leadId, lead.businessName, niche, lead.rating, intel)
         if lead.contactEmail:
           await hovOutreach(lead.leadId, lead.contactEmail, "initial outreach")
         else:
           // Demo built but no email — flag for manual follow-up via phone
           markAsNeedsManualOutreach(lead.leadId)
  3. Return pipeline summary
```

### Pipeline Summary Return

```typescript
{
  city: string,
  niche: string,
  pipeline: {
    discovered: number,    // Simon found
    qualified: number,     // Passed filters
    analyzed: number,      // Yoncé scored
    aboveThreshold: number, // Score >= minScore
    built: number,         // Dre deployed
    outreached: number,    // Hov emailed
  },
  leads: Array<{ leadId, businessName, status, score, demoUrl? }>
}
```

### Refactoring Required

This phase requires extracting handler logic into reusable functions. The refactor touches:

1. `src/agents/simon.ts` — Extracted discovery logic
2. `src/agents/yonce.ts` — Extracted intel logic (move from index.ts)
3. `src/agents/dre.ts` — Extracted build logic (move from index.ts)
4. `src/agents/hov.ts` — Extracted outreach logic
5. `src/index.ts` — Slim handlers that call extracted functions + Tyrion orchestration

### Estimated Size

~80 lines of new orchestration code, plus refactoring existing handlers into extracted functions

---

## Execution Sequence

### Step 1: Schema Validation
- Verify `"AgencyLead"` columns in Supabase match what Simon needs to write
- Add `discoveryData` JSONB column if needed
- Document any schema changes

### Step 2: Implement Simon Cowell
- Add Google Places Text Search (New) integration
- Add niche-to-type mapping
- Add lead qualification filters
- Add Supabase insert logic
- Test locally with `Atlanta, GA` / `hvac`
- Deploy to Railway, test via MCP

### Step 3: Implement Hov
- Choose email provider (Resend recommended)
- Implement `email.ts` + `activecampaign.ts`
- Add outreach prompt to `prompts.ts`
- Wire up the Hov handler
- Test with a test email address
- Deploy and verify

### Step 4: Refactor into Extractable Functions
- Move Yoncé logic from index.ts → `src/agents/yonce.ts`
- Move Dre logic from index.ts → `src/agents/dre.ts`
- Move Simon logic → `src/agents/simon.ts`
- Move Hov logic → `src/agents/hov.ts`
- Keep index.ts as thin MCP handler wiring

### Step 5: Implement Tyrion
- Wire orchestration logic using extracted functions
- Add error handling per stage (don't let one lead failure kill the pipeline)
- Add progress reporting
- Test full pipeline: `tyrion({ city: "Atlanta, GA", niche: "hvac", minScore: 50 })`

### Step 6: Cleanup
- Remove stale bug note from CLAUDE.md (line 31)
- Update Obsidian vault with architecture changes
- Run full pipeline against Nashville, TN / plumbing as second market validation

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google Places API returns no results for niche query | Pipeline produces zero leads | Fall back to broader text query without `includedType` filter |
| Hunter.io free tier exhausted (25 searches/mo) | Can't enrich emails for all leads | Prioritize NO_WEBSITE leads; store phone for rest; upgrade to Starter ($34/mo) once revenue justifies it |
| MCP timeout on long Tyrion pipelines (20 leads × 4 agents) | Partial execution | Process leads sequentially with per-lead error isolation; return partial results on timeout |
| ActiveCampaign deliverability for cold outreach | Emails land in spam | Warm up domain, use SPF/DKIM/DMARC, start with low volume; AC has built-in reputation management |
| Supabase schema mismatch | Insert failures | Validate schema before first write; use `discoveryData` JSONB for flexibility |
| HeyGen video generation timeout in Dre | Demo deployed without video | Already handled — Dre fires HeyGen async and doesn't block on completion |
| Hunter.io Domain Search misses local service businesses | Low email enrichment rate | Local service businesses often don't have indexed domains; fallback to phone-based outreach |

---

## Open Questions (Remaining)

1. ~~**Email provider preference?**~~ → **RESOLVED: ActiveCampaign only**
2. ~~**Contact enrichment?**~~ → **RESOLVED: Hunter.io free tier (25 searches/mo) + phone fallback**
3. **Supabase schema:** Can you share the current DDL (or screenshot from Supabase dashboard) so I can verify column names before writing insert logic?
4. ~~**Rate limiting / batch size?**~~ → **RESOLVED: All qualified leads, up to 20 per run**
5. ~~**Tyrion timeout?**~~ → **RESOLVED: Process all, return partial results on timeout**
6. **ActiveCampaign plan:** Which AC plan are you on? Need to confirm whether the API supports transactional emails or if we need the automation/tag-trigger approach.
7. **Hunter.io account:** Do you already have a Hunter.io account, or should I plan for you to create one and add the API key to Railway?