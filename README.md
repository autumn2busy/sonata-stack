# Sonata Stack
FlyNerd Tech — AI Agent Orchestration Server

## Transport Strategy (Explicit)
Sonata Stack runs in **HTTP transport mode** using MCP `StreamableHTTPServerTransport`.

- Active MCP endpoint: `POST/GET/DELETE /mcp`
- Health endpoint: `GET /health`
- Startup log (stderr): `transport=http`

This server is **not** configured to be launched as a stdio MCP subprocess.

## The Roster
- **Simon Cowell** — Scout
- **Yoncé** — Intel
- **Dre** — Builder
- **Hov** — Closer
- **Tiny Harris** — Growth
- **Cersei** — Expire
- **Tyrion** — Orchestrator
- **Kris Jenner** — Post-Call Closer Asset

## Deploy
Railway. Always on. No timeout limits.

## MCP Client Configuration (HTTP)
Use a URL-based MCP server entry that targets `/mcp`.

### Example: Claude-compatible HTTP MCP entry
```json
{
  "mcpServers": {
    "sonata-stack": {
      "url": "https://YOUR-DEPLOYMENT-DOMAIN/mcp"
    }
  }
}
```

### Local development example
```json
{
  "mcpServers": {
    "sonata-stack-local": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

> Do **not** configure this server with a `command`/`args` stdio launch stanza unless you add a dedicated stdio startup path in code.
