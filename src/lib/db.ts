// Supabase client — Sonata Stack
// Lazy-initialized: the server starts even when SUPABASE_URL is not set.
// DB writes simply fail gracefully (yonce gates on leadId being present).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    .from("agency_leads")
    .update({
      status: "AUDITED",
      intel_score: intelScore,
      intel_data: intelData,
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  return data;
}