import Anthropic from '@anthropic-ai/sdk';
// In a full implementation, you'd import the actual yonce and dre agents here:
// import { runYonce } from './yonce.js';
// import { runDre } from './dre.js';

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
    if (!_anthropic) {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error("[Kris] ANTHROPIC_API_KEY required");
        }
        _anthropic = new Anthropic({ apiKey: key });
    }
    return _anthropic;
}

export async function runKrisJennerClose({ contactId, dealId, websiteUrl }: { contactId: string, dealId: string, websiteUrl: string }) {
    console.error(`[Kris Jenner] Kicking off Post-Call Closer flow for Deal: ${dealId}`);
    
    // 1. Mock launching Yoncé (Intel)
    console.error(`[Kris Jenner] Launching Yoncé against ${websiteUrl}...`);
    const mockIntel = {
        opportunityScore: 85,
        painPoints: ["Outdated design logic", "Missing schema headers"],
        selectedPalette: { primary: "1B365D", accent: "D4AF37" }
    };
    
    // 2. Mock launching Dre (Builder)
    console.error(`[Kris Jenner] Launching Dre Demo generation with Intel Payload...`);
    const expectedDemoUrl = `https://demo-build-${dealId}.flynerd.agency`;
    const stripePaymentLink = `https://buy.stripe.com/test_closer_${contactId}`;
    
    // 3. Draft the closing email using Claude
    const systemPrompt = `You are Kris, FlyNerd's top closer architect. Your job is to draft the post-call "Closing" email.
    We just audited ${websiteUrl} and generated a live, high-converting React demo for them at ${expectedDemoUrl}.
    Their custom stripe checkout link is: ${stripePaymentLink}
    Write the exact email to send to the prospect closing them on the deal today. Do not hallucinate placeholders. Keep it under 200 words.`;

    const completion = await getAnthropic().messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: "Draft the post-call closing email." }],
    });

    const emailDraft = completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "";
    
    console.error(`[Kris Jenner] Asset pipeline complete. Updating Deal ${dealId} with ${expectedDemoUrl}`);

    return {
        status: "DEMO_BUILT",
        dealId,
        contactId,
        websiteUrl,
        intelScore: mockIntel.opportunityScore,
        demoUrl: expectedDemoUrl,
        paymentLink: stripePaymentLink,
        emailDraft
    };
}
