import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { buildIntelPrompt } from "./lib/prompts.js";
import { updateLeadAsAudited, updateLeadAsBuilt, getLeadById, insertLead, getExpiredLeads, updateLeadStatus } from "./lib/db.js";
import { getCanonicalDemoUrl, triggerDeploy, passwordProtectDeployment } from "./lib/vercel.js";
import { generateAvatarVideo, buildVideoScript } from "./lib/heygen.js";
import { classifyWebPresence, isQualifiedLead } from "./lib/qualification.js";
import { runKendrickAudit } from "./agents/kendrick.js";
import { runTinyHarrisReport } from "./agents/tiny.js";
import { runKrisJennerClose } from "./agents/kris.js";
import { execSimonCowell, execYonce, execDre, execHovOutreach } from "./agents/pipeline.js";

let _anthropic: Anthropic | null = null;

type TyrionJobStatus = "running" | "completed" | "failed";

type TyrionJob = {
  jobId: string;
  status: TyrionJobStatus;
  createdAt: string;
  updatedAt: string;
  city: string;
  niche: string;
  minScore: number;
  summary?: {
    city: string;
    niche: string;
    totalScouted: number;
    qualified: number;
    built: number;
    outreached: number;
    needsManualOutreach: number;
    errors: string[];
  };
  error?: string;
};

const tyrionJobs = new Map<string, TyrionJob>();

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("[index] ANTHROPIC_API_KEY required");
    }
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

