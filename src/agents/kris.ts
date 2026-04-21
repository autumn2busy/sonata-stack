import Anthropic from "@anthropic-ai/sdk";
import { getLeadById, updateLeadStatus } from "../lib/db.js";
import { execDre } from "./pipeline.js";
import { createCloseCheckoutSession } from "../lib/stripe.js";
import { updateContactField } from "../lib/ac.js";
import {
  getQualificationProfile,
  PROFILE_DEPOSIT_CENTS,
  profileProductName,
} from "../lib/profile.js";

// Contact-level AC custom field that holds the close-asset demo URL so the
// AC post-call close email can personalize with %CLOSE_DEMO_URL%.
const CONTACT_FIELD_CLOSE_DEMO_URL = "171";

// Contact-level AC custom field that holds the per-deal Stripe Checkout
// Session URL. The AC post-call close email uses %OFFER_SLUG% as the href
// on the "Pay deposit" button so each prospect sees a single-use checkout
// URL personalized to their deal.
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
  /** AC contact ID — used for the AC writeback of the close demo URL. */
  contactId: string;
  /** AC deal ID — used for Stripe metadata + later AC deal writeback. */
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
  closeDemoUrl: string;
  paymentLink: string;
  emailDraft: string;
  warnings: string[];
}

/**
 * Kris Jenner — Post-Strategy-Call Closer.
 *
 * Invoked when the AC CALL_COMPLETED tag fires a webhook at
 * /webhooks/ac/call-completed (see src/webhook.ts).
 *
 * Flow:
 *   1. Supabase lookup by agency_lead_id (AC contact field 165).
 *   2. Classify qualification profile from niche + intelData (matches
 *      flynerd-agency/components/demo/nicheConfig.ts). Determines which
 *      deposit amount and product name go to Stripe.
 *   3. Rebuild the demo via Dre using the enriched intel we already have
 *      (same demo URL — Dre's getCanonicalDemoUrl(leadId) is deterministic).
 *   4. Restore lead status to what it was before Dre's write (Dre sets
 *      status=DEMO_BUILT as a side effect, which is wrong for post-call).
 *   5. Create a real Stripe Checkout Session via inline price_data with
 *      profile-specific amount + product name. AC deal value overrides
 *      the profile default when explicitly set.
 *   6. Draft close email via Claude using real lead context.
 *   7. Write close_demo_url back to AC contact field 171 so AC's post-call
 *      email template can reference %CLOSE_DEMO_URL%.
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
  const originalStatus: string = lead.status;
  const intelData =
    lead.intelData && typeof lead.intelData === "object"
      ? (lead.intelData as Record<string, unknown>)
      : {};
  const rating =
    typeof (intelData as any).rating === "number"
      ? (intelData as any).rating
      : 0;

  // 2. Classify qualification profile (drives deposit amount + product name)
  const profile = getQualificationProfile({ niche, intelData });
  console.error(
    `[Kris Jenner] qualification profile: ${profile} (niche="${niche}")`,
  );

  // 3. Rebuild demo via Dre (same URL — refreshes content with enriched data)
  console.error(`[Kris Jenner] invoking Dre for leadId=${agencyLeadId}`);
  const dreResult = await execDre(
    agencyLeadId,
    businessName,
    niche,
    rating,
    intelData,
  );
  const closeDemoUrl: string = dreResult.demoSiteUrl;

  // 4. Restore original status — execDre set status=DEMO_BUILT, which is
  //    wrong for post-call context (prospect is past DEMO_BUILT).
  if (originalStatus && originalStatus !== "DEMO_BUILT") {
    try {
      await updateLeadStatus(agencyLeadId, originalStatus);
      console.error(
        `[Kris Jenner] restored status to ${originalStatus} (was overwritten to DEMO_BUILT by Dre)`,
      );
    } catch (err: any) {
      console.error(
        `[Kris Jenner] failed to restore status to ${originalStatus}:`,
        err?.message || err,
      );
      warnings.push("status_restore_failed");
    }
  }

  // 5. Real Stripe Checkout Session (inline price_data, profile-aware amount)
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
    console.error("[Kris Jenner] stripe session creation failed:", err?.message || err);
    warnings.push("stripe_session_failed");
    paymentLink = "";
  }

  // 6. Draft close email via Claude
  const painPoints = Array.isArray((intelData as any).painPoints)
    ? ((intelData as any).painPoints as string[])
    : [];
  const painPointsBlock =
    painPoints.length > 0
      ? painPoints.map((p) => `- ${p}`).join("\n")
      : "- (no specific pain points captured)";

  const systemPrompt = `You are Kris, FlyNerd's top closer architect. Your job is to draft a short post-strategy-call closing email.
We just audited the prospect's business and rebuilt their personalized demo.

Context:
- Business: ${businessName}
- Niche: ${niche}
- Close demo URL: ${closeDemoUrl}
- Stripe checkout link: ${paymentLink || "(Stripe link unavailable — ask prospect to reply for invoice)"}
- Known pain points:
${painPointsBlock}

Write the exact email body to send. Requirements:
- Under 180 words.
- Reference one concrete pain point.
- Include the close demo URL and the Stripe checkout link as clickable lines.
- End with a single strong CTA: "Click the link below to lock in your build today."
- No hallucinated placeholders, no Lorem ipsum, no em dashes.`;

  const completion = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: "user", content: "Draft the post-call closing email." }],
  });

  const emailDraft =
    completion.content[0]?.type === "text"
      ? completion.content[0].text.trim()
      : "";

  // 7. AC writeback — close_demo_url to field 171 and (if Stripe succeeded)
  //    paymentLink to field 173. Written in parallel to minimize latency.
  //    Either write can fail independently; we surface both in warnings.
  const writePromises: Array<Promise<void>> = [];

  writePromises.push(
    (async () => {
      try {
        await updateContactField(
          contactId,
          CONTACT_FIELD_CLOSE_DEMO_URL,
          closeDemoUrl,
        );
        console.error(
          `[Kris Jenner] wrote close_demo_url to AC contact field ${CONTACT_FIELD_CLOSE_DEMO_URL} for contactId=${contactId}`,
        );
      } catch (err: any) {
        console.error(
          `[Kris Jenner] failed to write close_demo_url to AC:`,
          err?.message || err,
        );
        warnings.push("ac_writeback_close_demo_url_failed");
      }
    })(),
  );

  if (paymentLink) {
    writePromises.push(
      (async () => {
        try {
          await updateContactField(
            contactId,
            CONTACT_FIELD_OFFER_SLUG,
            paymentLink,
          );
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
      })(),
    );
  } else {
    // No Stripe session was created (stripe_session_failed already logged).
    // Leave field 173 unchanged; the email's Pay button will render with
    // whatever stale value is in the field (usually empty on first run).
    console.error(
      `[Kris Jenner] skipping paymentLink writeback to AC field ${CONTACT_FIELD_OFFER_SLUG} because Stripe session was not created`,
    );
    warnings.push("ac_writeback_offer_slug_skipped_no_stripe");
  }

  await Promise.all(writePromises);

  console.error(
    `[Kris Jenner] done agencyLeadId=${agencyLeadId} closeDemoUrl=${closeDemoUrl} paymentLink=${paymentLink ? "SET" : "MISSING"}`,
  );

  return {
    status: "CLOSE_ASSET_BUILT",
    agencyLeadId,
    contactId,
    dealId,
    businessName,
    closeDemoUrl,
    paymentLink,
    emailDraft,
    warnings,
  };
}
