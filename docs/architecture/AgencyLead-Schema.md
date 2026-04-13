# AgencyLead Schema

> **Source of truth for all Supabase operations on the `"AgencyLead"` table.**
> Every AI agent (in any of the three writer surfaces: sonata-stack, flynerd_agency, n8n) MUST read this before writing any `.from()`, `.update()`, `.select()`, or `.eq()` call.
>
> **Last DDL validation:** 2026-04-01 (direct `information_schema.columns` export from Supabase)
> **Last status-model validation:** 2026-04-08 (live `agency_lead_status_check` constraint)

## Critical Naming Convention

- **Table:** `"AgencyLead"` (quoted PascalCase)
- **Columns:** camelCase for Sonata pipeline columns, snake_case for some newer/inbound columns
- **`id` is `text`, NOT `uuid`** — there is no auto-generation. You MUST supply the ID on INSERT.

## Full Column Reference

### Core Pipeline Columns

| Column | Type | Nullable | Default | Used By |
|--------|------|----------|---------|---------|
| `id` | text | NOT NULL | — | All writers. **Must be supplied on INSERT.** |
| `businessName` | text | NOT NULL | — | Simon, Yoncé, Dre, Hov |
| `niche` | text | NOT NULL | — | Simon, Tyrion |
| `contactEmail` | text | NULL | — | Hov |
| `contactPhone` | text | NULL | — | Simon (enrichment) |
| `placeId` | text | NULL | — | Simon, Yoncé. **UNIQUE constraint** — used for upsert conflict resolution. |
| `status` | text | NOT NULL | `'PROSPECT'` | All writers. **CHECK-constrained, see Status Values below.** |
| `stage` | text | NULL | — | Operational/CRM granularity. **No CHECK constraint exists in DB** (known gap). |
| `scoutData` | jsonb | NULL | — | Simon (raw discovery data) |
| `intelScore` | integer | NULL | — | Yoncé |
| `intelData` | jsonb | NULL | — | Yoncé, Dre |
| `demoSiteUrl` | text | NULL | — | Dre |
| `walkthroughVideoUrl` | text | NULL | — | Dre |
| `outreachHistory` | jsonb | NULL | — | Hov |
| `paymentLink` | text | NULL | — | Kris Jenner / close flow |
| `validUntil` | timestamp without time zone | NULL | — | Dre, Cersei |
| `lastInteraction` | timestamp without time zone | NULL | — | Hov, Tiny Harris |
| `leadSource` | text | NOT NULL | `'COLD'` | Simon, contact API, n8n |
| `location` | text | NULL | — | Simon (city/area) — **column is `location`, not `city`** |
| `sessionId` | text | NULL | — | MCP transport |
| `lead_type` | text | NULL | — | Classification |
| `priority` | text | NULL | — | Lead prioritization |

### Inbound Lead Capture Columns (Demo Site Forms)

