import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL as NodeURL } from "node:url";
import querystring from "node:querystring";
import { runKrisJennerClose } from "./agents/kris.js";
import {
  ensureWarmLead,
  continueWarmApplyBuild,
  type WarmApplyInput,
} from "./agents/warmApply.js";

const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "3100", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// Contact-level AC field IDs that appear in the inbound webhook body.
// These match what flynerd-agency writes during outreach (Prompt B).
const AC_FIELD_AGENCY_LEAD_ID = "165";
// const AC_FIELD_CLIENT_ID = "166"; // not used here yet
// const AC_FIELD_NICHE = "167";
// const AC_FIELD_DEMO_URL = "168";

interface CallCompletedPayload {
  contactId: string;
  agencyLeadId: string;
  dealId: string;
  dealValueDollars?: number;
  dealTitle?: string;
  dealStage?: string;
  dealPipeline?: string;
}

function verifySecret(req: IncomingMessage): boolean {
  if (!WEBHOOK_SECRET) {
    // If the server is booted without WEBHOOK_SECRET, fail closed in prod.
    // Dev can set WEBHOOK_SECRET=dev explicitly.
    return false;
  }
  const token = req.headers["x-webhook-secret"];
  return token === WEBHOOK_SECRET;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * AC sends contact-level custom fields in the POST body using nested-bracket
 * syntax like `contact[fields][165]=agency-lead-uuid`. Node's stdlib
 * querystring parser flattens those to literal keys `contact[fields][165]`.
 * We probe a few common shapes so we aren't locked to one AC template.
 */
function readField(parsed: querystring.ParsedUrlQuery, ...candidates: string[]): string | undefined {
  for (const key of candidates) {
    const v = parsed[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string" && v[0].length > 0) return v[0];
  }
  return undefined;
}

function extractPayload(url: string, body: string): CallCompletedPayload | { error: string } {
  const bodyParsed = querystring.parse(body);

  // Deal context arrives via URL query params per the AC webhook config
  //   ?dealfield1=%DEAL_ID%&dealfield2=%DEAL_TITLE%&dealfield3=%DEAL_VALUE%
  //   &dealfield4=%DEAL_STAGE%&dealfield5=%DEAL_PIPELINE%
  const parsedUrl = new NodeURL(url, "http://placeholder");
  const qp = parsedUrl.searchParams;

  const dealId = qp.get("dealfield1") || "";
  const dealTitle = qp.get("dealfield2") || undefined;
  const dealValueStr = qp.get("dealfield3") || "";
  const dealStage = qp.get("dealfield4") || undefined;
  const dealPipeline = qp.get("dealfield5") || undefined;

  // AC deal value substitutes as a dollar amount (e.g. "2500" or "2500.00")
  // rather than cents. Parse conservatively — missing/malformed leaves it
  // undefined so Kris falls back to the default price.
  let dealValueDollars: number | undefined;
  if (dealValueStr) {
    const parsed = Number(dealValueStr.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) dealValueDollars = parsed;
  }

  const contactId = readField(
    bodyParsed,
    "contact[id]",
    "contact_id",
    "contactId",
    "id",
  ) || "";

  const agencyLeadId = readField(
    bodyParsed,
    `contact[fields][${AC_FIELD_AGENCY_LEAD_ID}]`,
    `contact_field_${AC_FIELD_AGENCY_LEAD_ID}`,
    "agency_lead_id",
    "agencyLeadId",
  ) || "";

  if (!contactId) return { error: "missing contactId" };
  if (!agencyLeadId) return { error: "missing agencyLeadId (AC contact field 165)" };
  if (!dealId) return { error: "missing dealId (URL query dealfield1)" };

  return {
    contactId,
    agencyLeadId,
    dealId,
    dealValueDollars,
    dealTitle,
    dealStage,
    dealPipeline,
  };
}

export function startWebhookServer() {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "sonata-stack" }));
      return;
    }

    // POST /webhooks/ac/call-completed — fired when AC CALL_COMPLETED tag
    // is applied to a contact. Configured via AC automation "FlyNerd — Call
    // Completed Post-Call Close" per docs/specs/2026-04-18-kris-jenner-webhook.md.
    // The URL carries a trailing slash + query params from AC's personalization
    // template; we match on pathname only to stay tolerant of query/trailing-slash.
    const urlForRouting = req.url || "";
    const pathname = new NodeURL(urlForRouting, "http://placeholder").pathname.replace(/\/+$/, "");

    if (req.method === "POST" && pathname === "/webhooks/ac/call-completed") {
      if (!verifySecret(req)) {
        console.error("[webhook] call-completed rejected: bad or missing x-webhook-secret");
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      try {
        body = await readBody(req);
      } catch (err: any) {
        console.error("[webhook] call-completed: failed to read body:", err?.message || err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid body" }));
        return;
      }

      const extracted = extractPayload(urlForRouting, body);
      if ("error" in extracted) {
        // Log the raw body (truncated) so the owner can see what AC actually
        // sent and adjust field-name probing if needed.
        const bodyPreview = body.length > 500 ? body.slice(0, 500) + "…" : body;
        console.error(
          `[webhook] call-completed payload error: ${extracted.error}. url=${urlForRouting} bodyPreview=${bodyPreview}`,
        );
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: extracted.error }));
        return;
      }

      const payload = extracted;

      // Respond 202 Accepted immediately. Kris's work (Supabase lookup + Dre
      // rebuild + Stripe + Claude + AC writeback) is 15-60s, well over AC's
      // webhook timeout. Do not block the HTTP response on it.
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "accepted",
          agent: "kris_jenner",
          agencyLeadId: payload.agencyLeadId,
          dealId: payload.dealId,
        }),
      );

      setImmediate(() => {
        runKrisJennerClose({
          agencyLeadId: payload.agencyLeadId,
          contactId: payload.contactId,
          dealId: payload.dealId,
          dealValueDollars: payload.dealValueDollars,
        })
          .then((result) => {
            console.error(
              `[webhook] kris_jenner done agencyLeadId=${payload.agencyLeadId} warnings=${JSON.stringify(result.warnings)}`,
            );
          })
          .catch((err: any) => {
            console.error(
              `[webhook] kris_jenner FAILED agencyLeadId=${payload.agencyLeadId}:`,
              err?.message || err,
            );
          });
      });
      return;
    }

    // POST /webhooks/warm-apply — fired by flynerd-agency /api/apply when
    // a prospect completes the qualification form. Runs the warm-lead demo
    // pipeline (skip scout/enrich, go straight to Dre) and writes the
    // resulting %DEMOURL% back to AC contact field 168.
    if (req.method === "POST" && pathname === "/webhooks/warm-apply") {
      if (!verifySecret(req)) {
        console.error("[webhook] warm-apply rejected: bad or missing x-webhook-secret");
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      try {
        body = await readBody(req);
      } catch (err: any) {
        console.error("[webhook] warm-apply: failed to read body:", err?.message || err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid body" }));
        return;
      }

      let parsed: Partial<WarmApplyInput>;
      try {
        parsed = JSON.parse(body) as Partial<WarmApplyInput>;
      } catch (err: any) {
        console.error("[webhook] warm-apply: JSON parse failed:", err?.message || err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      // Required fields guard — mirror the server-side validation in
      // flynerd-agency /api/apply so we don't attempt a Dre run on a
      // half-populated payload that would produce a broken demo.
      const required: Array<keyof WarmApplyInput> = [
        "email",
        "name",
        "businessName",
        "websiteUrl",
        "niche",
        "services",
        "painPoint",
        "leadVolume",
        "timeline",
      ];
      const missing = required.filter((k) => {
        const v = parsed[k];
        return typeof v !== "string" || v.trim() === "";
      });
      if (missing.length > 0) {
        console.error(
          `[webhook] warm-apply: missing required fields: ${missing.join(", ")}`,
        );
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Missing required fields: ${missing.join(", ")}`,
          }),
        );
        return;
      }

      const input: WarmApplyInput = {
        email: parsed.email as string,
        name: parsed.name as string,
        businessName: parsed.businessName as string,
        websiteUrl: parsed.websiteUrl as string,
        niche: parsed.niche as string,
        services: parsed.services as string,
        painPoint: parsed.painPoint as string,
        leadVolume: parsed.leadVolume as string,
        timeline: parsed.timeline as string,
        tools: typeof parsed.tools === "string" ? parsed.tools : undefined,
        contactId:
          typeof parsed.contactId === "string" ? parsed.contactId : undefined,
        applyId:
          typeof parsed.applyId === "string" ? parsed.applyId : undefined,
      };

      // Phase 1 (synchronous) — insert the AgencyLead row FIRST so
      // flynerd-agency gets the agencyLeadId back in the 202 body before
      // it applies the DEMO_QUALIFIED tag. n8n's tag-sync workflow fires
      // on that tag and looks up Supabase; if the row isn't there yet,
      // it falls back to the orphan list. Inserting synchronously closes
      // that race. insertLead is ~200-500ms under normal conditions.
      let ensured: Awaited<ReturnType<typeof ensureWarmLead>>;
      try {
        ensured = await ensureWarmLead(input);
      } catch (err: any) {
        console.error(
          `[webhook] warm-apply ensureWarmLead failed email=${input.email}:`,
          err?.message || err,
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Failed to create AgencyLead row in Supabase",
            detail: err?.message ?? String(err),
          }),
        );
        return;
      }

      // Respond 202 with the agencyLeadId so the caller can stamp it on
      // AC contact field 165 before any tag-triggered automations fire.
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "accepted",
          agent: "warm_apply",
          email: input.email,
          agencyLeadId: ensured.agencyLeadId,
        }),
      );

      // Phase 2 (async) — Dre build + AC field 168 writeback. 30-90s.
      setImmediate(() => {
        continueWarmApplyBuild(ensured.agencyLeadId, input)
          .then((result) => {
            console.error(
              `[webhook] warm_apply done agencyLeadId=${result.agencyLeadId} demoSiteUrl=${result.demoSiteUrl || "(missing)"} warnings=${JSON.stringify(result.warnings)}`,
            );
          })
          .catch((err: any) => {
            console.error(
              `[webhook] warm_apply FAILED agencyLeadId=${ensured.agencyLeadId} email=${input.email}:`,
              err?.message || err,
            );
          });
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(WEBHOOK_PORT, () => {
    console.error(`[webhook] listening on port ${WEBHOOK_PORT}`);
  });

  return httpServer;
}
