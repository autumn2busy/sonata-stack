// ActiveCampaign IDs and constants for the FlyNerd outreach pipeline.
// Source of truth for AC field/list/pipeline/stage references.
// Update here when AC schema changes; do not hardcode in agent code.

// Contact custom fields
export const AC_CONTACT_FIELD_AGENCY_LEAD_ID = "165";
export const AC_CONTACT_FIELD_QUALIFICATION_PROFILE = "164";
export const AC_CONTACT_FIELD_NICHE = "167";
export const AC_CONTACT_FIELD_DEMO_URL = "168";

// Deal custom fields
export const AC_DEAL_FIELD_WALKTHROUGH_VIDEO_URL = "17";
export const AC_DEAL_FIELD_BUSINESS_NAME = "21";
export const AC_DEAL_FIELD_INTEL_SCORE = "19";
export const AC_DEAL_FIELD_PAIN_POINTS = "20";

// List membership
export const AC_LIST_COLD_OUTREACH = 29;

// Deal pipeline + stage
export const AC_PIPELINE_OUTREACH = 3;
export const AC_STAGE_OUTREACH_QUEUED = 11;

// Deal value in cents ($2,500.00). Current value ports verbatim from agency route.
export const AC_DEAL_VALUE_OUTREACH = 250000;

// Tag names (applied in order during cold outreach)
export const AC_TAG_COLD_OUTREACH = "COLD_OUTREACH";
export const AC_TAG_FLYNERD_OUTREACH_PENDING = "FLYNERD_OUTREACH_PENDING";
