import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function runTinyHarrisReport() {
    console.log(`[Tiny Harris] Initializing monthly growth and nurture sweep.`);
    
    // In realistic production this fetches from the Client table:
    // const { data: clients } = await supabase.from('Client').select('*').eq('status', 'ACTIVE');
    // Using a mocked structure matching FlyNerd's schema expectation
    const mockClients = [
        { id: 'client_raid', businessName: 'RAID Security Corp', niche: 'Security', acContactId: '123' },
    ];
    
    const reports = [];

    for (const client of mockClients) {
        console.log(`[Tiny Harris] Generating report for ${client.businessName}...`);
        
        const systemPrompt = `You are Tiny Harris, a diligent growth manager. 
        Write a concise, encouraging Monthly Operations & SEO Markdown Report for the client "${client.businessName}" (${client.niche}).
        Include 3 bullet points on 'Wins' and 2 bullet points on 'Next Month's Focus'.`;
        
        const completion = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 800,
            system: systemPrompt,
            messages: [{ role: "user", content: "Generate the markdown report." }],
        });

        const markdownDraft = completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "";
        
        // Mock AC update
        console.log(`[Tiny Harris] Updating ActiveCampaign for contact ${client.acContactId} with latest report trigger.`);

        reports.push({
            clientId: client.id,
            businessName: client.businessName,
            reportLength: markdownDraft.length,
            markdownDraft
        });
    }

    return {
        timestamp: new Date().toISOString(),
        clientsProcessed: reports.length,
        reports
    };
}
