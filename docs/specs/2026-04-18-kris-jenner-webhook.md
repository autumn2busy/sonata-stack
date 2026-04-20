# Kris Jenner — Post-Call Closer Webhook (2026-04-18)

## What this spec covers
The wiring between ActiveCampaign's `CALL_COMPLETED` contact tag and the
Kris Jenner post-call closer running on sonata-stack.

## Flow

```
Strategy call ends
    → you tag the contact CALL_COMPLETED in AC
    → AC automation "FlyNerd — Call Completed Post-Call Close" fires
    → Step 1: Webhook POST to sonata-stack
    → Step 2: Wait 15 min (let Kris finish Dre rebuild + Stripe session)
    → Step 3: Remove CALL_COMPLETED, add CALL_COMPLETED_PROCESSED
    → AC email template fires referencing %CLOSE_DEMO_URL% (contact field 171)
```

## Webhook contract

### Endpoint
```
POST https://sonata-stack-production.up.railway.app/webhooks/ac/call-completed
```

### Required headers
```
Content-Type: application/x-www-form-urlencoded
x-webhook-secret: <value of WEBHOOK_SECRET env var on Railway>
```

If `x-webhook-secret` is missing or wrong, the webhook returns **401** and
logs `[webhook] call-completed rejected: bad or missing x-webhook-secret`.

### URL query string (deal context)
AC substitutes personalization tokens at fire time. Configure the webhook
URL in the AC automation step as:

```
/webhooks/ac/call-completed/?dealfield1=%DEAL_ID%&dealfield2=%DEAL_TITLE%&dealfield3=%DEAL_VALUE%&dealfield4=%DEAL_STAGE%&dealfield5=%DEAL_PIPELINE%
```

| Query param   | Maps to          | Required | Notes                                 |
| ------------- | ---------------- | -------- | ------------------------------------- |
| `dealfield1`  | `dealId`         | **Yes**  | AC deal ID. 400 if missing.           |
| `dealfield2`  | `dealTitle`      | No       | Logged only.                          |
| `dealfield3`  | `dealValue`      | No       | Parsed as dollars → Stripe cents.     |
| `dealfield4`  | `dealStage`      | No       | Logged only.                          |
| `dealfield5`  | `dealPipeline`   | No       | Logged only.                          |

Missing `dealfield3` (deal value) is fine — Kris falls back to the default
close price (`DEFAULT_CLOSE_PRICE_CENTS = 250000` i.e. $2,500.00 USD,
matching the flynerd-agency outreach route).

### POST body (contact context)
AC sends the contact's data as URL-encoded form fields. The webhook probes
several shapes for resilience, but AC's default is:

```
contact[id]=12345
contact[email]=prospect@example.com
contact[fields][165]=<agency_lead_id>
contact[fields][166]=<client_id — ignored for now>
contact[fields][167]=<niche — ignored for now>
contact[fields][168]=<demo_url — ignored for now>
```

| Field in body                  | Maps to          | Required |
| ------------------------------ | ---------------- | -------- |
| `contact[id]`                  | `contactId`      | **Yes**  |
| `contact[fields][165]`         | `agencyLeadId`   | **Yes**  |

If either required field is missing, webhook returns **400** with
`{"error":"missing contactId"}` or `{"error":"missing agencyLeadId (AC contact field 165)"}`
and logs the first 500 bytes of the raw body so the shape can be inspected.

### Response

| Scenario                | Status | Body                                                     |
| ----------------------- | ------ | -------------------------------------------------------- |
| Accepted                | 202    | `{"status":"accepted","agent":"kris_jenner",...}`        |
| Bad secret              | 401    | `{"error":"Unauthorized"}`                               |
| Missing required field  | 400    | `{"error":"missing <what>"}`                             |
| Unknown path            | 404    | `{"error":"Not found"}`                                  |

