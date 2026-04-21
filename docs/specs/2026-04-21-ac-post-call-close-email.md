# AC Post-Call Close Email — Template Spec

Date: 2026-04-21
Owner: Autumn
Status: Ready to configure in AC
Depends on: Kris commit (post-0a5aaff) that writes Stripe paymentLink → AC contact field 173

## Purpose

The email the prospect receives after a strategy call. Fires from the
"FlyNerd — Call Completed Post-Call Close" AC automation when the
`CALL_COMPLETED` tag is applied to a contact.

## Prerequisites (verify before sending)

1. AC contact custom field **`%CLOSE_DEMO_URL%`** exists at id **171**.
2. AC contact custom field **`%OFFER_SLUG%`** exists at id **173**.
3. Kris (sonata-stack/src/agents/kris.ts) is deployed to Railway and writes:
   - `closeDemoUrl` → field 171 on every webhook call
   - `paymentLink` → field 173 when the Stripe Checkout Session succeeds
4. The AC automation has a **delay of at least 60 seconds** BEFORE the email
   send step. This ensures Kris (which runs async in the background after
   the webhook returns 202 Accepted) has time to rebuild the demo, create
   the Stripe session, and write both fields before the email fires. See
   "Known race condition" below.

## Subject lines

Primary: `%FIRSTNAME%, your demo is live`

Alternates (A/B test candidates):
- `Your demo is live — let's ship it`
- `Locking in your start date`
- `Your concierge is ready. Here's your link.`

## Preheader

```
7-day build starts the moment your deposit lands. Everything we discussed
on the call is in the demo below.
```

## Body (plain-text version for deliverability fallback)

```
Hi %FIRSTNAME%,

Following up from our call — I've rebuilt your demo overnight with the
details we talked through. You'll see your real services, your copy,
your voice, and the concierge trained on all of it.

Review your demo:
%CLOSE_DEMO_URL%

When you're ready to move forward, the link below takes you to a secure
Stripe checkout for your deposit. Payment confirms your start date and
kicks off the 7-day build.

Pay the deposit and start my build:
%OFFER_SLUG%

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

### Block 1 — Greeting (Text)

```
Hi %FIRSTNAME%,

Following up from our call — I've rebuilt your demo overnight with the
details we talked through. You'll see your real services, your copy,
your voice, and the concierge trained on all of it.
```

### Block 2 — Demo link (Button)

- Button label: **Review your demo →**
- Button href (paste into the URL field): `%CLOSE_DEMO_URL%`
- Style: secondary / ghost (outline, not filled)
- Full-width on mobile: yes

### Block 3 — Transition copy (Text)

```
When you're ready to move forward, click below to pay your deposit.
Payment confirms your start date and kicks off the 7-day build.
```

### Block 4 — Deposit CTA (Button, THIS is the conversion)

- Button label: **Pay deposit and start my build →**
- Button href (paste into the URL field): `%OFFER_SLUG%`
- Style: primary / filled (use your accent / brand button style)
- Full-width on mobile: yes

### Block 5 — Reply invitation (Text)

```
Questions about scope, timing, or anything we didn't cover? Just reply to
this email — it comes straight to my inbox.

Looking forward to shipping this.

Autumn Williams
Founder, FlyNerd Tech
flynerd.tech
```

### Block 6 — Footer (AC default)

Use AC's standard footer with unsubscribe link, company address, and
any compliance text.

## Personalization tag reference

| Tag | AC field ID | Source | Notes |
|---|---|---|---|
| `%FIRSTNAME%` | (built-in) | AC contact `firstName` | Set on contact create |
| `%CLOSE_DEMO_URL%` | 171 | Kris writes after Dre rebuild | Non-null assuming Dre succeeds |
| `%OFFER_SLUG%` | 173 | Kris writes after Stripe session create | May be null if Stripe call fails — see fallback below |

## Known race condition

The `CALL_COMPLETED` tag triggers **two** things simultaneously in the AC
stack:

1. The webhook to sonata-stack which runs Kris asynchronously
2. The AC automation "FlyNerd — Call Completed Post-Call Close"

If the automation's email send happens before Kris finishes writing to
fields 171 and 173, the email renders with **empty** values — the buttons
will be broken.

### Mitigation

Add a **Wait for time** step at the top of the automation before the email
send. Recommended: **60 seconds**. Rationale:

- Kris's full flow (Supabase read → Dre rebuild → Stripe session create →
  Claude email draft → two AC writebacks) completes in 8-15 seconds on a
  warm cache, up to 40 seconds on cold start.
- 60 seconds gives headroom for cold starts and transient Stripe latency.
- The prospect is unlikely to notice a 60-second delay between "call
  ended" and "email arrived."

### Fallback if paymentLink is empty

If you want graceful degradation when the Stripe call fails, add this
logic in AC (requires conditional content):

- If `%OFFER_SLUG%` is populated → render Block 4 with the payment button
- If `%OFFER_SLUG%` is empty → render a fallback text: "Your payment link
  is on the way — we'll send it in a separate email shortly. Reply here
  if you'd like to move forward sooner."

This is nice-to-have; if Kris runs reliably, fallback is rarely hit.

## Smoke test runbook (using `info@nestedobjects.com` on `nestedobjects.com`)

### Phase 1 — Verify email template rendering (fastest, 10 minutes)

This tests the email copy + button wiring with manually-set field values.
Does NOT test Kris end-to-end — that's Phase 2.

1. In AC, open the contact `info@nestedobjects.com` (or create one if
   it doesn't exist).
2. Manually populate these contact custom fields with test values:
   - Field 165 (`%AGENCYLEADID%`): `test-smoke-nested`
   - Field 167 (`%NICHE%`): `SaaS / Digital Agency`
   - Field 171 (`%CLOSE_DEMO_URL%`): pick any FlyNerd-owned URL that
     renders, e.g. `https://flynerd.tech/ai-website`
   - Field 173 (`%OFFER_SLUG%`): the UL deposit payment link:
     `https://portal.flynerd.tech/b/6oU8wR1Tv2B2f2jbKybo40d`
