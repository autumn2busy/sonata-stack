import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { buildIntelPrompt } from "./lib/prompts.js";
import { updateLeadAsAudited } from "./lib/db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function createServer(): McpServer {
  const server = new McpServer({
    name: "sonata-stack",
    version: "1.0.0",
  });

  // ─────────────────────────────────────────────
  // 1. Simon Cowell — Scout
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 2. Yoncé — Intel
  // ─────────────────────────────────────────────
  server.tool(
    "yonce",
    "Analyzes a business's online reputation using their reviews and Google Places data. Returns opportunityScore (0-100), painPoints, reputationSummary, brandPalettes, and socialProofPoints. Run after Simon Cowell discovers a lead.",
    {
      businessName: z.string().describe("Name of the business to analyze"),
      placeId: z.string().describe("Google Places ID for the business"),
      leadId: z.string().optional().describe("Internal lead ID for DB persistence. If omitted, analysis is returned without saving."),
    },
    async ({ businessName, placeId, leadId }) => {
      const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
      const YELP_API_KEY = process.env.YELP_API_KEY;

      if (!GOOGLE_PLACES_API_KEY && !YELP_API_KEY) {
        return {
          content: [{ type: "text" as const, text: "Error: Missing both GOOGLE_PLACES_API_KEY and YELP_API_KEY" }],
          isError: true,
        };
      }

      // ── 1. Fetch reviews ──────────────────────────
      let reviews: Array<{ rating: number; text: { text: string } }> = [];
      let rating = 0;
      let userRatingCount = 0;

      if (GOOGLE_PLACES_API_KEY) {
        const placesRes = await fetch(
          `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask": "reviews,rating,userRatingCount",
            },
          }
        );
        if (placesRes.ok) {
          const data = await placesRes.json() as any;
          reviews = data.reviews || [];
          rating = data.rating || 0;
          userRatingCount = data.userRatingCount || 0;
        }
      } else if (YELP_API_KEY) {
        const yelpRes = await fetch(
          `https://api.yelp.com/v3/businesses/${placeId}/reviews`,
          { headers: { Authorization: `Bearer ${YELP_API_KEY}` } }
        );
        if (yelpRes.ok) {
          const data = await yelpRes.json() as any;
          reviews = data.reviews || [];
          rating = 4.0;
        }
      }

      // ── 2. Prepare reviews text ───────────────────
      const reviewsText =
        reviews.length > 0
          ? reviews
              .map((r: any) => `Review (${r.rating} stars): ${r.text?.text || "No text"}`)
              .join("\n")
          : "No reviews available.";

      // ── 3. AI analysis ────────────────────────────
      const systemPrompt = buildIntelPrompt({
        businessName,
        rating,
        reviewCount: userRatingCount || reviews.length,
        contextHint: "No official website detected.",
        reviewsText,
      });

      const completion = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: "Analyze this business and return the JSON." }],
      });

      const aiRaw =
        completion.content[0]?.type === "text"
          ? completion.content[0].text.trim()
          : "{}";
      // Claude sometimes wraps JSON in ```json ... ``` fences — strip them
      const cleanJson = aiRaw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/i, "");
      const analysis = JSON.parse(cleanJson);

      // ── 4. Persist to DB (only when leadId is provided) ──
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

      // ── 5. Return full intel payload ──────────────
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              opportunityScore: analysis.opportunityScore ?? 0,
              painPoints: analysis.painPoints ?? [],
              reputationSummary: analysis.reputationSummary ?? "",
              operatingContext: analysis.operatingContext ?? "",
              socialProofPoints: analysis.socialProofPoints ?? [],
              brandPalettes: analysis.brandPalettes ?? [],
              selectedPalette: analysis.selectedPalette ?? null,
            }),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────
  // 3. Dre — Builder
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 4. Hov — Closer
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 5. Tiny Harris — Growth
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 6. Cersei — Expire
  // ─────────────────────────────────────────────
  server.tool(
    "cersei",
    "Enforces demo expiry. Finds all demo sites older than 7 days and enables Vercel password protection. Creates scarcity. Runs hourly via webhook. She always pays her debts.",
    {},
    async () => {
      // TODO: implement demo expiry enforcement
      return { content: [{ type: "text" as const, text: "Expire stub: checking for expired demos" }] };
    }
  );

  // ─────────────────────────────────────────────
  // 7. Tyrion — Orchestrator
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 8. Kris Jenner — Post-Call Closer Asset
  // ─────────────────────────────────────────────
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

  return server;
}

// ─────────────────────────────────────────────
// Webhook: POST /webhook/post-call
// Triggers kris_jenner when AC fires call_completed
// ─────────────────────────────────────────────
// Note: MCP servers use stdio transport. For webhook ingress,
// deploy a lightweight HTTP listener (e.g. Express or Hono)
// that validates WEBHOOK_SECRET and invokes kris_jenner
// internally. See src/webhook.ts (to be created).

// ─────────────────────────────────────────────
// Start — Express + Streamable HTTP
// ─────────────────────────────────────────────
const ROSTER = [
  "simon_cowell", "yonce", "dre", "hov",
  "tiny_harris", "cersei", "tyrion", "kris_jenner",
] as const;

const app = express();
// NOTE: Do NOT use express.json() globally — StreamableHTTPServerTransport
// reads the raw request body itself. A global body parser consumes the stream
// before the transport can read it, causing "Parse error: Invalid JSON".

// CORS — allow Claude.ai and other MCP clients to connect cross-origin
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  next();
});

// Preflight for any route. Express 5 rejects bare "*" route patterns.
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "sonata-stack", roster: [...ROSTER] });
});

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session — forward the request
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res);
    return;
  }

  // New session — create transport, wire it up
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
  if (transport.sessionId) {
    transports.set(transport.sessionId, transport);
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Sonata Stack MCP server listening on port ${PORT}`);
});