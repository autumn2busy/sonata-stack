import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sonata-stack",
  version: "1.0.0",
});

// ──────────────────────────────────────────────
// 1. Simon Cowell — Scout
// ──────────────────────────────────────────────
server.tool(
  "simon_cowell",
  "Discovers local service businesses by niche and city using Google Places and Yelp. Finds businesses with no website or weak digital presence. Returns a list of leads to process. Run this to fill the top of the funnel.",
  {
    niche: z.string().describe("Business niche to search (e.g. 'plumber', 'barbershop')"),
    city: z.string().describe("City to search in (e.g. 'Atlanta, GA')"),
  },
  async ({ niche, city }) => {
    // TODO: implement Google Places + Yelp discovery
    return { content: [{ type: "text" as const, text: `Scout stub: searching ${niche} in ${city}` }] };
  }
);

// ──────────────────────────────────────────────
// 2. Yoncé — Intel
// ──────────────────────────────────────────────
server.tool(
  "yonce",
  "Analyzes a business's online reputation using their reviews and Google Places data. Returns opportunityScore (0-100), painPoints, reputationSummary, brandPalettes, and socialProofPoints. Run after Simon Cowell discovers a lead.",
  {
    businessName: z.string().describe("Name of the business to analyze"),
    placeId: z.string().describe("Google Places ID for the business"),
  },
  async ({ businessName, placeId }) => {
    // TODO: implement reputation analysis
    return { content: [{ type: "text" as const, text: `Intel stub: analyzing ${businessName} (${placeId})` }] };
  }
);

// ──────────────────────────────────────────────
// 3. Dre — Builder
// ──────────────────────────────────────────────
server.tool(
  "dre",
  "Deploys a personalized demo website for a lead using the Vercel API and generates an AI avatar walkthrough video via HeyGen. Run after Yoncé scores a lead above 50.",
  {
    leadId: z.string().describe("Internal lead ID"),
    businessName: z.string().describe("Name of the business"),
    brandPalette: z.object({
      primary: z.string(),
      secondary: z.string(),
    }).describe("Brand color palette from Yoncé analysis"),
  },
  async ({ leadId, businessName }) => {
    // TODO: implement Vercel deploy + HeyGen video
    return { content: [{ type: "text" as const, text: `Builder stub: deploying demo for ${businessName} (${leadId})` }] };
  }
);

// ──────────────────────────────────────────────
// 4. Hov — Closer
// ──────────────────────────────────────────────
server.tool(
  "hov",
  "Writes and sends a personalized 1:1 sales email as Jordan, FlyNerd's senior sales executive. Pulls from the FlyNerd knowledge base. Moves the AC deal to Negotiating. Run when a prospect replies to outreach.",
  {
    leadId: z.string().describe("Internal lead ID"),
    contactEmail: z.string().describe("Prospect email address"),
    context: z.string().describe("Context from the prospect's reply"),
  },
  async ({ leadId, contactEmail }) => {
    // TODO: implement sales email + AC deal update
    return { content: [{ type: "text" as const, text: `Closer stub: emailing ${contactEmail} for lead ${leadId}` }] };
  }
);

// ──────────────────────────────────────────────
// 5. Tiny Harris — Growth
// ──────────────────────────────────────────────
server.tool(
  "tiny_harris",
  "Monthly growth and nurture agent for active clients. Generates performance reports, checks site health, and updates ActiveCampaign. Run once per month per client.",
  {
    clientId: z.string().describe("Active client ID"),
  },
  async ({ clientId }) => {
    // TODO: implement monthly growth report + AC update
    return { content: [{ type: "text" as const, text: `Growth stub: running monthly report for client ${clientId}` }] };
  }
);

// ──────────────────────────────────────────────
// 6. Cersei — Expire
// ──────────────────────────────────────────────
server.tool(
  "cersei",
  "Enforces demo expiry. Finds all demo sites older than 7 days and enables Vercel password protection. Creates scarcity. Runs hourly via webhook. She always pays her debts.",
  {},
  async () => {
    // TODO: implement demo expiry enforcement
    return { content: [{ type: "text" as const, text: "Expire stub: checking for expired demos" }] };
  }
);

// ──────────────────────────────────────────────
// 7. Tyrion — Orchestrator
// ──────────────────────────────────────────────
server.tool(
  "tyrion",
  "Master orchestrator. Coordinates the full outbound pipeline: runs Simon Cowell to find leads, passes to Yoncé for scoring, sends qualified leads to Dre for building, then triggers outreach. The smartest agent in the room.",
  {
    niche: z.string().describe("Business niche to target"),
    city: z.string().describe("City to target"),
    minScore: z.number().default(50).describe("Minimum Yoncé score to qualify (default: 50)"),
  },
  async ({ niche, city, minScore }) => {
    // TODO: implement full pipeline orchestration
    return { content: [{ type: "text" as const, text: `Orchestrator stub: running pipeline for ${niche} in ${city} (min score: ${minScore})` }] };
  }
);

// ──────────────────────────────────────────────
// 8. Kris Jenner — Post-Call Closer Asset
// ──────────────────────────────────────────────
server.tool(
  "kris_jenner",
  "Post-strategy-call closer asset builder. Triggered by AC tag call_completed. Runs Yoncé on the prospect's actual website, builds a personalized demo via Dre, populates DEAL_DEMOSITEURL, and sends the close email. Turns the strategy call into a brand deal.",
  {
    contactId: z.string().describe("ActiveCampaign contact ID"),
    dealId: z.string().describe("ActiveCampaign deal ID"),
    websiteUrl: z.string().describe("Prospect's current website URL"),
  },
  async ({ contactId, dealId, websiteUrl }) => {
    // TODO: implement post-call closer pipeline
    return { content: [{ type: "text" as const, text: `Post-Call stub: building closer assets for deal ${dealId} (${websiteUrl})` }] };
  }
);

// ──────────────────────────────────────────────
// Webhook: POST /webhook/post-call
// Triggers kris_jenner when AC fires call_completed
// ──────────────────────────────────────────────
// Note: MCP servers use stdio transport. For webhook ingress,
// deploy a lightweight HTTP listener (e.g. Express or Hono)
// that validates WEBHOOK_SECRET and invokes kris_jenner
// internally. See src/webhook.ts (to be created).

// ──────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sonata Stack MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
