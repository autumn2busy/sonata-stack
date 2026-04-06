// Supabase client — Sonata Stack
// Lazy-initialized: the server starts even when SUPABASE_URL is not set.
// DB writes simply fail gracefully (yonce gates on leadId being present).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

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
      status: "BUILT",
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
      status: payload.status || "DISCOVERED",
      updatedAt: new Date().toISOString(),
    }, { onConflict: "placeId" })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
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
    .in("status", ["BUILT", "DISCOVERED", "AUDITED", "PITCHED"]);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return data;
}

export async function updateLeadStatus(leadId: string, status: string) {
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
  return data;
}