// Claude-generated demo page copy — Sonata Stack
//
// Turns raw apply-form data (businessName, niche, pain point, services,
// website URL) into polished, business-specific copy that gets stored
// in AgencyLead.intelData and rendered on the /demo/[leadId] page.
//
// Called by execDre in pipeline.ts once per lead, cached in intelData.
// Downstream consumers (demo page, SitePreview, MedspaExperience) read
// the cached fields with literal-substitution fallbacks.

import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

export interface DemoCopyServiceCard {
  title: string;
  desc: string;
}

export interface DemoCopy {
  heroHook: string;
  heroSubline: string;
  noticedLine: string;
  tagline: string;
  serviceCards: DemoCopyServiceCard[];
}

export async function generateDemoCopy(params: {
  businessName: string;
  niche: string;
  scoutServices?: string;
  painPoint?: string;
  websiteUrl?: string;
}): Promise<DemoCopy> {
  const { businessName, niche, scoutServices, painPoint, websiteUrl } = params;

  const prompt = `You are a senior copywriter for a premium AI web agency. Generate demo page copy for this prospect. The copy will appear on a personalized demo page they receive after applying.

Business: ${businessName}
Industry: ${niche}
${websiteUrl ? `Existing website: ${websiteUrl}` : ""}
${painPoint ? `Their pain point (their own words): ${painPoint}` : ""}
${scoutServices ? `Services they listed (their own words): ${scoutServices}` : ""}

Generate JSON with these exact fields:
- heroHook: Bold hero headline, max 80 chars. Rephrase their pain point as a conversion-focused opportunity. Proper grammar, capitalization, and spelling. Should feel like a senior consultant talking.
- heroSubline: One sentence, max 140 chars, that sets up what the prospect will see on this demo page. References their actual business situation.
- noticedLine: One sentence, max 160 chars, that summarizes what we noticed about their business. Polished rephrase of their pain point, not a verbatim echo.
- tagline: One-line tagline, max 100 chars, for their SIMULATED new website hero. This is what THEIR customers would see on THEIR new site. Not about FlyNerd. Not about pain points. Written from the business's voice, not ours.
- serviceCards: Exactly 3 objects with {title, desc}. Title is 2-4 words. Desc is one sentence, max 140 chars, about a real service the business offers. Base these on their actual services list, not generic niche templates. Reflect a real understanding of what this business does.

Rules:
- NO em dashes or en dashes anywhere
- NO filler phrases like "Transform your business", "Let us help you", "Elevate your brand"
- Specific to this actual business, not interchangeable niche copy
- Conversational, direct, founder-to-founder tone
- Proper grammar and capitalization throughout

Output ONLY valid JSON. No markdown fences. No preamble. No explanation after the JSON.`;

  const response = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("demoCopy: non-text response from Claude");
  }

  const cleaned = content.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`demoCopy: JSON parse failed — ${(err as Error).message}`);
  }

  const p = parsed as Partial<DemoCopy>;
  if (
    typeof p.heroHook !== "string" ||
    typeof p.heroSubline !== "string" ||
    typeof p.noticedLine !== "string" ||
    typeof p.tagline !== "string" ||
    !Array.isArray(p.serviceCards) ||
    p.serviceCards.length !== 3 ||
    !p.serviceCards.every(
      (c) =>
        c &&
        typeof (c as DemoCopyServiceCard).title === "string" &&
        typeof (c as DemoCopyServiceCard).desc === "string",
    )
  ) {
    throw new Error("demoCopy: invalid shape in response");
  }

  return {
    heroHook: p.heroHook,
    heroSubline: p.heroSubline,
    noticedLine: p.noticedLine,
    tagline: p.tagline,
    serviceCards: p.serviceCards as DemoCopyServiceCard[],
  };
}
