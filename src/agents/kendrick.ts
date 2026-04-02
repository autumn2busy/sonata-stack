import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runKendrickAudit({ url, niche, city }: { url: string, niche: string, city: string }) {
    console.log(`[Kendrick] Launching AEO Audit on ${url}`);
    
    let browser;
    let html = '';
    
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
        
        // Timeout set to 30s max for slow sites
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        html = await page.evaluate(() => {
            // @ts-ignore
            return document.documentElement.outerHTML;
        });
    } catch (err: any) {
        throw new Error(`Puppeteer failed on ${url}: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }

    const $ = cheerio.load(html);
    
    // Core SEO/AEO Metrics Scrape
    const title = $('title').text() || 'None';
    const description = $('meta[name="description"]').attr('content') || 'None';
    const h1s = $('h1').map((_, el) => $(el).text().trim()).get();
    const wordCount = $('body').text().split(/\s+/).length || 0;
    const hasJSONLD = $('script[type="application/ld+json"]').length > 0;
    
    const auditSummary = `
      Title: ${title}
      Desc: ${description}
      H1s: ${h1s.join(' | ')}
      Approx Word Count: ${wordCount}
      LocalBusiness JSON-LD: ${hasJSONLD ? 'Yes' : 'No'}
    `;

    console.log(`[Kendrick] Scraped Data: ${auditSummary.replace(/\n /g, ' ')}`);

    // Claude Anthropic Tier 3 Generator
    const systemPrompt = `You are Kendrick, a Tier-3 Search Generative Experience (SGE) & AEO architect.
    Analyze the provided raw SEO metrics for a ${niche} business in ${city}.
    Your task is to yield an absolute strategic AEO roadmap avoiding standard SEO fluff.
    Provide exactly:
    1. A missing EEAT critique.
    2. 20 hyper-specific Long-Tail AI Prompts (what users ask Claude/ChatGPT to find this service).
    3. 6 Pillar Blog Topics tailored for geographical dominance.
    Return JSON format: { "eeatCritique": "", "aiPrompts": [20 items], "pillarTopics": [6 items] }`;

    const completion = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: `Audit Data:\n${auditSummary}` }],
    });

    const aiRaw = completion.content[0]?.type === "text" ? completion.content[0].text.trim() : "{}";
    const cleanJson = aiRaw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/i, "");
    
    let report = {};
    try {
        report = JSON.parse(cleanJson);
    } catch {
        report = { error: "Claude failed to return valid JSON", raw: cleanJson };
    }

    return {
        url,
        scrapedMetrics: {
            title,
            h1Count: h1s.length,
            hasJSONLD,
            wordCount
        },
        tier3Strategy: report
    };
}
