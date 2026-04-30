import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AGENCY_LEAD_STATUSES, type AgencyLeadStatus } from "./status-contract.js";

export const LEAD_EVENT_TYPES = [
  "LEAD_CREATED",
  "LEAD_DISCOVERED",
  "LEAD_AUDITED",
  "DEMO_BUILT",
  "OUTREACH_SENT",
  "LEAD_REPLIED",
  "CALL_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
  "OUTREACH_EXHAUSTED",
  "DEMO_EXPIRED",
  "INBOUND_CREATED",
  "CLIENT_ACTIVATED",
  "STATUS_SET",
] as const;

export type LeadEventType = typeof LEAD_EVENT_TYPES[number];

export const LEAD_EVENT_SOURCES = ["sonata", "n8n"] as const;

export type LeadEventSource = typeof LEAD_EVENT_SOURCES[number];

export type LeadEventPayload = Record<string, unknown>;

export type LeadEvent = {
  id?: string;
  lead_id: string;
  event_type: LeadEventType | string;
  payload?: LeadEventPayload | null;
  source?: LeadEventSource | string;
  created_at?: string | Date | null;
};

const EVENT_STATUS_MAP: Partial<Record<LeadEventType, AgencyLeadStatus>> = {
  LEAD_CREATED: "PROSPECT",
  LEAD_DISCOVERED: "DISCOVERED",
  LEAD_AUDITED: "AUDITED",
  DEMO_BUILT: "DEMO_BUILT",
  OUTREACH_SENT: "OUTREACH_SENT",
  LEAD_REPLIED: "REPLIED",
  CALL_BOOKED: "CALL_BOOKED",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
  OUTREACH_EXHAUSTED: "OUTREACH_EXHAUSTED",
  DEMO_EXPIRED: "DEMO_EXPIRED",
  INBOUND_CREATED: "INBOUND_NEW",
  CLIENT_ACTIVATED: "CLIENT_ACTIVE",
};

const STATUS_EVENT_MAP: Record<AgencyLeadStatus, LeadEventType> = {
  PROSPECT: "LEAD_CREATED",
  DISCOVERED: "LEAD_DISCOVERED",
  AUDITED: "LEAD_AUDITED",
  DEMO_BUILT: "DEMO_BUILT",
  OUTREACH_SENT: "OUTREACH_SENT",
  REPLIED: "LEAD_REPLIED",
  CALL_BOOKED: "CALL_BOOKED",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
  OUTREACH_EXHAUSTED: "OUTREACH_EXHAUSTED",
  DEMO_EXPIRED: "DEMO_EXPIRED",
  INBOUND_NEW: "INBOUND_CREATED",
  CLIENT_ACTIVE: "CLIENT_ACTIVATED",
};

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

function isAgencyLeadStatus(value: unknown): value is AgencyLeadStatus {
  return typeof value === "string" && AGENCY_LEAD_STATUSES.includes(value as AgencyLeadStatus);
}

function eventTime(event: LeadEvent): number {
  if (!event.created_at) return 0;
  const value = event.created_at instanceof Date
    ? event.created_at.getTime()
    : Date.parse(event.created_at);
  return Number.isNaN(value) ? 0 : value;
}

export function reduceStatusFromEvents(events: LeadEvent[]): AgencyLeadStatus {
  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  let status: AgencyLeadStatus = "PROSPECT";

  for (const event of ordered) {
    if (event.event_type === "STATUS_SET") {
      const payloadStatus = event.payload?.status;
      if (isAgencyLeadStatus(payloadStatus)) {
        status = payloadStatus;
      }
      continue;
    }

    const eventType = event.event_type as LeadEventType;
    const nextStatus = EVENT_STATUS_MAP[eventType];
    if (nextStatus) {
      status = nextStatus;
    }
  }

  return status;
}

export function leadEventTypeForStatus(status: AgencyLeadStatus): LeadEventType {
  return STATUS_EVENT_MAP[status];
}

export async function writeLeadEvent(
  leadId: string,
  eventType: LeadEventType,
  payload: LeadEventPayload = {},
  source: LeadEventSource = "sonata",
): Promise<LeadEvent> {
  if (!LEAD_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid LeadEvent event_type: ${eventType}`);
  }
  if (!LEAD_EVENT_SOURCES.includes(source)) {
    throw new Error(`Invalid LeadEvent source: ${source}`);
  }

  const row = {
    id: crypto.randomUUID(),
    lead_id: leadId,
    event_type: eventType,
    payload,
    source,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase()
    .from("LeadEvent")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`Supabase LeadEvent insert failed: ${error.message}`);
  return data as LeadEvent;
}
