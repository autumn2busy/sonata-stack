// Supabase client — Sonata Stack
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

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
