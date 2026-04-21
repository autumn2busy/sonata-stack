import {
  insertLead,
  updateLeadAsAudited,
  updateLeadStatus,
} from "../lib/db.js";
import { execDre } from "./pipeline.js";
import { updateContactField } from "../lib/ac.js";

// AC contact custom field for the initial outreach / apply demo URL.
// Matches flynerd-agency's outreach route constant and the Kris spec doc.
const CONTACT_FIELD_DEMOURL = "168";

export interface WarmApplyInput {
  /** Form-provided email. Used as the AgencyLead.contactEmail. */
  email: string;
  /** Full name as entered. Purely display / logging. */
  name: string;
  businessName: string;
  /** Raw website URL (may or may not have scheme — flynerd-agency normalized). */
  websiteUrl: string;
  /** Niche string (from dropdown or free text when "Other"). */
  niche: string;
  /** Free text: "Top 3 services you offer". */
  services: string;
  /** Free text: "What's costing you revenue right now?" (min 50 chars). */
  painPoint: string;
  /** "Under 5 per week" / "5 to 20 per week" / etc. */
  leadVolume: string;
  /** "Within 30 days" / "1 to 3 months" / etc. */
  timeline: string;
  /** Optional free text. */
  tools?: string;
  /**
   * AC contact ID — if flynerd-agency already synced the contact when
   * /api/apply ran, we receive the AC contact id here and write the demo
   * URL back to it. If missing, we skip the AC writeback (log a warning).
   */
  contactId?: string;
  /**
   * flynerd-agency's applyId (uuid). Stored in scoutData for audit so we
   * can correlate Supabase rows with flynerd-agency apply logs.
   */
  applyId?: string;
}

export interface WarmApplyResult {
  agencyLeadId: string;
  demoSiteUrl: string;
  warnings: string[];
}

/**
 * Warm-lead demo build pipeline.
 *
 * Runs when a prospect completes the /apply qualification form on
 * flynerd-agency. Unlike the cold-outreach pipeline (Simon scout →
 * Yoncé enrich → Dre build), warm leads arrive with their URL + rich
 * form data, so we skip scouting + enrichment and go straight to Dre.
 *
 * The form answers stand in for Yoncé's output: `services` becomes the
 * reputation summary hook, `painPoint` becomes the first painPoint entry,
 * `niche` drives template routing. Dre's demo builder doesn't require a
 * Yelp rating, so 0 is fine.
 *
 * Flow:
 *   1. Insert AgencyLead row with status=AUDITED (skipping DISCOVERED
 *      because scouting is irrelevant — we have the URL).
 *   2. Populate intelData derived from form answers.
 *   3. Call execDre to build the personalized demo.
 *   4. Write the demo URL back to AC contact field 168 (%DEMOURL%) so
 *      AC email templates can reference it during the pre-call sequence.
 *   5. Return the agencyLeadId + demoSiteUrl for observability.
 *
 * Dispatched from flynerd-agency via POST /webhooks/warm-apply.
 */