Populated when a prospect fills out the lead capture form on a demo site.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `name` | text | NULL | — | Prospect's name (from form) |
| `phone` | text | NULL | — | Prospect's phone (from form) |
| `email` | text | NULL | — | Prospect's email (from form) |
| `system_down` | boolean | NULL | `false` | HVAC/service: is their system currently down? |
| `issue_type` | text | NULL | — | Type of service issue |
| `equipment_type` | text | NULL | — | Equipment needing service |
| `urgency` | text | NULL | — | Urgency of request |
| `preferred_time_window` | text | NULL | — | Desired service time |
| `service_address` | text | NULL | — | Service location |
| `zip` | text | NULL | — | ZIP code |
| `consent_to_contact` | boolean | NULL | `false` | TCPA consent flag |
| `consent_timestamp` | timestamp with time zone | NULL | — | When consent was given |
| `after_hours` | boolean | NULL | `false` | Form submitted after hours? |

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
| `updatedAt` | timestamp without time zone | NOT NULL | — | **No default — MUST be set on every INSERT and UPDATE** |
| `created_at` | timestamp with time zone | NOT NULL | `now()` | Migration artifact (duplicate) |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` | Migration artifact (duplicate) |

⚠️ **Timestamp warning:** Two pairs exist. Use the camelCase pair (`createdAt`, `updatedAt`) for application writes. The snake_case pair auto-populates via `now()`. Do not write to the snake_case pair from application code.

⚠️ **`updatedAt` has NO default.** Always: `updatedAt: new Date().toISOString()`

---

## Status Values — Canonical 13

The live `agency_lead_status_check` constraint enforces exactly these 13 values. Writing anything else will throw.

| Status | Set By | Meaning |
|--------|--------|---------|
| `PROSPECT` | Default / inbound | Lead created, not yet processed (column default) |
| `DISCOVERED` | Simon Cowell | Lead found via outbound discovery |
| `AUDITED` | Yoncé | Intel analysis complete |
| `DEMO_BUILT` | Dre | Demo site deployed (was `BUILT` pre-refactor) |
| `OUTREACH_SENT` | Hov / n8n | First outreach delivered (was `PITCHED` / `OUTREACHED` pre-refactor) |
| `REPLIED` | Hov / n8n | Prospect replied (was `NEGOTIATING` pre-refactor) |
| `CALL_BOOKED` | n8n (`MEETING_BOOKED` tag) | Discovery call scheduled |
| `CLOSED_WON` | Kris Jenner / Stripe webhook | Client signed (was `WON` pre-refactor) |
| `CLOSED_LOST` | Manual | Prospect declined (was `LOST` pre-refactor) |
| `OUTREACH_EXHAUSTED` | n8n (`Campaign_Complete` tag) | Cold sequence ended without reply |
| `DEMO_EXPIRED` | Cersei | Demo passed `validUntil`, locked (was `EXPIRED` pre-refactor) |
| `INBOUND_NEW` | n8n / contact API | Inbound form submission (new lead from demo site) |
| `CLIENT_ACTIVE` | Pipeline 5 / onboarding | Retained client, lifecycle owned by Pipeline 5 (was `ONBOARDING` pre-refactor) |

### Forbidden values (will throw)

`BUILT`, `PITCHED`, `OUTREACHED`, `NEGOTIATING`, `ONBOARDING`, `CLOSED_ASSETS_BUILT`, `WON`, `LOST`, `EXPIRED`, log-message strings, integers. If you find code writing any of these, it's a bug — fix per `2026-04-08-status-refactor-spec.md`.

### Status vs Stage

- **`status`** = lifecycle (the 13 above). Single source of truth for "where is this lead in the funnel."
- **`stage`** = operational/CRM granularity (Pipeline 5 stage names like `Kickoff / Discovery`, `At Risk`; or AC stage IDs).

Never put CRM stage IDs in `status`. Never put lifecycle values in `stage`. The `stage` column has **no CHECK constraint** in the live DB — application code is the only enforcement, so be careful.

### Default behavior

- Default status on INSERT (when column omitted) is `PROSPECT`.
- Inbound leads (form submissions) typically end up at `INBOUND_NEW` after the n8n tag-sync workflow runs.
- Outbound leads from Simon must explicitly set `status: "DISCOVERED"`.

---

## What Each Writer Does

### Simon Cowell (sonata-stack) — INSERT new row

```typescript
.from("AgencyLead").insert({
  id: crypto.randomUUID(),               // REQUIRED — no auto-generation
  businessName,
  niche,
  placeId,
  contactPhone,
  contactEmail,                          // from Hunter.io enrichment, may be null
  status: "DISCOVERED",
  leadSource: "simon_cowell",
  location: city,                        // column is "location", not "city"
  scoutData: { /* raw Google Places response */ },
  updatedAt: new Date().toISOString(),   // REQUIRED — no default
})
```

### Yoncé (sonata-stack) — UPDATE

```typescript
.from("AgencyLead").update({
  status: "AUDITED",
  intelScore,
  intelData: { /* full analysis payload */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

### Dre (sonata-stack) — UPDATE

```typescript
.from("AgencyLead").update({
  status: "DEMO_BUILT",                   // canonical, NOT "BUILT"
  demoSiteUrl,
  walkthroughVideoUrl,
  validUntil: validUntilDate.toISOString(),
  intelData: { /* merged with existing */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

### Hov (sonata-stack) — UPDATE

```typescript
.from("AgencyLead").update({
  status: "OUTREACH_SENT",                // canonical, NOT "PITCHED" or "OUTREACHED"
  lastInteraction: new Date().toISOString(),
  outreachHistory: { /* append to existing */ },
  updatedAt: new Date().toISOString(),
}).eq("id", leadId)
```

Note: Hov does NOT send the email. It pushes copy into AC and tags `FLYNERD_OUTREACH_PENDING`. The n8n workflow then flips status to `OUTREACH_SENT` after AC delivery confirms.

### n8n workflow (`d42cyp27QDIqZczu`) — UPDATE driven by AC tag events

Maps tags → status transitions per `2026-04-08-ac-tag-sync-workflow-spec.md`. Examples:
- `FLYNERD_OUTREACH_PENDING` → `OUTREACH_SENT`
- `Campaign_Complete` (if status was `OUTREACH_SENT`) → `OUTREACH_EXHAUSTED`
- `MEETING_BOOKED` → `CALL_BOOKED`
- `demo_completed` (if `leadSource = COLD`) → `REPLIED`
- `inbound_demo` / `FLYNERD-FORM-PENDING` → `INBOUND_NEW`

Before adding new status-write logic anywhere, check whether n8n already does it — do not duplicate.

### flynerd_agency API routes — UPDATE / INSERT

Multiple routes write here. Per the status refactor (`2026-04-08-status-refactor-spec.md`), audit and update any literal that doesn't match the canonical 13. Known offenders flagged in `2026-04-08-ground-truth-status-stage.md`.

---

## Key Differences From What You Might Assume

1. **`id` is `text` with no default.** Always supply `crypto.randomUUID()`.
2. **`location`, not `city`.** No `city` column exists.
3. **`scoutData`, not `discoveryData` or `intelData`.** Simon's raw Google Places data.
4. **`outreachHistory` exists.** Hov should append, not just flip status.
5. **`updatedAt` has no default.** Set on every INSERT and UPDATE.
6. **Default status is `PROSPECT`.** Simon must explicitly set `DISCOVERED`.
7. **Table is dual-purpose.** Outbound pipeline + inbound form submissions both live here. Filter by `leadSource` to distinguish (`COLD`/`simon_cowell` = outbound, others = inbound).
8. **Three writers, one table.** sonata-stack, flynerd_agency, and n8n all write here. Coordinate before adding new write paths.
9. **`status` is CHECK-constrained.** `stage` is not. Anything going into `status` must be in the canonical 13 or it throws.
10. **Status names changed in the 2026-04-08 refactor.** If you see `BUILT`, `PITCHED`, `NEGOTIATING`, `OUTREACHED`, `WON`, `LOST`, `EXPIRED`, `ONBOARDING`, or `CLOSED_ASSETS_BUILT` in code — that's a pre-refactor bug, fix it.