#!/usr/bin/env bash
set -euo pipefail

npm run build

if [[ ! -f dist/index.js ]]; then
  echo "ERROR: dist/index.js was not emitted by build"
  exit 1
fi

echo "console.log occurrences in dist/index.js"
(grep -n "console\\.log" dist/index.js || true) | wc -l

echo "Transport markers in dist/index.js"
grep -En "StdioServerTransport|StreamableHTTP" dist/index.js

echo "Scanning dist for broken ESM relative imports"
node <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.resolve('dist');
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      jsFiles.push(fullPath);
    }
  }
}

if (!fs.existsSync(distRoot)) {
  console.error('ERROR: dist directory not found');
  process.exit(1);
}

walk(distRoot);

const importRegex = /(?:import\s+(?:[^'"()]+?\s+from\s+)?|export\s+[^'"()]*?from\s+|import\s*\()\s*['\"]([^'\"]+)['\"]/g;
const broken = [];

for (const file of jsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const contentWithoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const match of contentWithoutComments.matchAll(importRegex)) {
    const specifier = match[1];
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      continue;
    }

    const hasAllowedExt = /\.(js|mjs|cjs|json|node)$/.test(specifier);
    if (!hasAllowedExt) {
      broken.push(`${path.relative(process.cwd(), file)} -> ${specifier} (missing ESM extension)`);
      continue;
    }

    const resolvedPath = path.resolve(path.dirname(file), specifier);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      broken.push(`${path.relative(process.cwd(), file)} -> ${specifier} (target missing)`);
    }
  }
}

if (broken.length > 0) {
  console.error('ERROR: broken ESM relative imports found:');
  for (const issue of broken) {
    console.error(` - ${issue}`);
  }
  process.exit(1);
}

console.log(`OK: scanned ${jsFiles.length} dist files and found no broken ESM relative imports.`);
NODE

echo "Pipeline import lines (dist/agents/pipeline.js)"
if [[ -f dist/agents/pipeline.js ]]; then
  grep -nE "^import .* from ['\"](\./|\.\./)" dist/agents/pipeline.js || true
else
  echo "WARN: dist/agents/pipeline.js not found"
fi