async function runTyrionJob(jobId: string, niche: string, city: string, minScore: number) {
  try {
    console.error(`[Tyrion] Starting job ${jobId} for ${niche} in ${city}...`);
    const { leads, scoutedRaw, qualifiedAndSaved } = await execSimonCowell(niche, city);

    let built = 0;
    let outreached = 0;
    let needsManualOutreach = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      leads.map(async (lead: any) => {
        try {
          const yonceOut = await execYonce(lead.businessName, lead.placeId, lead.id);

          if (yonceOut.opportunityScore >= minScore) {
            const dreOut = await execDre(lead.id, lead.businessName, niche, yonceOut.rating, yonceOut);
            built++;

            if (lead.contactEmail) {
              await execHovOutreach(lead.id, lead.businessName, lead.contactEmail, niche, dreOut.demoSiteUrl);
              outreached++;
            } else {
              needsManualOutreach++;
            }
          }
        } catch (err: any) {
          console.error(`[Tyrion] lead failed: ${lead.businessName} — ${err.message}`);
          errors.push(`${lead.businessName}: ${err.message}`);
        }
      })
    );

    const summary = { city, niche, totalScouted: scoutedRaw, qualified: qualifiedAndSaved, built, outreached, needsManualOutreach, errors };
    tyrionJobs.set(jobId, {
      ...(tyrionJobs.get(jobId) as TyrionJob),
      status: "completed",
      updatedAt: new Date().toISOString(),
      summary,
    });
    console.error(`[Tyrion] Job ${jobId} complete:`, summary);
  } catch (err: any) {
    console.error(`[Tyrion] Job ${jobId} fatal error:`, err);
    tyrionJobs.set(jobId, {
      ...(tyrionJobs.get(jobId) as TyrionJob),
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: err.message,
    });
  }
}

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
      try {
        const result = await execSimonCowell(niche, city);
        return {
           content: [{ type: "text" as const, text: JSON.stringify(result) }]
        };
      } catch (err: any) {
        return {
           content: [{ type: "text" as const, text: `Simon error: ${err.message}` }],
           isError: true,
        };
      }
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
      try {
        const result = await execYonce(businessName, placeId, leadId);
        return {
           content: [{ type: "text" as const, text: JSON.stringify(result) }]
        };
      } catch (err: any) {
        return {
           content: [{ type: "text" as const, text: `Yoncé error: ${err.message}` }],
           isError: true,
        };
      }
    }
  );

  // ─────────────────────────────────────────────
  // 3. Dre — Builder
  // ─────────────────────────────────────────────
  server.tool(
    "dre",
    "Deploys a personalized demo website for a lead using the Vercel API and generates an AI avatar walkthrough video via HeyGen. Run after Yoncé scores a lead above 50.",
    {
      leadId: z.string().describe("Internal lead ID (must exist in Supabase)"),
      businessName: z.string().describe("Name of the business"),
      niche: z.string().describe("Business niche (e.g. 'plumber', 'barbershop')"),
      rating: z.any().optional().describe("Google/Yelp star rating"),
      intelPayload: z.any().describe("Full yonce output payload"),
    },
    async ({ leadId, businessName, niche, rating, intelPayload }) => {
      try {
        const result = await execDre(leadId, businessName, niche, rating || 0, intelPayload);
        return {
           content: [{ type: "text" as const, text: JSON.stringify(result) }]
        };
      } catch (err: any) {
        console.error("[Dre] Unhandled error:", err);
        return {
           content: [{ type: "text" as const, text: `Dre error: ${err.message}` }],
           isError: true,
        };
      }
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
    async ({ leadId, contactEmail, context }) => {
      // 1. Draft the personalized email response
      const completion = await getAnthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: "You are Jordan, FlyNerd's senior sales executive. Write a short, persuasive 1:1 email response addressing the prospect's reply. End with a strong CTA to book a strategy call.",
        messages: [{ role: "user", content: `Context from prospect reply: ${context}` }],
      });

      const emailBody = completion.content[0]?.type === "text" ? completion.content[0].text : "";

      // 2. Update DB status directly to map against Pipeline Stage 12 'Negotiating'
      await updateLeadStatus(leadId, "REPLIED");

      return { 
        content: [{ 
          type: "text" as const, 
          text: JSON.stringify({
            status: "REPLIED",
            emailDraft: emailBody,
            msg: `Closer: Drafted email for ${contactEmail} and bumped DB lead ${leadId} to REPLIED.`
          })
        }] 
      };
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
      try {
        const reportResult = await runTinyHarrisReport();
        return { 
          content: [{ 
            type: "text" as const, 
            text: JSON.stringify(reportResult) 
          }] 
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Tiny Harris Error: ${err.message}` }], isError: true };
      }
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
      try {
        const expired = await getExpiredLeads();
        if (expired.length === 0) {
          return { content: [{ type: "text" as const, text: "Cersei checked: No expired demos found." }] };
        }

        // Apply Vercel password protection restricting all demo sub-routes until payment is mapped
        const lockRes = await passwordProtectDeployment("pay_flynerd_2026");

        for (const lead of expired) {
          await updateLeadStatus(lead.id, "EXPIRED");
        }

        return { 
          content: [{ 
            type: "text" as const, 
            text: JSON.stringify({
              action: "LOCKED",
              count: expired.length,
              vercelLockSuccess: lockRes.ok,
              message: "She always pays her debts. Demos expired."
            })
          }] 
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Cersei Error: ${err.message}` }], isError: true };
      }
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
      minScore: z.number().optional().default(50).describe("Minimum Yoncé score to qualify (default: 50)"),
    },
    async ({ niche, city, minScore }) => {
      try {
        const now = new Date().toISOString();
        const jobId = crypto.randomUUID();
        tyrionJobs.set(jobId, {
          jobId,
          status: "running",
          createdAt: now,
          updatedAt: now,
          city,
          niche,
          minScore,
        });

        setImmediate(() => {
          void runTyrionJob(jobId, niche, city, minScore);
        });

        return { 
          content: [{ 
             type: "text" as const, 
             text: JSON.stringify({ jobId, status: "running" })
          }] 
        };
      } catch (err: any) {
        return {
           content: [{ type: "text" as const, text: `Tyrion fatal error: ${err.message}` }],
           isError: true,
        };
      }
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
      try {
        const closeAsset = await runKrisJennerClose({ contactId, dealId, websiteUrl });
        return { 
          content: [{ 
            type: "text" as const, 
            text: JSON.stringify(closeAsset) 
          }] 
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Kris Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ─────────────────────────────────────────────
  // 9. Kendrick — SEO Orchestrator
  // ─────────────────────────────────────────────
  server.tool(
    "kendrick",
    "Tier 3 SEO & AEO execution architect. Opens headless Chrome (Puppeteer) to rip real-time DOM metrics, detects semantic weaknesses, and generates 20 programmatic AI prompts and 6 Pillar SEO blogs via Claude.",
    {
      url: z.string().describe("Target website URL"),
      niche: z.string().describe("Business niche format"),
      city: z.string().describe("Target city format"),
    },
    async ({ url, niche, city }) => {
      try {
        const audit = await runKendrickAudit({ url, niche, city });
        return { 
          content: [{ 
            type: "text" as const, 
            text: JSON.stringify(audit) 
          }] 
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Kendrick Error: ${err.message}` }], isError: true };
      }
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
  "tiny_harris", "cersei", "tyrion", "kris_jenner", "kendrick"
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
  console.error(`Sonata Stack MCP server listening on port ${PORT}`);
});