Kris's actual work happens in `setImmediate` **after** the 202 is sent.
Any failure inside Kris is logged with `[Kris Jenner]` / `[webhook]` prefixes
and does not surface to AC. AC will not retry because it saw 202.

## What Kris does

Full implementation in `src/agents/kris.ts`. High-level:

1. **Supabase lookup** via `getLeadById(agencyLeadId)`.
2. **Dre rebuild** via `execDre` using cached `intelData`. Same demo URL
   (`getCanonicalDemoUrl(leadId)` is deterministic) — the content at that
   URL refreshes with enriched config.
3. **Status restore** — Dre writes `status=DEMO_BUILT` as a side effect,
   which is wrong for post-call. Kris snapshots the original status before
   the Dre call and restores it after.
4. **Real Stripe Checkout Session** via `stripe.checkout.sessions.create`
   with inline `price_data` (no pre-existing Product/Price required).
   Uses AC deal value if present, else default close price.
5. **Claude email draft** via `claude-haiku-4-5-20251001`.
6. **AC writeback** to contact custom field **171 (`CLOSE_DEMO_URL`)** so
   the AC post-call email template can reference `%CLOSE_DEMO_URL%`.

## Required env vars (Railway)

| Env var                       | Why                                                |
| ----------------------------- | -------------------------------------------------- |
| `WEBHOOK_SECRET`              | Shared secret for `x-webhook-secret` header.       |
| `WEBHOOK_PORT`                | Defaults to 3100. Railway sets this automatically. |
| `SUPABASE_URL`                | Already required for other agents.                 |
| `SUPABASE_SERVICE_ROLE_KEY`   | Already required for other agents.                 |
| `ANTHROPIC_API_KEY`           | Already required for other agents.                 |
| `STRIPE_API_KEY`              | **New** — live Stripe secret key.                  |
| `ACTIVECAMPAIGN_URL`          | **New** — e.g. `awilliams.api-us1.com`.            |
| `ACTIVECAMPAIGN_KEY`          | **New** — AC API token.                            |

## AC automation configuration steps (manual)

Before activating the "FlyNerd — Call Completed Post-Call Close" automation
in AC, do all of this:

1. **Rotate** `STRIPE_API_KEY` (already done 2026-04-18 after accidental leak).
2. Set `STRIPE_API_KEY`, `ACTIVECAMPAIGN_URL`, `ACTIVECAMPAIGN_KEY`,
   `WEBHOOK_SECRET` on Railway (sonata-stack service).
3. Deploy sonata-stack.
4. In the AC automation step that calls the webhook:
   - URL: `https://sonata-stack-production.up.railway.app/webhooks/ac/call-completed/?dealfield1=%DEAL_ID%&dealfield2=%DEAL_TITLE%&dealfield3=%DEAL_VALUE%&dealfield4=%DEAL_STAGE%&dealfield5=%DEAL_PIPELINE%`
   - Method: POST
   - Headers: `x-webhook-secret: <same value you set on Railway>`
   - Body: default AC contact payload (URL-encoded, includes `contact[fields][165]` automatically because 165 is a contact-level custom field).
5. Verify the automation's post-webhook email template references
   `%CLOSE_DEMO_URL%` (contact field 171) — not the old `%DEMOURL%` (168).
6. Smoke test once end-to-end with a test lead
   (`autumn.s.williams+kris_smoke@gmail.com`) before activating for production.
7. Activate.

## Known gaps (follow-up work)

- **Discovery notes are not captured.** When you build the Google Meet
  transcript → structured-notes → AC deal-note flow, Kris should read
  those notes and include them in the Dre config + Claude email prompt.
- **HeyGen video regeneration** — Dre kicks off video generation as a
  non-blocking background task. For post-call close, the cold-outreach
  video is already on the demo; regenerating may be overkill.
- **Stripe payment confirmation → AgencyLead → Client transition** is
  still a separate n8n workflow (decision #8) — not part of this commit.
