#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULTS = {
  businessName: "FlyNerd E2E Test HVAC",
  niche: "hvac",
  location: "Atlanta, GA",
  email: "info@nestedobjects.com",
  phone: "+14045550199",
  demoBaseUrl: "https://www.flynerd.tech/demo",
  walkthroughVideoUrl: "",
};

function readArg(name, fallback) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function buildLead() {
  const id = readArg("--id", crypto.randomUUID());
  const now = new Date().toISOString();
  const validUntil = readArg(
    "--validUntil",
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const businessName = readArg("--businessName", DEFAULTS.businessName);
  const niche = readArg("--niche", DEFAULTS.niche);
  const location = readArg("--location", DEFAULTS.location);
  const contactEmail = readArg("--email", DEFAULTS.email);
  const contactPhone = readArg("--phone", DEFAULTS.phone);
  const demoSiteUrl = readArg("--demoUrl", `${DEFAULTS.demoBaseUrl}/${id}`);
  const walkthroughVideoUrl = readArg(
    "--walkthroughVideoUrl",
    readArg("--videoUrl", DEFAULTS.walkthroughVideoUrl),
  );
  const placeId = readArg("--placeId", `test-seed-${id}`);

  return {
    id,
    businessName,
    niche,
    contactEmail,
    contactPhone,
    placeId,
    status: "DEMO_BUILT",
    scoutData: {
      source: "seed-test-lead",
      location,
      seededAt: now,
      note: "Synthetic DEMO_BUILT lead for Sonata outreach E2E testing.",
    },
    intelScore: 82,
    intelData: {
      rating: 4.8,
      reviewCount: 147,
      painPoints: [
        "Strong reputation but weak conversion path",
        "Emergency service demand needs faster intake",
      ],
      reputationSummary:
        "Synthetic HVAC lead with strong reviews and enough context for outreach testing.",
      opportunityScore: 82,
      operatingContext:
        "Seeded by Sonata seed-test-lead.mjs for live E2E validation.",
      leadSource: "test_seed",
    },
    demoSiteUrl,
    walkthroughVideoUrl: walkthroughVideoUrl || null,
    outreachHistory: [],
    validUntil,
    leadSource: "COLD",
    location,
    updatedAt: now,
  };
}

async function writeLeadEvent(supabase, lead) {
  const { error } = await supabase.from("LeadEvent").insert({
    id: crypto.randomUUID(),
    lead_id: lead.id,
    event_type: "DEMO_BUILT",
    payload: {
      status: "DEMO_BUILT",
      demoSiteUrl: lead.demoSiteUrl,
      validUntil: lead.validUntil,
      source: "seed-test-lead",
    },
    source: "sonata",
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`LeadEvent insert failed: ${error.message}`);
  }
}

function printUsage() {
  console.log(`
Usage:
  node --env-file=.env scripts/seed-test-lead.mjs [options]

Options:
  --email <email>                 Contact email for outreach E2E
  --businessName <name>           Defaults to "${DEFAULTS.businessName}"
  --niche <niche>                 Defaults to "${DEFAULTS.niche}"
  --location <city/state>         Defaults to "${DEFAULTS.location}"
  --demoUrl <url>                 Defaults to "${DEFAULTS.demoBaseUrl}/<leadId>"
  --videoUrl <url>                Optional walkthrough video URL
  --id <id>                       Optional explicit AgencyLead.id
  --placeId <placeId>             Optional explicit unique placeId
  --dry-run                       Print payload without inserting

After seeding:
  E2E_LEAD_ID=<printed id> node --env-file=.env scripts/tests/e2e-live-test.mjs
`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const lead = buildLead();
  if (hasFlag("--dry-run")) {
    console.log(JSON.stringify(lead, null, 2));
    return;
  }

  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data, error } = await supabase
    .from("AgencyLead")
    .insert(lead)
    .select("id,businessName,niche,contactEmail,status,demoSiteUrl,walkthroughVideoUrl")
    .single();

  if (error) {
    throw new Error(`AgencyLead insert failed: ${error.message}`);
  }

  await writeLeadEvent(supabase, lead);

  console.log("Seeded DEMO_BUILT test lead:");
  console.log(JSON.stringify(data, null, 2));
  console.log("");
  console.log(`E2E_LEAD_ID=${lead.id} node --env-file=.env scripts/tests/e2e-live-test.mjs`);
}

main().catch((err) => {
  console.error("seed-test-lead failed:", err.message);
  process.exit(1);
});
