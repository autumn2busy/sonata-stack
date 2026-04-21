# AC Post-Call Close Email — Template Spec

Date: 2026-04-21 (revised same day after field-architecture clarification)
Owner: Autumn
Status: Ready to configure in AC
Depends on: Kris commit that writes Stripe paymentLink → AC contact field 173

## Purpose

The email the prospect receives after a strategy call. Fires from the
"FlyNerd — Call Completed Post-Call Close" AC automation when the
`CALL_COMPLETED` tag is applied to a contact.

## AC contact field architecture (important — don't confuse these)

| Field | ID | Tag | Populated by | Lifecycle |
|---|---|---|---|---|
| DEMO_URL | 168 | `%DEMOURL%` | Dre, during cold outreach | Set before first outreach send, stable through the call |
| CLOSE_DEMO_URL | 171 | `%CLOSE_DEMO_URL%` | A future post-build "launch" process (not Kris) | Set only after the 7-day build is finalized |
| OFFER_SLUG | 173 | `%OFFER_SLUG%` | Kris, at call-completed | Set when the webhook fires and Stripe session is created |

The post-call close email references `%DEMOURL%` (field 168) and
`%OFFER_SLUG%` (field 173). It does **not** reference `%CLOSE_DEMO_URL%`
— that URL does not exist yet at call-completion time.

## Prerequisites (verify before sending)

1. AC contact custom field **`%DEMOURL%`** exists at id **168** and is
   populated by Dre before the outreach email is sent. By the time a
   call-completed webhook fires, this field has a working demo URL.
2. AC contact custom field **`%OFFER_SLUG%`** exists at id **173**.
3. Kris (sonata-stack/src/agents/kris.ts) is deployed to Railway and writes
   `paymentLink` → field 173 when the Stripe Checkout Session succeeds.
4. The AC automation has a **delay of at least 60 seconds** BEFORE the email
   send step. This ensures Kris (which runs async in the background after
   the webhook returns 202 Accepted) has time to create the Stripe session
   and write field 173 before the email fires. See "Known race condition"
   below.

## Subject lines

Primary: `%FIRSTNAME%, let's lock in your start date`

Alternates (A/B test candidates):
- `%FIRSTNAME%, deposit link inside`
- `Locking in your 7-day build`
- `Deposit + next steps from our call`

## Preheader

```
Your deposit kicks off the 7-day build. Your original demo is linked
below if you want to share it with your team.
```

## Body (plain-text version for deliverability fallback)

```
Hi %FIRSTNAME%,

Great speaking with you earlier. Here's the deposit link to lock in your
start date and kick off the 7-day build.

Pay the deposit and start my build:
%OFFER_SLUG%

In the meantime, your demo is still live if you want to share it with
your team or revisit anything we discussed on the call:

%DEMOURL%

Once the deposit lands we'll get to work: discovery refinement, build,
and launch. After delivery you'll get your finalized production URL with
everything we aligned on baked in.

Questions about scope, timing, or anything we didn't cover? Just reply to
this email — it comes straight to my inbox.

Looking forward to shipping this.

Autumn Williams
Founder, FlyNerd Tech
flynerd.tech
```

## Body (HTML / AC rich email structure)

Paste the structure below into the AC campaign editor. Each numbered
block corresponds to a block in AC's drag-and-drop editor.

### Block 1 — Greeting + primary framing (Text)

```
Hi %FIRSTNAME%,

Great speaking with you earlier. Here's the deposit link to lock in
your start date and kick off the 7-day build.
```

### Block 2 — Deposit CTA (Button, THIS is the conversion — put it first)

- Button label: **Pay deposit and start my build →**
- Button href: `%OFFER_SLUG%`
- Style: primary / filled (brand button style)
- Full-width on mobile: yes

### Block 3 — Demo reference (Text)

```
In the meantime, your demo is still live if you want to share it with
your team or revisit anything we discussed on the call.
```

