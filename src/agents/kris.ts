import Anthropic from "@anthropic-ai/sdk";
import { getLeadById } from "../lib/db.js";
import { createCloseCheckoutSession } from "../lib/stripe.js";
import { updateContactField } from "../lib/ac.js";
import {
  getQualificationProfile,
  PROFILE_DEPOSIT_CENTS,
  profileProductName,
} from "../lib/profile.js";

// Contact-level AC custom field that holds the per-deal Stripe Checkout
// Session URL. The AC post-call close email uses %OFFER_SLUG% as the href
// on the "Pay deposit" button so each prospect sees a single-use checkout
// URL personalized to their deal.
//
// We intentionally do NOT touch field 168 (%DEMOURL%, initial cold-outreach
// demo) or field 171 (%CLOSE_DEMO_URL%, finalized production URL). Field 168
// was populated during the outreach pipeline (Dre's original build). Field
// 171 belongs to a future post-build launch process that finalizes the
// production URL after the 7-day build completes. Kris is a CLOSER, not a
// rebuilder — its only job on call-completed is to generate the Stripe
// checkout link the prospect will click to pay their deposit.
const CONTACT_FIELD_OFFER_SLUG = "173";

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("[Kris] ANTHROPIC_API_KEY required");
    }
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

export interface KrisJennerInput {
  /** Supabase AgencyLead.id — the primary key we do all lookups by. */
  agencyLeadId: string;
  /** AC contact ID — used for the AC writeback of the payment link. */
  contactId: string;
  /** AC deal ID — used for Stripe metadata. */
  dealId: string;
  /**
   * AC deal value in dollars (optional). When present, overrides the
   * profile-default deposit amount. When absent, the amount is chosen
   * from PROFILE_DEPOSIT_CENTS based on the lead's qualification profile.
   */
  dealValueDollars?: number;
}

export interface KrisJennerResult {
  status: "CLOSE_ASSET_BUILT";
  agencyLeadId: string;
  contactId: string;
  dealId: string;
  businessName: string;
  /** Per-deal Stripe Checkout Session URL. Empty if Stripe creation failed. */
  paymentLink: string;
  /** Internal-only email body drafted by Claude for owner visibility in logs.
   *  Not sent by Kris — AC's automation sends the templated email using
   *  %DEMOURL% and %OFFER_SLUG% personalization. */
  emailDraft: string;
  warnings: string[];
}

/**
 * Kris Jenner — Post-Strategy-Call Closer.
 *
 * Invoked when the AC CALL_COMPLETED tag fires a webhook at
 * /webhooks/ac/call-completed (see src/webhook.ts).
 *
 * Kris's single job: generate a per-deal Stripe Checkout Session URL and
 * write it to AC contact field 173 (%OFFER_SLUG%) so the automation's
 * "Pay deposit" button has a personalized href.
 *
 * Kris does NOT:
 *   - Rebuild the demo. The original outreach demo at field 168 (%DEMOURL%)
 *     is what the prospect already saw and what the post-call email still
 *     references.
 *   - Touch field 171 (%CLOSE_DEMO_URL%). That field belongs to a future
 *     post-build finalization process that writes the production URL after
 *     the 7-day build completes.
 *   - Modify Supabase status. The lead stays in CALL_BOOKED (or whatever
 *     status the outreach + call-scheduling flow put it in) until payment
 *     lands and n8n transitions it to CLIENT_ACTIVE.
 *
 * Flow:
 *   1. Supabase lookup — needs businessName + niche + intelData for the
 *      Stripe product name and profile classifier.
 *   2. Classify qualification profile (underserved_local vs tech_enabled_premium).
 *   3. Create Stripe Checkout Session via inline price_data with profile-
 *      specific amount + product name. AC deal value overrides when set.
 *   4. Draft internal Claude email (logs-only, for owner visibility).
 *   5. Write paymentLink to AC contact field 173.
 */
