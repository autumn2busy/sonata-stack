# AgencyLead Schema

> **Source of truth for all Supabase operations on the `"AgencyLead"` table.**
> Every AI agent MUST read this file before writing any `.from()`, `.update()`, `.select()`, or `.eq()` call.
>
> **Last validated:** 2026-04-01 (direct `information_schema.columns` export from Supabase)

## Critical Naming Convention

- **Table:** `"AgencyLead"` (quoted PascalCase)
- **Columns:** camelCase for Sonata columns, snake_case for some newer/inbound columns
- **`id` is `text`, NOT `uuid`** — there is no auto-generation. You MUST supply the ID on INSERT.

## Full Column Reference

### Core Pipeline Columns (Sonata Stack)

| Column | Type | Nullable | Default | Used By |
|--------|------|----------|---------|---------|
| `id` | text | NOT NULL | — | All agents. **Must be supplied on INSERT.** |
| `businessName` | text | NOT NULL | — | Simon, Yoncé, Dre, Hov |
| `niche` | text | NOT NULL | — | Simon, Tyrion |
| `contactEmail` | text | NULL | — | Hov |
| `contactPhone` | text | NULL | — | Simon (enrichment) |
| `placeId` | text | NULL | — | Simon, Yoncé |
| `status` | text | NOT NULL | `'PROSPECT'` | All agents |
| `scoutData` | jsonb | NULL | — | Simon (raw discovery data) |
| `intelScore` | integer | NULL | — | Yoncé |
| `intelData` | jsonb | NULL | — | Yoncé, Dre |
| `demoSiteUrl` | text | NULL | — | Dre |
| `walkthroughVideoUrl` | text | NULL | — | Dre |
| `outreachHistory` | jsonb | NULL | — | Hov |
| `paymentLink` | text | NULL | — | Kris Jenner / close flow |
| `validUntil` | timestamp without time zone | NULL | — | Dre, Cersei |
| `lastInteraction` | timestamp without time zone | NULL | — | Hov, Tiny Harris |
| `leadSource` | text | NOT NULL | `'COLD'` | Simon |
| `location` | text | NULL | — | Simon (city/area) |
| `sessionId` | text | NULL | — | MCP transport |
| `stage` | text | NULL | — | Pipeline stage tracking |
| `lead_type` | text | NULL | — | Classification |
| `priority` | text | NULL | — | Lead prioritization |

### Inbound Lead Capture Columns (Demo Site Forms)

These columns are populated when a prospect fills out the lead capture form on a demo site.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `name` | text | NULL | — | Prospect's name (from form) |
| `phone` | text | NULL | — | Prospect's phone (from form) |
| `email` | text | NULL | — | Prospect's email (from form) |
| `system_down` | boolean | NULL | `false` | HVAC/service: is their system currently down? |
| `issue_type` | text | NULL | — | What type of service issue |
| `equipment_type` | text | NULL | — | What equipment needs service |
| `urgency` | text | NULL | — | How urgent is the request |
| `preferred_time_window` | text | NULL | — | When they want service |
| `service_address` | text | NULL | — | Service location address |
| `zip` | text | NULL | — | ZIP code |
| `consent_to_contact` | boolean | NULL | `false` | TCPA consent flag |
| `consent_timestamp` | timestamp with time zone | NULL | — | When consent was given |
| `after_hours` | boolean | NULL | `false` | Was form submitted after hours? |

### Tracking / Attribution Columns

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `source_url` | text | NULL | — | Page URL where lead was captured |
| `utm_source` | text | NULL | — | UTM source parameter |
| `utm_medium` | text | NULL | — | UTM medium parameter |
| `utm_campaign` | text | NULL | — | UTM campaign parameter |
| `chat_summary` | text | NULL | — | AI chat summary from demo site |
| `chat_transcript` | text | NULL | — | Full chat transcript |
| `session_key` | text | NULL | — | Browser session identifier |

### Timestamp Columns

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `createdAt` | timestamp without time zone | NOT NULL | `CURRENT_TIMESTAMP` | Original column |
| `updatedAt` | timestamp without time zone | NOT NULL | — | **No default — must be set on INSERT** |
| `created_at` | timestamp with time zone | NOT NULL | `now()` | Duplicate (migration artifact) |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` | Duplicate (migration artifact) |

**⚠️ Timestamp warning:** There are two pairs of timestamp columns (`createdAt`/`updatedAt` and `created_at`/`updated_at`). The camelCase pair appears to be the original; the snake_case pair was likely added by a Supabase migration or default. Use the **camelCase** pair (`createdAt`, `updatedAt`) for consistency with the rest of the schema. The snake_case pair auto-populates via `now()`.

**⚠️ `updatedAt` has NO default.** You must supply it on INSERT: `updatedAt: new Date().toISOString()`

## Status Values

| Status | Set By | Meaning |
|--------|--------|---------|
| `PROSPECT` | Default | Lead created, not yet processed (default on INSERT) |
| `DISCOVERED` | Simon Cowell | Lead found via outbound discovery |
| `AUDITED` | Yoncé | Intel analysis complete |
| `BUILT` | Dre | Demo site deployed |
| `OUTREACHED` | Hov | First outreach sent |
| `NEGOTIATING` | Hov | Prospect replied |
| `WON` | Manual / Kris Jenner | Client signed |
| `LOST` | Manual | Prospect declined |
| `EXPIRED` | Cersei | Demo expired |

**Note:** `PROSPECT` is the default. Inbound leads from demo site forms start as `PROSPECT`. Outbound leads from Simon start as `DISCOVERED`. The `stage` column may provide additional pipeline granularity beyond `status`.

## What Each Agent Writes

**Simon Cowell** — INSERT new row:
```typescript
.from("AgencyLead").insert({
  id: crypto.randomUUID(),   // REQUIRED — no auto-generation
  businessName,
  niche,
  placeId,
  contactPhone,
  contactEmail,               // from Hunter.io enrichment (may be null)
  status: "DISCOVERED",
  leadSource: "simon_cowell",
  location: city,             // NOTE: column is "location", not "city"
  scoutData: { /* raw Google Places response */ },
  updatedAt: new Date().toISOString(),  // REQUIRED — no default
})
```

**Yoncé** — UPDATE existing row:
```typescript
.from("AgencyLead").update({
  status: "AUDITED",
  intelScore,
  intelData: { /* full analysis payload */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

**Dre** — UPDATE existing row:
```typescript
.from("AgencyLead").update({
  status: "BUILT",
  demoSiteUrl,
  walkthroughVideoUrl,
  validUntil: validUntilDate.toISOString(),
  intelData: { /* merged with existing */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

**Hov** — UPDATE existing row:
```typescript
.from("AgencyLead").update({
  status: "OUTREACHED",
  lastInteraction: new Date().toISOString(),
  outreachHistory: { /* append to existing */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

## Key Differences From What You Might Assume

1. **`id` is `text` with no default.** Always supply it. Use `crypto.randomUUID()`.
2. **`location` not `city`.** The city is stored in `location`.
3. **`scoutData` not `discoveryData`.** Simon's raw data goes in `scoutData`.
4. **`outreachHistory` exists.** Hov should append to this, not just update status.
5. **`updatedAt` has no default.** Must be set explicitly on every INSERT and UPDATE.
6. **Default status is `PROSPECT`, not `DISCOVERED`.** Simon should explicitly set `DISCOVERED`.
7. **Table is dual-purpose.** Pipeline leads AND inbound form submissions both live here. Filter by `leadSource` to distinguish (`COLD` = outbound, others = inbound).
8. **`paymentLink` exists.** The close flow can store a payment/invoice link directly on the lead.