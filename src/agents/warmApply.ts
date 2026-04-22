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
 * Result of the synchronous first phase. Returned to flynerd-agency
 * in the webhook's 202 body so flynerd-agency can write the
 * agency_lead_id to AC contact field 165 before applying the
 * DEMO_QUALIFIED tag. n8n's tag-sync workflow needs both to resolve.
 */
export interface EnsureWarmLeadResult {
  agencyLeadId: string;
  businessName: string;
  niche: string;
}

/**
 * Phase 1 — synchronous Supabase insert. Fast (~200-500ms).
 *
 * Called by /webhooks/warm-apply BEFORE returning 202 so flynerd-agency
 * has the agencyLeadId in hand before it applies the DEMO_QUALIFIED tag.
 * This closes the race where n8n's tag-sync workflow would fire, look
 * up the Supabase row by agency_lead_id, not find it (because insert
 * hadn't landed yet), and fall back to the orphan list.
 */
export async function ensureWarmLead(
  input: WarmApplyInput,
): Promise<EnsureWarmLeadResult> {
  console.error(
    `[warm-apply] ensure start email=${input.email} businessName="${input.businessName}"`,
  );

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

  console.error(
    `[warm-apply] ensure done agencyLeadId=${lead.id} email=${input.email}`,
  );

  return {
    agencyLeadId: lead.id,
    businessName: lead.businessName,
    niche: lead.niche,
  };
}

/**
 * Phase 2 — async Dre build + AC field 168 writeback. Slow (30-90s).
 *
 * Called in setImmediate after the webhook returns 202. Assumes the
 * AgencyLead row was created by ensureWarmLead. Populates intelData
 * via updateLeadAsAudited, fires Dre, writes the resulting demo URL
 * back to AC so the pre-call email template's %DEMOURL% button
 * resolves.
 */
export async function continueWarmApplyBuild(
  agencyLeadId: string,
  input: WarmApplyInput,
): Promise<WarmApplyResult> {
  const warnings: string[] = [];

  console.error(
    `[warm-apply] build start agencyLeadId=${agencyLeadId} url=${input.websiteUrl}`,
  );

  const intelData = {
    rating: 0,
    reviewCount: 0,
    painPoints: [input.painPoint],
    socialProofPoints: [] as string[],
    reputationSummary: `${input.businessName} offers ${input.services}. Target: ${input.niche}.`,
    operatingContext: `Inquiry volume: ${input.leadVolume}. Launch timeline: ${input.timeline}.${input.tools ? ` Current stack: ${input.tools}.` : ""}`,
    opportunityScore: 50,
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

  let demoSiteUrl = "";
  try {
    const dreResult = await execDre(
      agencyLeadId,
      input.businessName,
      input.niche,
      0,
      intelData,
    );
    demoSiteUrl = dreResult.demoSiteUrl;
    console.error(
      `[warm-apply] Dre built demo for leadId=${agencyLeadId} url=${demoSiteUrl}`,
    );
  } catch (err: any) {
    console.error("[warm-apply] Dre build failed:", err?.message || err);
    warnings.push("dre_failed");
    try {
      await updateLeadStatus(agencyLeadId, "AUDITED");
    } catch {
      /* swallow */
    }
  }

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
      console.error("[warm-apply] AC writeback failed:", err?.message || err);
      warnings.push("ac_writeback_failed");
    }
  } else if (!demoSiteUrl) {
    warnings.push("ac_writeback_skipped_no_demo");
  } else if (!input.contactId) {
    warnings.push("ac_writeback_skipped_no_contact_id");
  }

  console.error(
    `[warm-apply] build done agencyLeadId=${agencyLeadId} demoSiteUrl=${demoSiteUrl || "(missing)"} warnings=${JSON.stringify(warnings)}`,
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
