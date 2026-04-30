import {
  addTagToContact,
  createDeal,
  normalizeNiche,
  subscribeContactToList,
  updateContactField,
  updateDealField,
  upsertContact,
} from "../lib/ac.js";
import {
  appendOutreachAttempt,
  getLeadById,
  updateLeadStatus,
} from "../lib/db.js";
import {
  AC_CONTACT_FIELD_AGENCY_LEAD_ID,
  AC_CONTACT_FIELD_DEMO_URL,
  AC_CONTACT_FIELD_NICHE,
  AC_CONTACT_FIELD_QUALIFICATION_PROFILE,
  AC_DEAL_FIELD_BUSINESS_NAME,
  AC_DEAL_FIELD_INTEL_SCORE,
  AC_DEAL_FIELD_PAIN_POINTS,
  AC_DEAL_FIELD_WALKTHROUGH_VIDEO_URL,
  AC_DEAL_VALUE_OUTREACH,
  AC_LIST_COLD_OUTREACH,
  AC_PIPELINE_OUTREACH,
  AC_STAGE_OUTREACH_QUEUED,
  AC_TAG_COLD_OUTREACH,
  AC_TAG_FLYNERD_OUTREACH_PENDING,
} from "../lib/ac-constants.js";
import { getQualificationProfile } from "../lib/profile.js";

export interface RunColdOutreachInput {
  leadId: string;
  businessName: string;
  demoSiteUrl: string;
  contactEmail?: string;
  walkthroughVideoUrl?: string;
  niche?: string;
}

export interface RunColdOutreachResult {
  message: string;
  contactId?: string;
  dealId?: string;
  lead?: unknown;
  skipped?: boolean;
}

export async function runColdOutreach(
  input: RunColdOutreachInput,
): Promise<RunColdOutreachResult> {
  const { leadId, businessName, contactEmail, demoSiteUrl, niche } = input;

  if (!leadId || !businessName || !demoSiteUrl) {
    throw new Error("Missing required fields: leadId, businessName, demoSiteUrl");
  }

  if (!contactEmail) {
    console.error(`[outreach] No email for ${businessName}. Skipping.`);
    await updateLeadStatus(leadId, "OUTREACH_SENT");
    return {
      message: "No email, marked as pitched.",
      skipped: true,
    };
  }

  const lead = await getLeadById(leadId);
  const walkthroughVideoUrl =
    input.walkthroughVideoUrl ||
    (typeof lead?.walkthroughVideoUrl === "string"
      ? lead.walkthroughVideoUrl
      : undefined);

  if (!walkthroughVideoUrl) {
    console.warn(
      `[outreach] No walkthroughVideoUrl available for lead ${leadId} at outreach time. ` +
        `HeyGen async generation may not have completed yet. AC deal field ${AC_DEAL_FIELD_WALKTHROUGH_VIDEO_URL} will be empty.`,
    );
  }

  const contactRes = await upsertContact(
    contactEmail,
    businessName,
    "Business",
    typeof lead?.contactPhone === "string" ? lead.contactPhone : undefined,
  );
  const contactId = contactRes.contact?.id;

  console.error(
    `[outreach] Contact sync result:`,
    JSON.stringify(contactRes, null, 2),
  );

  if (!contactId) {
    throw new Error(
      `Failed to sync contact to ActiveCampaign: ${JSON.stringify(contactRes)}`,
    );
  }

  const normalizedNicheForContact = normalizeNiche(
    niche || (typeof lead?.niche === "string" ? lead.niche : ""),
  );
  const intelDataForProfile =
    lead?.intelData && typeof lead.intelData === "object"
      ? (lead.intelData as Record<string, unknown>)
      : {};
  const qualificationProfile = getQualificationProfile({
    niche: typeof lead?.niche === "string" ? lead.niche : (niche || ""),
    intelData: intelDataForProfile,
  });
  console.error(
    `[outreach] Qualification profile resolved: ${qualificationProfile} for leadId=${leadId}`,
  );
  console.error(
    `[outreach] Writing contact fields. contactId=${contactId} agencyLeadId=${leadId} niche=${normalizedNicheForContact} demoUrl=${demoSiteUrl}`,
  );
  await Promise.all([
    updateContactField(contactId, AC_CONTACT_FIELD_AGENCY_LEAD_ID, leadId),
    updateContactField(
      contactId,
      AC_CONTACT_FIELD_QUALIFICATION_PROFILE,
      qualificationProfile,
    ),
    normalizedNicheForContact
      ? updateContactField(
          contactId,
          AC_CONTACT_FIELD_NICHE,
          normalizedNicheForContact,
        )
      : Promise.resolve(),
    demoSiteUrl
      ? updateContactField(contactId, AC_CONTACT_FIELD_DEMO_URL, demoSiteUrl)
      : Promise.resolve(),
  ]);

  const subRes = await subscribeContactToList(contactId, AC_LIST_COLD_OUTREACH);
  console.error(
    `[outreach] Subscription result for list ${AC_LIST_COLD_OUTREACH}:`,
    JSON.stringify(subRes, null, 2),
  );

  const dealTitle = `AI Web Demo - ${businessName}`;
  console.error(
    `[outreach] Attempting to create deal in Pipeline ${AC_PIPELINE_OUTREACH}, Stage ${AC_STAGE_OUTREACH_QUEUED}...`,
  );
  const dealRes = await createDeal(
    contactId,
    dealTitle,
    AC_DEAL_VALUE_OUTREACH,
    AC_PIPELINE_OUTREACH,
    AC_STAGE_OUTREACH_QUEUED,
  );

  if (dealRes.error) {
    throw new Error(`ActiveCampaign Deal Creation Failed: ${dealRes.error}`);
  }

  const dealId = dealRes.deal?.id;
  console.error(`[outreach] Created deal ID: ${dealId}`);

  if (!dealId) {
    throw new Error(
      `ActiveCampaign did not return a deal ID: ${JSON.stringify(dealRes)}`,
    );
  }

  console.error(
    `[outreach] Updating deal-scoped custom fields for Deal ${dealId}...`,
  );
  if (walkthroughVideoUrl) {
    await updateDealField(
      dealId,
      AC_DEAL_FIELD_WALKTHROUGH_VIDEO_URL,
      walkthroughVideoUrl,
    );
  }

  await updateDealField(dealId, AC_DEAL_FIELD_BUSINESS_NAME, businessName);

  if (lead?.intelScore !== null && lead?.intelScore !== undefined) {
    await updateDealField(
      dealId,
      AC_DEAL_FIELD_INTEL_SCORE,
      String(lead.intelScore),
    );
  }

  const painPoints = (lead?.intelData as any)?.painPoints;
  const painPointsStr =
    Array.isArray(painPoints) && painPoints.length > 0
      ? painPoints.join(", ")
      : "attracting high-quality and consistent clients online";
  await updateDealField(dealId, AC_DEAL_FIELD_PAIN_POINTS, painPointsStr);

  await addTagToContact(contactId, AC_TAG_COLD_OUTREACH);
  await addTagToContact(contactId, AC_TAG_FLYNERD_OUTREACH_PENDING);

  await updateLeadStatus(leadId, "OUTREACH_SENT");
  await appendOutreachAttempt(leadId, {
    contactId,
    dealId,
    walkthroughVideoUrl,
  });
  const updatedLead = await getLeadById(leadId);

  return {
    message: "Lead pushed to ActiveCampaign for outreach automation.",
    contactId,
    dealId,
    lead: updatedLead,
  };
}
