// Supabase client — Sonata Stack
// Lazy-initialized: the server starts even when SUPABASE_URL is not set.
// DB writes simply fail gracefully (yonce gates on leadId being present).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { AGENCY_LEAD_STATUSES, type AgencyLeadStatus } from "./status-contract.js";
import { leadEventTypeForStatus, writeLeadEvent, type LeadEventPayload } from "./lead-events.js";

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DB operations");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

async function writeStatusEventBestEffort(
  leadId: string,
  status: AgencyLeadStatus,
  payload: LeadEventPayload = {},
): Promise<void> {
  try {
    await writeLeadEvent(
      leadId,
      leadEventTypeForStatus(status),
      { status, ...payload },
      "sonata",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LeadEvent] dual-write failed leadId=${leadId} status=${status}: ${message}`);
  }
}

export async function updateLeadAsAudited(
  leadId: string,
  intelScore: number,
  intelData: {
    rating: number;
    reviewCount: number;
    painPoints: string[];
    reputationSummary: string;
  }
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("AgencyLead")
    .update({
      status: "AUDITED",
      intelScore,
      intelData,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  await writeStatusEventBestEffort(leadId, "AUDITED", { intelScore });
  return data;
}

export async function updateLeadAsBuilt(
  leadId: string,
  updates: {
    demoSiteUrl: string;
    walkthroughVideoUrl?: string;
    validUntil: string; // ISO 8601
    intelData: Record<string, unknown>;
  }
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("AgencyLead")
    .update({
      status: "DEMO_BUILT",
      demoSiteUrl: updates.demoSiteUrl,
      walkthroughVideoUrl: updates.walkthroughVideoUrl || null,
      validUntil: updates.validUntil,
      intelData: updates.intelData,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  await writeStatusEventBestEffort(leadId, "DEMO_BUILT", {
    demoSiteUrl: updates.demoSiteUrl,
    validUntil: updates.validUntil,
    hasWalkthroughVideoUrl: Boolean(updates.walkthroughVideoUrl),
  });
  return data;
}

export async function getLeadById(leadId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("AgencyLead")
    .select("*")
    .eq("id", leadId)
    .single();

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return data;
}

export async function getActiveNicheKeys(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("niche_config")
    .select("niche_key")
    .eq("is_active", true)
    .order("niche_key");

  if (error) throw new Error(`Failed to load niche_config: ${error.message}`);
  return (data ?? []).map((row: { niche_key: string }) => row.niche_key);
}

export async function insertLead(payload: {
  businessName: string;
  niche: string;
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  placeId?: string;
  scoutData?: Record<string, unknown>;
  status?: string;
}) {
  const supabase = getSupabase();
  const incomingStatus = payload.status ?? "DISCOVERED";
  if (!AGENCY_LEAD_STATUSES.includes(incomingStatus as AgencyLeadStatus)) {
    throw new Error(
      `Invalid AgencyLead status: ${incomingStatus}. Must be one of: ${AGENCY_LEAD_STATUSES.join(", ")}`
    );
  }
  const status: AgencyLeadStatus = incomingStatus as AgencyLeadStatus;

  const { data: nicheRow, error: nicheError } = await supabase
    .from("niche_config")
    .select("niche_key")
    .eq("niche_key", payload.niche)
    .maybeSingle();

  if (nicheError) {
    console.error(
      `[insertLead] Warning: failed to validate niche "${payload.niche}" against niche_config: ${nicheError.message}`,
    );
  } else if (!nicheRow) {
    console.error(
      `[insertLead] Warning: niche "${payload.niche}" not found in niche_config. Lead will be inserted but downstream routing may fail.`,
    );
  }

  const { data, error } = await supabase
    .from("AgencyLead")
    .upsert({
      id: crypto.randomUUID(),
      businessName: payload.businessName,
      niche: payload.niche,
      location: payload.location,
      contactEmail: payload.contactEmail,
      contactPhone: payload.contactPhone,
      placeId: payload.placeId,
      scoutData: payload.scoutData,
      status,
      updatedAt: new Date().toISOString(),
    }, { onConflict: "placeId" })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  await writeStatusEventBestEffort(data.id, status, {
    niche: payload.niche,
    placeId: payload.placeId,
  });
  return data;
}

export async function getExpiredLeads() {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from("AgencyLead")
    .select("*")
    .not("validUntil", "is", null)
    .lt("validUntil", now)
    .in("status", ["DEMO_BUILT", "DISCOVERED", "AUDITED", "OUTREACH_SENT"]);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return data;
}

export async function updateLeadStatus(leadId: string, status: AgencyLeadStatus) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("AgencyLead")
    .update({ 
      status,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Supabase status update failed: ${error.message}`);
  await writeStatusEventBestEffort(leadId, status);
  return data;
}

export async function appendOutreachAttempt(
  leadId: string,
  attempt: { contactId: string; dealId: string; walkthroughVideoUrl?: string },
): Promise<void> {
  const supabase = getSupabase();
  const { data: lead, error: readError } = await supabase
    .from("AgencyLead")
    .select("outreachHistory")
    .eq("id", leadId)
    .single();

  if (readError) {
    throw new Error(`Supabase outreach history read failed: ${readError.message}`);
  }

  const existing = Array.isArray(lead?.outreachHistory)
    ? lead.outreachHistory
    : [];
  const outreachHistory = [
    ...existing,
    {
      timestamp: new Date().toISOString(),
      contactId: attempt.contactId,
      dealId: attempt.dealId,
      walkthroughVideoUrl: attempt.walkthroughVideoUrl,
    },
  ];

  const { error: updateError } = await supabase
    .from("AgencyLead")
    .update({
      outreachHistory,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (updateError) {
    throw new Error(`Supabase outreach history append failed: ${updateError.message}`);
  }
}
