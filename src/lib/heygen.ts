// HeyGen API client — Sonata Stack
// Generates personalized AI avatar walkthrough videos.

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

function getApiKey(): string {
    const key = process.env.HEYGEN_API_KEY;
    if (!key) throw new Error("HEYGEN_API_KEY is required");
    return key;
}

export async function generateAvatarVideo(
    scriptText: string,
    businessName: string
): Promise<string> {
    const apiKey = getApiKey();
    const avatarId = process.env.HEYGEN_AVATAR_ID || "Abigail_expressive_2024112501";
    const voiceId = process.env.HEYGEN_VOICE_ID || "f38a635bee7a4d1f9b0a654a31d050d2";

    console.error(`[HeyGen] Submitting video for ${businessName}...`);

    const submitRes = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            video_inputs: [
                {
                    character: {
                        type: "avatar",
                        avatar_id: avatarId,
                        avatar_style: "normal",
                    },
                    voice: {
                        type: "text",
                        input_text: scriptText,
                        voice_id: voiceId,
                    },
                },
            ],
            aspect_ratio: "16:9",
            title: `FlyNerd Demo — ${businessName}`,
        }),
    });

    const submitData = (await submitRes.json()) as any;

    if (!submitRes.ok) {
        console.error("[HeyGen] Submit failed:", submitData);
        return "";
    }

    const videoId = submitData.data?.video_id;
    if (!videoId) {
        console.warn("[HeyGen] No video_id in response:", submitData);
        return "";
    }

    console.error(`[HeyGen] Video queued: ${videoId}. Polling...`);

    // Poll for completion (max 10 minutes)
    let status = "processing";
    let attempts = 0;
    let videoUrl = "";
    const maxAttempts = 20;

    while (
        (status === "processing" || status === "waiting" || status === "pending") &&
        attempts < maxAttempts
    ) {
        await new Promise((r) => setTimeout(r, 30000)); // 30s between polls
        attempts++;

        try {
            const statusRes = await fetch(
                `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
                { headers: { "X-Api-Key": apiKey } }
            );

            const contentType = statusRes.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                console.warn(`[HeyGen] Non-JSON response (${statusRes.status})`);
                continue;
            }

            const statusData = (await statusRes.json()) as any;
            if (!statusRes.ok) {
                console.warn("[HeyGen] Poll failed:", statusData);
                continue;
            }

            status = String(statusData?.data?.status || "processing").toLowerCase();
            videoUrl =
                statusData?.data?.video_url ||
                statusData?.data?.url ||
                statusData?.data?.share_url ||
                videoUrl;

            console.error(`[HeyGen] Poll ${attempts}/${maxAttempts}: ${status}`);
        } catch (err) {
            console.warn("[HeyGen] Poll error:", err);
        }
    }

    if (status === "completed" && videoUrl) {
        console.error("[HeyGen] Video completed!");
        return videoUrl;
    }

    // Return a share link as fallback
    return videoUrl || `https://app.heygen.com/share/${videoId}`;
}

/**
 * Generates a personalized video script from intel or warm-apply data,
 * then rewrites it through Claude Haiku for a natural conversational tone.
 */
export async function buildVideoScript(params: {
    businessName: string;
    niche: string;
    rating: number;
    painPoints: string[];
    operatingContext: string;
    isWarmLead?: boolean;
    scoutServices?: string;
}): Promise<string> {
    const { businessName, niche, rating, painPoints, operatingContext, isWarmLead, scoutServices } = params;

    let rawScript: string;

    if (isWarmLead) {
        const painLine = painPoints.length > 0
            ? `You mentioned ${painPoints[0].toLowerCase()} is costing you revenue right now — we built this demo specifically around solving that.`
            : `We built this demo around the challenges you described in your application.`;

        const servicesLine = scoutServices
            ? `Based on your services — ${scoutServices.split(/[,\n]/)[0].trim()} and more — here's what your new site would look like.`
            : `Based on what you shared about your business, here's what your new site would look like.`;

        rawScript = [
            `Hey ${businessName}, I saw your application come through and I wanted to personally walk you through what we put together for you.`,
            painLine,
            servicesLine,
            `Scroll down to see a preview of what your new site could look like. If you're ready to move forward, click the button below to lock in your build slot.`,
        ].join(" ");
    } else {
        const ratingLine =
            rating >= 4.5
                ? `your ${rating}-star rating is impressive`
                : rating >= 4.0
                    ? `your ${rating}-star rating shows solid customer satisfaction`
                    : `your reviews show real potential`;

        const painLine =
            painPoints.length > 0
                ? `We noticed a few gaps — like ${painPoints[0].toLowerCase()} — that a professional website would solve immediately.`
                : "We noticed some opportunities where a professional website could make a real difference.";

        const contextLine = operatingContext
            ? `Based on your reviews, ${operatingContext.charAt(0).toLowerCase()}${operatingContext.slice(1)}`
            : `As a ${niche} business, your customers are searching online before they call.`;

        rawScript = [
            `Hey ${businessName}, I wanted to reach out because ${ratingLine} — but right now, customers searching for ${niche} services in your area can't find your website.`,
            contextLine,
            painLine,
            `So I put together this demo using your actual brand colors and real customer reviews. Everything you see was built from your real data, not a template.`,
            `Scroll down to see a preview of what your new site could look like. If you like what you see, there's a button to book a quick call and we can have the full version live in 7 days.`,
        ].join(" ");
    }

    try {
        const response = await getAnthropic().messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 300,
            messages: [
                {
                    role: "user",
                    content: `Rewrite this sales video script to sound like a genuine, friendly founder talking one-on-one — not a marketing robot.\n\nRules:\n- Keep all factual claims exactly as written\n- Remove any formal or stiff phrasing\n- Keep it under 120 words\n- No filler phrases like "I'm excited to" or "I'd love to"\n- Natural sentence rhythm, like you're actually talking\n- Do not add any intro or explanation, output only the rewritten script\n\nScript:\n${rawScript}`,
                },
            ],
        });
        const content = response.content[0];
        if (content.type === "text" && content.text.trim()) {
            return content.text.trim();
        }
    } catch (err) {
        console.error("[HeyGen] Claude tone pass failed, using raw script:", err);
    }

    return rawScript;
}
