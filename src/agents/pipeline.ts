import Anthropic from "@anthropic-ai/sdk";
import { buildIntelPrompt } from "../lib/prompts.js";
import { updateLeadAsAudited, updateLeadAsBuilt, insertLead, updateLeadStatus } from "../lib/db.js";
import { getCanonicalDemoUrl, triggerDeploy } from "../lib/vercel.js";
import { generateAvatarVideo, buildVideoScript } from "../lib/heygen.js";
import { classifyWebPresence, isQualifiedLead } from "../lib/qualification.js";

// We need a helper to get Anthropic since it's used by yonce
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("[pipeline] ANTHROPIC_API_KEY required");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

export async function execSimonCowell(niche: string, city: string) {
  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_PLACES_API_KEY) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const query = `${niche} in ${city}`;
  const placesRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber"
    },
    body: JSON.stringify({ textQuery: query, languageCode: "en" })
  });

  if (!placesRes.ok) throw new Error(`Google Places API Error: ${placesRes.statusText}`);

  const data = await placesRes.json() as any;
  const places = data.places || [];
  console.log(`[Simon] Starting classification for ${places.length} places`);

  const placesWithPresence = await Promise.all(
    places.map(async (p: any) => {
      try {
        const presence = await classifyWebPresence(p);
        console.log(`[Simon] ${p.displayName?.text || p.id}: ${presence.classification} (${presence.detail})`);
        return { place: p, presence };
      } catch (err: any) {
        return { place: p, presence: { classification: "NONE" as const, detail: `Classification error: ${err.message}` } };
      }
    })
  );

  const validLeads = placesWithPresence.filter(({ place, presence }) => isQualifiedLead(place, presence));
  console.log(`[Simon] Scouted ${places.length}, qualified ${validLeads.length}`);

  const savedLeads = [];
  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

  for (const { place, presence } of validLeads) {
    let enrichedEmail: string | undefined = undefined;
    if (HUNTER_API_KEY && presence.classification === "DEAD_SITE" && presence.checkedUrl) {
      try {
        const domain = new URL(presence.checkedUrl).hostname.replace(/^www\./, '');
        const hunterRes = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=1`);
        const hunterData = await hunterRes.json() as any;
        if (hunterData?.data?.emails?.length > 0) {
          enrichedEmail = hunterData.data.emails[0].value;
          console.log(`[Simon] Hunter.io enriched: ${domain} -> ${enrichedEmail}`);
        }
      } catch (err) {
        console.log(`[Simon] Hunter.io failed:`, err);
      }
    }
    
    // Insert lead
    const inserted = await insertLead({
      businessName: place.displayName?.text || place.displayName || "Unknown",
      niche,
      location: city,
      contactEmail: enrichedEmail,
      contactPhone: place.nationalPhoneNumber,
      placeId: place.id,
      scoutData: { ...place, webPresence: presence },
      status: "DISCOVERED"
    });
    savedLeads.push(inserted);
  }

  return { scoutedRaw: places.length, qualifiedAndSaved: savedLeads.length, leads: savedLeads };
}

export async function execYonce(businessName: string, placeId: string, leadId?: string) {
  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const YELP_API_KEY = process.env.YELP_API_KEY;

  if (!GOOGLE_PLACES_API_KEY && !YELP_API_KEY) throw new Error("Missing both GOOGLE_PLACES_API_KEY and YELP_API_KEY");

  let reviews: Array<{ rating: number; text: { text: string } }> = [];
  let rating = 0;
  let userRatingCount = 0;

  if (GOOGLE_PLACES_API_KEY) {
    const placesRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
      method: "GET",
      headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "reviews,rating,userRatingCount" },
    });
    if (placesRes.ok) {
      const data = await placesRes.json() as any;
      reviews = data.reviews || [];
      rating = data.rating || 0;
      userRatingCount = data.userRatingCount || 0;
    }
  } else if (YELP_API_KEY) {
    const yelpRes = await fetch(`https://api.yelp.com/v3/businesses/${placeId}/reviews`, { headers: { Authorization: `Bearer ${YELP_API_KEY}` } });
    if (yelpRes.ok) {
      const data = await yelpRes.json() as any;
      reviews = data.reviews || [];
      rating = 4.0;
    }
  }

  const reviewsText = reviews.length > 0 ? reviews.map((r: any) => `Review (${r.rating} stars): ${r.text?.text || "No text"}`).join("\n") : "No reviews available.";

  const systemPrompt = buildIntelPrompt({
    businessName,
    rating,
    reviewCount: userRatingCount || reviews.length,
    contextHint: "No official website detected.",
    reviewsText,
  });

  const completion = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: "Analyze this business and return the JSON." }],
  });

  const aiRaw = completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "{}";
  const cleanJson = aiRaw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/i, "");
  const analysis = JSON.parse(cleanJson);

  if (leadId) {
    try {
      await updateLeadAsAudited(leadId, analysis.opportunityScore || 50, {
        rating,
        reviewCount: userRatingCount || reviews.length,
        painPoints: analysis.painPoints || [],
        reputationSummary: analysis.reputationSummary || "",
      });
    } catch (dbErr: any) {
      console.error("DB update failed (non-fatal):", dbErr.message);
    }
  }

  return {
    opportunityScore: analysis.opportunityScore ?? 0,
    painPoints: analysis.painPoints ?? [],
    reputationSummary: analysis.reputationSummary ?? "",
    operatingContext: analysis.operatingContext ?? "",
    socialProofPoints: analysis.socialProofPoints ?? [],
    brandPalettes: analysis.brandPalettes ?? [],
    selectedPalette: analysis.selectedPalette ?? null,
    rating
  };
}

