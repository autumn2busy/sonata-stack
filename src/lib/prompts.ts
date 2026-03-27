// ─────────────────────────────────────────────────────────────────────────────
// Prompt Registry — Sonata Stack
//
// All LLM prompts live here as versioned, parameterized functions.
// Version format: MAJOR.MINOR.PATCH
// ─────────────────────────────────────────────────────────────────────────────

// ── Intel Agent Prompt ───────────────────────────────────────────────────────
export const INTEL_PROMPT_VERSION = "2.1.0";

export function buildIntelPrompt({
  businessName,
  rating,
  reviewCount,
  contextHint,
  reviewsText,
}: {
  businessName: string;
  rating: number;
  reviewCount: number;
  contextHint: string;
  reviewsText: string;
}): string {
  return `
You are a brand strategist and conversion analyst. Analyze the following Yelp data for "${businessName}" (${rating} stars, ${reviewCount} total reviews).
Business context: ${contextHint}
This business currently has NO official website.

Return ONLY a valid JSON object with these exact fields — no markdown, no preamble:

{
  "opportunityScore": <integer 0-100>,
  "painPoints": [<up to 3 short strings — key customer complaints a professional website would solve>],
  "reputationSummary": "<1 sentence summary of their online reputation>",
  "operatingContext": "<1-2 sentences describing the specific services they are known for, inferred from categories and reviews>",
  "socialProofPoints": [
    "<most compelling review excerpt, under 20 words>",
    "<second best excerpt, under 20 words>",
    "<third best excerpt, under 20 words>"
  ],
  "brandPalettes": [
    {
      "name": "<descriptive palette name>",
      "primary": "<6-digit hex>",
      "accent": "<6-digit hex>",
      "rationale": "<1 sentence why this fits the brand>"
    },
    {
      "name": "<descriptive palette name>",
      "primary": "<6-digit hex>",
      "accent": "<6-digit hex>",
      "rationale": "<1 sentence why this fits the brand>"
    },
    {
      "name": "<descriptive palette name>",
      "primary": "<6-digit hex>",
      "accent": "<6-digit hex>",
      "rationale": "<1 sentence why this fits the brand>"
    }
  ],
  "selectedPalette": {
    "name": "<name of the best palette from the 3 above>",
    "primary": "<6-digit hex>",
    "accent": "<6-digit hex>",
    "rationale": "<why this is the overall best fit>"
  }
}

Palette rules:
- Use the business niche/categories, city, price range, review tone, and business name to inform palette choices
- No pure black (#000000) or pure white (#ffffff) as primary or accent
- All 3 palettes must be meaningfully distinct from each other
- For socialProofPoints: if reviews are truncated, use the best available wording. If fewer than 3 reviews exist, only include what is available.

Yelp Reviews:
${reviewsText}
`.trim();
}