export async function runKrisJennerClose(
  input: KrisJennerInput,
): Promise<KrisJennerResult> {
  const { agencyLeadId, contactId, dealId, dealValueDollars } = input;
  const warnings: string[] = [];

  console.error(
    `[Kris Jenner] start agencyLeadId=${agencyLeadId} contactId=${contactId} dealId=${dealId}`,
  );

  // 1. Supabase lookup
  const lead = await getLeadById(agencyLeadId);
  if (!lead) {
    throw new Error(
      `[Kris] AgencyLead not found for agency_lead_id=${agencyLeadId}`,
    );
  }
  const businessName: string = lead.businessName;
  const niche: string = lead.niche;
  const intelData =
    lead.intelData && typeof lead.intelData === "object"
      ? (lead.intelData as Record<string, unknown>)
      : {};

  // 2. Classify qualification profile (drives deposit amount + product name)
  const profile = getQualificationProfile({ niche, intelData });
  console.error(
    `[Kris Jenner] qualification profile: ${profile} (niche="${niche}")`,
  );

  // 3. Stripe Checkout Session (inline price_data, profile-aware amount)
  let paymentLink = "";
  try {
    const profileDefaultCents = PROFILE_DEPOSIT_CENTS[profile];
    const amountCents =
      typeof dealValueDollars === "number" && dealValueDollars > 0
        ? Math.round(dealValueDollars * 100)
        : profileDefaultCents;
    const session = await createCloseCheckoutSession({
      dealId,
      agencyLeadId,
      businessName,
      amountCents,
      productName: profileProductName(profile, businessName),
    });
    paymentLink = session.url;
    console.error(
      `[Kris Jenner] stripe session created id=${session.sessionId} profile=${profile} amountCents=${amountCents} (profileDefault=${profileDefaultCents})`,
    );
  } catch (err: any) {
    console.error(
      "[Kris Jenner] stripe session creation failed:",
      err?.message || err,
    );
    warnings.push("stripe_session_failed");
    paymentLink = "";
  }

  // 4. Draft internal Claude email (logs-only, for owner visibility)
  const painPoints = Array.isArray((intelData as any).painPoints)
    ? ((intelData as any).painPoints as string[])
    : [];
  const painPointsBlock =
    painPoints.length > 0
      ? painPoints.map((p) => `- ${p}`).join("\n")
      : "- (no specific pain points captured)";

  const systemPrompt = `You are Kris, FlyNerd's closer architect. Draft a short internal note summarizing the post-call close state for this lead. This note is for the FlyNerd team's visibility in logs — NOT sent to the prospect. The actual prospect email is a templated AC send using %DEMOURL% and %OFFER_SLUG% personalization.

Context:
- Business: ${businessName}
- Niche: ${niche}
- Qualification profile: ${profile}
- Stripe checkout link: ${paymentLink || "(Stripe link unavailable — check Railway logs)"}
- Known pain points from intel:
${painPointsBlock}

Write a 3-4 sentence internal summary covering: whether the Stripe session was created successfully, the qualification profile, one pain point that came up in the intel, and one recommended next step for the account owner. No em dashes, no Lorem ipsum, plain text only.`;

  let emailDraft = "";
  try {
    const completion = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        { role: "user", content: "Draft the internal close summary." },
      ],
    });
    emailDraft =
      completion.content[0]?.type === "text"
        ? completion.content[0].text.trim()
        : "";
  } catch (err: any) {
    console.error(
      "[Kris Jenner] claude draft failed (non-blocking):",
      err?.message || err,
    );
    warnings.push("claude_draft_failed");
  }

  // 5. AC writeback — paymentLink to field 173 (skip when Stripe failed)
  if (paymentLink) {
    try {
      await updateContactField(contactId, CONTACT_FIELD_OFFER_SLUG, paymentLink);
      console.error(
        `[Kris Jenner] wrote paymentLink to AC contact field ${CONTACT_FIELD_OFFER_SLUG} for contactId=${contactId}`,
      );
    } catch (err: any) {
      console.error(
        `[Kris Jenner] failed to write paymentLink to AC:`,
        err?.message || err,
      );
      warnings.push("ac_writeback_offer_slug_failed");
    }
  } else {
    console.error(
      `[Kris Jenner] skipping paymentLink writeback to AC field ${CONTACT_FIELD_OFFER_SLUG} because Stripe session was not created`,
    );
    warnings.push("ac_writeback_offer_slug_skipped_no_stripe");
  }

  console.error(
    `[Kris Jenner] done agencyLeadId=${agencyLeadId} paymentLink=${paymentLink ? "SET" : "MISSING"}`,
  );

  return {
    status: "CLOSE_ASSET_BUILT",
    agencyLeadId,
    contactId,
    dealId,
    businessName,
    paymentLink,
    emailDraft,
    warnings,
  };
}