export async function execDre(leadId: string, businessName: string, niche: string, rating: number, intelPayload: any) {
  const payload = (intelPayload && typeof intelPayload === "object") ? intelPayload as any : {};
  const painPoints = Array.isArray(payload.painPoints) ? payload.painPoints : [];
  const socialProofPoints = Array.isArray(payload.socialProofPoints) ? payload.socialProofPoints : [];
  const brandPalettes = Array.isArray(payload.brandPalettes) ? payload.brandPalettes : [];
  const selectedPalette = payload.selectedPalette ?? brandPalettes[0] ?? null;

  const intelDataForTemplate = {
    painPoints,
    socialProofPoints,
    operatingContext: typeof payload.operatingContext === "string" ? payload.operatingContext : "",
    reputationSummary: typeof payload.reputationSummary === "string" ? payload.reputationSummary : "",
    opportunityScore: typeof payload.opportunityScore === "number" ? payload.opportunityScore : 0,
    brandPalettes,
    brandColors: {
      primary: selectedPalette?.primary ?? "1B365D",
      accent: selectedPalette?.accent ?? "D4AF37",
    },
    rating: rating,
  };

  const demoSiteUrl = getCanonicalDemoUrl(leadId);
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await updateLeadAsBuilt(leadId, { demoSiteUrl, validUntil, intelData: intelDataForTemplate });
  const deployed = await triggerDeploy();

  const videoScript = buildVideoScript({
    businessName,
    niche,
    rating,
    painPoints,
    operatingContext: typeof payload.operatingContext === "string" ? payload.operatingContext : "",
  });

  generateAvatarVideo(videoScript, businessName)
    .then(async (videoUrl) => {
      if (videoUrl) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (url && key) {
            const sb = createClient(url, key);
            await sb.from("AgencyLead").update({ walkthroughVideoUrl: videoUrl, updatedAt: new Date().toISOString() }).eq("id", leadId);
            console.log(`[Dre] Video URL saved for ${businessName}: ${videoUrl}`);
          }
        } catch (err) {
          console.error("[Dre] Failed to save video URL:", err);
        }
      }
    })
    .catch((err) => console.error("[Dre] HeyGen error (non-fatal):", err));

  return { status: "DEMO_BUILT", leadId, businessName, demoSiteUrl, validUntil, deployTriggered: deployed, videoStatus: "generating", brandColors: intelDataForTemplate.brandColors };
}

export async function execHovOutreach(leadId: string, businessName: string, contactEmail: string, niche: string, demoSiteUrl: string) {
  // Reach out to flynerd-agency backend directly
  const baseUrl = process.env.AGENCY_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/agents/outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, businessName, contactEmail, niche, demoSiteUrl })
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Outreach Agent Failed (${res.status}): ${errText}`);
  }
  return await res.json();
}