export async function runWarmApply(
  input: WarmApplyInput,
): Promise<WarmApplyResult> {
  const warnings: string[] = [];

  console.error(
    `[warm-apply] start email=${input.email} businessName="${input.businessName}" url=${input.websiteUrl}`,
  );

  // 1. Create AgencyLead row — status AUDITED since we're skipping
  //    Simon/Yoncé. The scoutData captures the full form snapshot for
  //    audit and future retraining.
  const lead = await insertLead({
    businessName: input.businessName,
    niche: input.niche,
    contactEmail: input.email,
    scoutData: {
      leadSource: "warm_apply",
      sourceUrl: input.websiteUrl,
      services: input.services,
      painPoint: input.painPoint,
      leadVolume: input.leadVolume,
      timeline: input.timeline,
      tools: input.tools ?? "",
      applyId: input.applyId ?? null,
      submittedName: input.name,
      submittedAt: new Date().toISOString(),
    },
    status: "AUDITED",
  });

  const agencyLeadId = lead.id;
  console.error(
    `[warm-apply] created AgencyLead id=${agencyLeadId} for email=${input.email}`,
  );

  // 2. Build synthetic intelData from form answers. Dre reads painPoints,
  //    reputationSummary, and a few other fields — we map form answers
  //    onto the same shape Yoncé would normally produce.
  const intelData = {
    rating: 0,
    reviewCount: 0,
    painPoints: [input.painPoint],
    socialProofPoints: [] as string[],
    reputationSummary: `${input.businessName} offers ${input.services}. Target: ${input.niche}.`,
    operatingContext: `Inquiry volume: ${input.leadVolume}. Launch timeline: ${input.timeline}.${input.tools ? ` Current stack: ${input.tools}.` : ""}`,
    opportunityScore: 50,
    // Form-specific fields we keep for later context (Dre ignores unknown keys)
    sourceUrl: input.websiteUrl,
    services: input.services,
    leadVolume: input.leadVolume,
    timeline: input.timeline,
    tools: input.tools ?? "",
    qualificationProfile: inferQualificationProfileFromNiche(input.niche),
  };

  try {
    await updateLeadAsAudited(agencyLeadId, 50, intelData);
  } catch (err: any) {
    console.error(
      "[warm-apply] updateLeadAsAudited failed (non-blocking):",
      err?.message || err,
    );
    warnings.push("audit_update_failed");
  }

  // 3. Fire Dre. Output includes demoSiteUrl (deterministic per leadId).
  let demoSiteUrl = "";
  try {
    const dreResult = await execDre(
      agencyLeadId,
      input.businessName,
      input.niche,
      0, // rating — no review data yet for warm leads
      intelData,
    );
    demoSiteUrl = dreResult.demoSiteUrl;
    console.error(
      `[warm-apply] Dre built demo for leadId=${agencyLeadId} url=${demoSiteUrl}`,
    );
  } catch (err: any) {
    console.error("[warm-apply] Dre build failed:", err?.message || err);
    warnings.push("dre_failed");
    // Attempt to restore a reasonable status so the lead isn't stuck at AUDITED
    // with no demo. Don't block the response if this also fails.
    try {
      await updateLeadStatus(agencyLeadId, "AUDITED");
    } catch {
      /* swallow */
    }
  }

  // 4. AC writeback — %DEMOURL% to contact field 168.
  if (demoSiteUrl && input.contactId) {
    try {
      await updateContactField(
        input.contactId,
        CONTACT_FIELD_DEMOURL,
        demoSiteUrl,
      );
      console.error(
        `[warm-apply] wrote %DEMOURL% to AC contact field ${CONTACT_FIELD_DEMOURL} for contactId=${input.contactId}`,
      );
    } catch (err: any) {
      console.error(
        `[warm-apply] AC writeback failed:`,
        err?.message || err,
      );
      warnings.push("ac_writeback_failed");
    }
  } else if (!demoSiteUrl) {
    warnings.push("ac_writeback_skipped_no_demo");
  } else if (!input.contactId) {
    console.error(
      "[warm-apply] no contactId provided, skipping AC writeback (demo built but not linked to AC)",
    );
    warnings.push("ac_writeback_skipped_no_contact_id");
  }

  console.error(
    `[warm-apply] done agencyLeadId=${agencyLeadId} demoSiteUrl=${demoSiteUrl || "(missing)"} warnings=${JSON.stringify(warnings)}`,
  );

  return { agencyLeadId, demoSiteUrl, warnings };
}

// Niche-based profile inference so the qualificationProfile stamp on
// scoutData is consistent with flynerd-agency's classifier. Import
// avoided to keep this file self-contained per the sonata-stack port
// philosophy; if this drifts from lib/profile.ts, the Kris post-call
// deposit picker will disagree with warm-apply classification.
function inferQualificationProfileFromNiche(
  niche: string,
): "underserved_local" | "tech_enabled_premium" {
  const lower = niche.toLowerCase();
  const premiumKeywords = [
    "medspa",
    "med spa",
    "medispa",
    "aesthetics",
    "botox",
    "laser",
    "dermatology",
    "skincare",
    "beauty",
    "cosmetic",
    "facial",
    "solar",
    "legal",
    "law",
    "dental",
    "concierge",
  ];
  return premiumKeywords.some((k) => lower.includes(k))
    ? "tech_enabled_premium"
    : "underserved_local";
}
