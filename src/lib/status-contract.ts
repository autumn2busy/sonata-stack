// Canonical status sets. Source of truth for status validation in code.
// Database column type is currently String (no Prisma enum). These constants
// provide TypeScript-level enforcement and are scanned by the status-contract
// script that runs as part of npm run build.

export const AGENCY_LEAD_STATUSES = [
  "PROSPECT",
  "DISCOVERED",
  "AUDITED",
  "DEMO_BUILT",
  "OUTREACH_SENT",
  "REPLIED",
  "CALL_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "OUTREACH_EXHAUSTED",
  "DEMO_EXPIRED",
  "INBOUND_NEW",
  "CLIENT_ACTIVE",
] as const;

export type AgencyLeadStatus = typeof AGENCY_LEAD_STATUSES[number];

export const CLIENT_STATUSES = [
  "ONBOARDING",
  "MIGRATING",
  "ACTIVE",
  "PAUSED",
  "CHURNED",
] as const;

export type ClientStatus = typeof CLIENT_STATUSES[number];

// Forbidden literals that have appeared in old code. Used by the
// status-contract scanner to flag regressions.
export const FORBIDDEN_AGENCY_LEAD_STATUSES = [
  "BUILT",         // legacy, replaced by DEMO_BUILT
  "EXPIRED",       // legacy, replaced by DEMO_EXPIRED
  "ACTIVE",        // legacy, replaced by CLIENT_ACTIVE on AgencyLead
  "PITCHED",
  "OUTREACHED",
  "NEGOTIATING",
  "WON",
  "LOST",
] as const;

export const FORBIDDEN_CLIENT_STATUSES = [
  "CLIENT_ACTIVE", // legacy, this is an AgencyLead status not a Client status
] as const;
