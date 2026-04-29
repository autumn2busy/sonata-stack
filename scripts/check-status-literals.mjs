#!/usr/bin/env node
// Status contract scanner.
// Scans TS/TSX/JS/MJS source files for forbidden status literals.
// Exits 0 if clean, exits 1 with a report if any forbidden literal is found.
// Runs as part of `npm run build` per the status-contract policy.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const FORBIDDEN_AGENCY_LEAD = [
  "BUILT", "EXPIRED", "ACTIVE", "PITCHED",
  "OUTREACHED", "NEGOTIATING", "WON", "LOST",
];

const FORBIDDEN_CLIENT = ["CLIENT_ACTIVE"];

const SCAN_EXTS = [".ts", ".tsx", ".js", ".mjs"];
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build",
  "scripts", // do not scan ourselves
]);
const SKIP_FILES = new Set([
  "src/lib/status-contract.ts", // canonical list lives here
]);

// Allowed contexts where these literals are NOT db statuses.
// If a line matches an allowed pattern, we ignore the hit.
const ALLOWLIST_PATTERNS = [
  /status:\s*\d+/,                 // HTTP status codes: status: 200, status: 500
  /\.status\s*===?\s*["']\d+["']/, // AC deal status comparisons
  /processing|completed|failed/i,  // HeyGen lifecycle
  /CLOSE_ASSET_BUILT/,             // internal result status, not DB
  /from\(["']Client["']\).*["']ACTIVE["']/, // Client.status example/comment
];

const CLIENT_CONTEXT_PATTERN = /\bclient\b|prisma\.client|Client\.status|from\(["']Client["']\)/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (SCAN_EXTS.includes(SCAN_EXTS.find((e) => full.endsWith(e)) ?? "")) {
      files.push(full);
    }
  }
  return files;
}

const findings = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ALLOWLIST_PATTERNS.some((p) => p.test(line))) return;

    for (const lit of FORBIDDEN_AGENCY_LEAD) {
      const re = new RegExp(`["']${lit}["']`);
      if (re.test(line)) {
        findings.push({ file: rel, line: i + 1, literal: lit, kind: "agency-lead-forbidden", text: line.trim() });
      }
    }
    // Client.status = "CLIENT_ACTIVE" pattern (table-aware-ish heuristic)
    for (const lit of FORBIDDEN_CLIENT) {
      const lineWithoutLiteral = line.replaceAll(lit, "");
      if (line.includes(lit) && CLIENT_CONTEXT_PATTERN.test(lineWithoutLiteral)) {
        findings.push({ file: rel, line: i + 1, literal: lit, kind: "client-forbidden", text: line.trim() });
      }
    }
  });
}

if (findings.length === 0) {
  console.log("[status-contract] OK. No forbidden status literals found.");
  process.exit(0);
}

console.error("[status-contract] FAIL. Forbidden status literals found:\n");
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${f.literal}`);
  console.error(`    ${f.text}`);
}
console.error(`\n${findings.length} violation(s). See src/lib/status-contract.ts for canonical sets.`);
process.exit(1);