3. In the AC automation editor, verify:
   - Trigger is `CALL_COMPLETED` tag applied
   - There is a Wait step of at least 60 seconds (see race condition above)
   - The email draft has the two buttons pointing at `%CLOSE_DEMO_URL%`
     and `%OFFER_SLUG%`
4. Apply the `CALL_COMPLETED` tag to the contact (manually, in AC).
5. Wait 60-90 seconds, then check `info@nestedobjects.com`:
   - Subject line personalized with firstname
   - "Review your demo" button goes to the flynerd.tech URL
   - "Pay deposit" button opens the live Stripe checkout page
6. If anything is broken, fix before Phase 2.

### Phase 2 — Full-pipeline end-to-end (30-60 minutes)

Tests Kris firing via the real webhook path. The lead must already exist
in Supabase with `intelData` populated (so Dre's rebuild has data to
work with).

1. Seed a Supabase AgencyLead row for Nested Objects. Easiest path: run
   Simon + Yoncé on a real AC-scouted lead for this test. Alternative:
   insert a row manually via the Supabase dashboard:
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
   (`%AGENCYLEADID%`) set to that uuid.
3. Clear fields 171 and 173 on the AC contact (so you can confirm Kris
   actually writes them on this run).
4. Tail Railway logs for sonata-stack so you can watch Kris fire:
   `railway logs --service sonata-stack` or via the Railway dashboard.
5. In AC, apply the `CALL_COMPLETED` tag to the contact.
6. Expected log sequence within ~15 seconds:
   - `[webhook] POST /webhooks/ac/call-completed`
   - `[Kris Jenner] start agencyLeadId=<uuid>`
   - `[Kris Jenner] qualification profile: underserved_local (niche="...")`
   - `[Kris Jenner] invoking Dre for leadId=<uuid>`
   - `[Kris Jenner] stripe session created id=cs_live_... amountCents=75000`
   - `[Kris Jenner] wrote close_demo_url to AC contact field 171 for contactId=<id>`
   - `[Kris Jenner] wrote paymentLink to AC contact field 173 for contactId=<id>`
   - `[Kris Jenner] done agencyLeadId=<uuid> closeDemoUrl=... paymentLink=SET`
7. Refresh the AC contact — fields 171 and 173 should now both be
   populated with real values.
8. The automation's 60s wait fires, then the email sends to
   `info@nestedobjects.com`.
9. Verify the email:
   - Buttons render with populated URLs
   - Clicking "Pay deposit" opens a Stripe Checkout session showing
     "FlyNerd AI Website Quickstart - Nested Objects" at $750.00
   - Clicking "Review your demo" opens the demo URL (should render
     Nested Objects personalized content if Dre had intelData to work with)
10. Do NOT complete the payment — this is live Stripe; paying would
    actually charge.

### Phase 2 cleanup

After the smoke test:

- Remove the `CLIENT_ACTIVE` or `CLOSED_WON` tags if they got applied
  accidentally.
- Delete the test Supabase AgencyLead row if you created one manually
  (not needed if you ran Simon/Yoncé and want to keep the lead).
- The orphan Stripe Checkout Session sits in your Stripe dashboard under
  Checkout Sessions. Not harmful; expires after 24h if unpaid.

## When to declare the automation "shippable"

Phase 2 passes on a real-looking lead at least once. Specifically:

- [ ] Kris logs show all 7 steps completing
- [ ] AC contact shows both fields 171 and 173 populated after the run
- [ ] Email arrives at the test inbox within 2 minutes of the tag
- [ ] Both buttons in the email are clickable and route to working URLs
- [ ] Stripe checkout displays the correct profile-aware amount
  ($750 for UL, $1,750 for TP)
- [ ] No errors in Railway logs

Once all boxes are checked, the automation is safe to use on real
cold-outreach prospects.