### Block 4 — Demo link (Button, secondary)

- Button label: **Review your demo →**
- Button href: `%DEMOURL%`
- Style: secondary / ghost (outlined, not filled)
- Full-width on mobile: yes

### Block 5 — Expectations + reply invitation (Text)

```
Once the deposit lands we'll get to work: discovery refinement, build,
and launch. After delivery you'll get your finalized production URL with
everything we aligned on baked in.

Questions about scope, timing, or anything we didn't cover? Just reply
to this email — it comes straight to my inbox.

Looking forward to shipping this.

Autumn Williams
Founder, FlyNerd Tech
flynerd.tech
```

### Block 6 — Footer (AC default)

Use AC's standard footer with unsubscribe link, company address, and
any compliance text.

## Personalization tag reference

| Tag | AC field ID | Source | Populated when |
|---|---|---|---|
| `%FIRSTNAME%` | (built-in) | AC contact `firstName` | On contact create |
| `%DEMOURL%` | 168 | Dre during outreach | Before outreach send (long before call) |
| `%OFFER_SLUG%` | 173 | Kris after Stripe session create | On `CALL_COMPLETED` tag (within ~5s warm, 15s cold) |

## Known race condition

The `CALL_COMPLETED` tag triggers **two** things simultaneously in the AC
stack:

1. The webhook to sonata-stack which runs Kris asynchronously
2. The AC automation "FlyNerd — Call Completed Post-Call Close"

If the automation's email send happens before Kris writes to field 173,
the email's "Pay deposit" button renders with an **empty** href.

`%DEMOURL%` (field 168) is already populated from cold outreach, so it is
not affected by this race.

### Mitigation

Add a **Wait for time** step at the top of the automation before the email
send. Recommended: **60 seconds**. Rationale:

- Kris's new flow (Supabase read → profile classify → Stripe session create
  → Claude draft → one AC writeback) completes in 2-5 seconds on a warm
  cache, up to 10-15 seconds on cold start (no longer calls Dre, so it's
  much faster than the earlier version).
- 60 seconds gives headroom for cold starts, Stripe latency, and AC API
  write propagation.
- The prospect is unlikely to notice a 60-second delay between "call
  ended" and "email arrived."

### Fallback if `%OFFER_SLUG%` is empty

If you want graceful degradation when Kris's Stripe call fails, use AC
conditional content on Block 2:

- If `%OFFER_SLUG%` is populated → render the deposit button
- If `%OFFER_SLUG%` is empty → render fallback text: "Your payment link
  is on the way — we'll send it in a separate email shortly. Reply here
  if you'd like to move forward sooner."

Nice-to-have; if Kris runs reliably the fallback is rarely hit.

## Smoke test runbook (using `info@nestedobjects.com` on `nestedobjects.com`)

### Phase 1 — Verify email template rendering (fastest, 10 minutes)

This tests the email copy + button wiring with manually-set field values.
Does NOT test Kris end-to-end — that's Phase 2.

