// Qualification-profile helper for sonata-stack agents.
//
// Mirrors the classifier at flynerd-agency/components/demo/nicheConfig.ts
// (MEDSPA_KEYWORDS) so Kris Jenner, Dre, and any future agent all decide
// which Profile a lead belongs to using the same rules. If the classifier
// drifts between the two repos, every cross-repo workflow (demo render,
// close-asset pricing) silently disagrees on the prospect — so keep this
// file and the flynerd-agency one in sync.
//
// Profile 1 (underserved_local): default. Cold-outreach local service
//   businesses with no website or a dead brochure. Core offer is AI
//   Website Quickstart at $1,500 ($750 deposit).
//
// Profile 2 (tech_enabled_premium): med spas, aesthetics, solar, legal,
//   and high-ticket services. Core offer is AI Website Concierge at
//   $3,500 ($1,750 deposit).

export type QualificationProfile =
  | "underserved_local"
  | "tech_enabled_premium";

// Keep in sync with flynerd-agency/components/demo/nicheConfig.ts
const MEDSPA_KEYWORDS = [
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
];

interface ProfileClassifyInput {
  niche?: string | null;
  intelData?: Record<string, unknown> | null;
}

/**
 * Classify a lead into one of the two qualification profiles.
 *
 * Precedence:
 *   1. Explicit intelData.qualificationProfile === "tech_enabled_premium"
 *   2. Niche matches a medspa keyword
 *   3. Fall back to underserved_local
 */
export function getQualificationProfile(
  lead: ProfileClassifyInput,
): QualificationProfile {
  const niche = (lead.niche ?? "").toLowerCase();
  const explicit =
    lead.intelData &&
    typeof (lead.intelData as Record<string, unknown>)
      .qualificationProfile === "string"
      ? ((lead.intelData as Record<string, unknown>)
          .qualificationProfile as string)
      : null;

  if (explicit === "tech_enabled_premium") return "tech_enabled_premium";
  if (MEDSPA_KEYWORDS.some((k) => niche.includes(k))) return "tech_enabled_premium";
  return "underserved_local";
}

/**
 * Default deposit amounts per profile, in cents. Matches the
 * AI Website Quickstart (UL) and AI Website Concierge (TP) 50% deposits
 * from the 2026-04-20 live Stripe catalog.
 */
export const PROFILE_DEPOSIT_CENTS: Record<QualificationProfile, number> = {
  underserved_local: 75_000, // $750 (50% of $1,500 UL Quickstart)
  tech_enabled_premium: 175_000, // $1,750 (50% of $3,500 TP Concierge)
};

/**
 * Human-readable product name shown on the Stripe Checkout page. Personalized
 * with the business name so the prospect sees their own brand on the sale.
 */
export function profileProductName(
  profile: QualificationProfile,
  businessName: string,
): string {
  return profile === "tech_enabled_premium"
    ? `FlyNerd AI Website Concierge - ${businessName}`
    : `FlyNerd AI Website Quickstart - ${businessName}`;
}
