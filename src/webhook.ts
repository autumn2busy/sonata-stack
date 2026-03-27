import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || "3100", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

interface PostCallPayload {
  contactId: string;
  dealId: string;
  websiteUrl: string;
}

function verifySecret(req: IncomingMessage): boolean {
  const token = req.headers["x-webhook-secret"];
  return token === WEBHOOK_SECRET;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export function startWebhookServer() {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "sonata-stack" }));
      return;
    }

    // POST /webhook/post-call — triggers kris_jenner
    if (req.method === "POST" && req.url === "/webhook/post-call") {
      if (!verifySecret(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      try {
        const body = await readBody(req);
        const payload: PostCallPayload = JSON.parse(body);

        // TODO: invoke kris_jenner with payload
        console.error("[webhook] post-call received:", payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "accepted", agent: "kris_jenner" }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid payload" }));
      }
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