1. In AC, open the contact `info@nestedobjects.com` (or create one if
   it doesn't exist).
2. Manually populate these contact custom fields with test values:
   - Field 165 (`%AGENCYLEADID%`): `test-smoke-nested`
   - Field 167 (`%NICHE%`): `SaaS / Digital Agency`
   - Field 168 (`%DEMOURL%`): pick any FlyNerd-owned URL that renders,
     e.g. `https://flynerd.tech/ai-website`
   - Field 173 (`%OFFER_SLUG%`): the UL deposit payment link:
     `https://portal.flynerd.tech/b/6oU8wR1Tv2B2f2jbKybo40d`
3. In the AC automation editor, verify:
   - Trigger is `CALL_COMPLETED` tag applied
   - There is a Wait step of at least 60 seconds
   - The email references `%DEMOURL%` and `%OFFER_SLUG%` (NOT
     `%CLOSE_DEMO_URL%`)
4. Apply the `CALL_COMPLETED` tag to the contact (manually, in AC).
5. Wait 60-90 seconds, then check `info@nestedobjects.com`:
   - Subject line personalized with firstname
   - "Pay deposit" button opens the live Stripe checkout page
   - "Review your demo" button goes to the flynerd.tech URL
6. If anything is broken, fix before Phase 2.

### Phase 2 — Full-pipeline end-to-end (30-60 minutes)

Tests Kris firing via the real webhook path.

1. Seed a Supabase AgencyLead row for Nested Objects. Minimum viable row:
   ```sql
   INSERT INTO "AgencyLead" (
     id, "businessName", niche, "contactEmail", status,
     "leadSource", "intelData", "updatedAt", "createdAt"
   ) VALUES (
     gen_random_uuid()::text,
     'Nested Objects',
     'SaaS / Digital Agency',
     'info@nestedobjects.com',
     'CALL_BOOKED',
     'COLD',
     '{"rating": 0, "reviewCount": 0, "painPoints": ["after-hours inquiries going unanswered"], "reputationSummary": "Smoke-test lead for FlyNerd pipeline."}'::jsonb,
     now()::text,
     now()::text
   );
   ```
   Copy the returned `id` — this is the `agency_lead_id`.
2. In AC, verify the `info@nestedobjects.com` contact has field 165
   (`%AGENCYLEADID%`) set to that uuid. Also ensure field 168
   (`%DEMOURL%`) is populated with whatever demo URL you want the email
   to reference (Kris does NOT write this field).
3. Clear field 173 (`%OFFER_SLUG%`) on the AC contact so you can confirm
   Kris actually writes it on this run.
4. Tail Railway logs for sonata-stack so you can watch Kris fire:
   via the Railway dashboard or `railway logs --service sonata-stack`.
5. In AC, apply the `CALL_COMPLETED` tag to the contact.
6. Expected log sequence within ~10 seconds:
   - `[webhook] POST /webhooks/ac/call-completed`
   - `[Kris Jenner] start agencyLeadId=<uuid>`
   - `[Kris Jenner] qualification profile: underserved_local (niche="...")`
   - `[Kris Jenner] stripe session created id=cs_live_... amountCents=75000`
   - `[Kris Jenner] wrote paymentLink to AC contact field 173 for contactId=<id>`
   - `[Kris Jenner] done agencyLeadId=<uuid> paymentLink=SET`
7. Refresh the AC contact — field 173 should now be populated.
8. The automation's 60s wait fires, then the email sends to
   `info@nestedobjects.com`.
9. Verify the email:
   - Both buttons render with populated URLs
   - Clicking "Pay deposit" opens a Stripe Checkout session showing
     "FlyNerd AI Website Quickstart - Nested Objects" at $750.00
   - Clicking "Review your demo" opens the demo URL
10. Do NOT complete the payment — this is live Stripe; paying would
    actually charge.

### Phase 2 cleanup

After the smoke test:

- Remove any CLIENT_ACTIVE / CLOSED_WON tags that got applied by accident.
- Delete the test Supabase AgencyLead row if you seeded one manually.
- The orphan Stripe Checkout Session sits in your Stripe dashboard under
  Checkout Sessions. Not harmful; expires after 24h if unpaid.

## When to declare the automation "shippable"

Phase 2 passes on a real-looking lead at least once. Specifically:

- [ ] Kris logs show all 5 steps completing (lookup, profile, Stripe, draft, writeback)
- [ ] AC contact field 173 populated after the run
- [ ] Email arrives at the test inbox within 2 minutes of the tag
- [ ] Both buttons in the email are clickable and route to working URLs
- [ ] Stripe checkout displays the correct profile-aware amount
  ($750 for UL, $1,750 for TP) and the correct product name
- [ ] No errors in Railway logs

Once all boxes are checked, the automation is safe to use on real
cold-outreach prospects.
