# Clients Schema

> **Source of truth for the `"Client"` table in Supabase.**
> This table tracks retained clients — businesses that have signed and are paying for ongoing services.
> Separate from `"AgencyLead"` which tracks the outbound sales pipeline.

## Relationship to AgencyLead

```
AgencyLead (pipeline)                    Client (retained)
  status: DISCOVERED                       ┌──────────────┐
  status: AUDITED                          │  Client row  │
  status: BUILT                            │  created     │
  status: OUTREACHED                       │  when lead   │
  status: NEGOTIATING                      │  converts    │
  status: WON ──────── conversion ────────►│  to WON      │
  status: LOST                             └──────────────┘
  status: EXPIRED
```

A Client row is created when:
- An AgencyLead reaches status `WON`, OR
- A client is onboarded outside the pipeline (e.g., referral, existing relationship)

The `originLeadId` column links back to the AgencyLead row if one exists. For clients acquired outside the pipeline, this is NULL.

**Note:** `"AgencyLead"."id"` is `text` (not uuid), so `originLeadId` is also `text`. There is no FK constraint — the link is enforced in application code.

## Table: `"Client"`

**Naming convention:** Same as AgencyLead — quoted PascalCase table, camelCase columns.

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `businessName` | text | NOT NULL | — | Client's business name |
| `contactName` | text | NULL | — | Primary contact person |
| `contactEmail` | text | NULL | — | Primary email |
| `contactPhone` | text | NULL | — | Primary phone |
| `niche` | text | NULL | — | Business category |
| `city` | text | NULL | — | City / market |
| `status` | text | NOT NULL | `'ONBOARDING'` | Current client status |
| `plan` | text | NOT NULL | `'MAINTENANCE'` | Service plan type |
| `services` | jsonb | NULL | — | Active services array |
| `monthlyRate` | numeric | NULL | — | Monthly retainer amount |
| `siteUrl` | text | NULL | — | Live production site URL |
| `vercelProjectId` | text | NULL | — | Vercel project ID for this client |
| `vercelProjectName` | text | NULL | — | Vercel project name |
| `previousPlatform` | text | NULL | — | Where they migrated from (e.g., "wix", "squarespace") |
| `seoBaseline` | jsonb | NULL | — | Initial SEO metrics snapshot at onboarding |
| `originLeadId` | uuid | NULL | — | FK to AgencyLead.id if converted from pipeline |
| `activeCampaignContactId` | text | NULL | — | AC contact ID |
| `activeCampaignDealId` | text | NULL | — | AC deal ID |
| `onboardedAt` | timestamptz | NULL | — | Date client signed / onboarded |
| `nextReviewDate` | timestamptz | NULL | — | Next scheduled monthly review |
| `clientData` | jsonb | NULL | — | Catch-all for additional structured data |
| `createdAt` | timestamptz | NOT NULL | `now()` | Auto |
| `updatedAt` | timestamptz | NOT NULL | `now()` | Auto |

## Status Lifecycle

```
ONBOARDING → MIGRATING → ACTIVE → PAUSED → CHURNED
```

| Status | Meaning |
|--------|---------|
| `ONBOARDING` | Client signed, gathering requirements and access credentials |
| `MIGRATING` | Site migration in progress (e.g., Wix → Vercel) |
| `ACTIVE` | Site live, monthly services running |
| `PAUSED` | Client paused services (not cancelled) |
| `CHURNED` | Client cancelled |

## Service Plan Types

| Plan | Typical Services | Used By |
|------|-----------------|---------|
| `MAINTENANCE` | Monthly site updates, hosting, backups, uptime monitoring | Tiny Harris |
| `SEO` | Monthly SEO reports, keyword tracking, content optimization | Tiny Harris |
| `FULL` | Maintenance + SEO + quarterly strategy calls | Tiny Harris, Kris Jenner |
| `CUSTOM` | Custom scope defined in `services` JSONB | — |

## Services JSONB Structure

```json
{
  "services": [
    {
      "name": "seo",
      "active": true,
      "startedAt": "2026-04-01",
      "details": "Monthly keyword tracking, on-page optimization, local SEO"
    },
    {
      "name": "maintenance",
      "active": true,
      "startedAt": "2026-04-01",
      "details": "Monthly updates, hosting, backups, uptime monitoring"
    },
    {
      "name": "migration",
      "active": true,
      "startedAt": "2026-04-01",
      "completedAt": null,
      "details": "Wix to Vercel migration, custom dev setup"
    }
  ]
}
```

## SEO Baseline JSONB Structure

Captured at onboarding to measure progress over time:

```json
{
  "capturedAt": "2026-04-01",
  "domain": "clientdomain.com",
  "googleBusinessProfile": true,
  "currentRanking": {
    "primaryKeywords": [
      { "keyword": "atlanta hvac repair", "position": null },
      { "keyword": "ac installation atlanta", "position": null }
    ]
  },
  "siteSpeed": {
    "mobile": null,
    "desktop": null
  },
  "backlinks": null,
  "domainAuthority": null
}
```

## What Each Agent Writes

**Manual / Onboarding Script** — INSERT new client:
```typescript
.from("Client").insert({
  businessName,
  contactName,
  contactEmail,
  contactPhone,
  niche,
  city,
  status: "ONBOARDING",
  plan: "FULL",
  services: { services: [...] },
  previousPlatform: "wix",
  originLeadId: null,  // or AgencyLead.id if from pipeline
  onboardedAt: new Date().toISOString(),
})
```

**Tiny Harris** — READ for monthly reports, UPDATE review date:
```typescript
.from("Client")
  .select("*")
  .eq("status", "ACTIVE")
  .lte("nextReviewDate", new Date().toISOString())

// After generating report:
.from("Client").update({
  nextReviewDate: nextMonth.toISOString(),
  clientData: { ...existing, lastReport: reportData }
}).eq("id", clientId)
```

## Supabase DDL

```sql
CREATE TABLE "Client" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "businessName" text NOT NULL,
  "contactName" text,
  "contactEmail" text,
  "contactPhone" text,
  "niche" text,
  "city" text,
  "status" text NOT NULL DEFAULT 'ONBOARDING',
  "plan" text NOT NULL DEFAULT 'MAINTENANCE',
  "services" jsonb,
  "monthlyRate" numeric,
  "siteUrl" text,
  "vercelProjectId" text,
  "vercelProjectName" text,
  "previousPlatform" text,
  "seoBaseline" jsonb,
  "originLeadId" uuid REFERENCES "AgencyLead"("id"),
  "activeCampaignContactId" text,
  "activeCampaignDealId" text,
  "onboardedAt" timestamptz,
  "nextReviewDate" timestamptz,
  "clientData" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Index for Tiny Harris monthly queries
CREATE INDEX idx_client_active_review ON "Client" ("status", "nextReviewDate")
  WHERE "status" = 'ACTIVE';
```