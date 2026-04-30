// ActiveCampaign client - Sonata Stack.
// Matches the naming/behavior of flynerd-agency/lib/activecampaign.ts so
// the two codebases stay aligned. Lazy-initialized so the server boots
// even when AC credentials are missing (e.g., local dev without AC wiring).
import process from "node:process";

function getAcConfig() {
  const apiUrl = process.env.ACTIVECAMPAIGN_URL;
  const apiKey = process.env.ACTIVECAMPAIGN_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error(
      "[AC] ACTIVECAMPAIGN_URL and ACTIVECAMPAIGN_KEY are required for AC operations",
    );
  }
  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey };
}

const NICHE_MAP: Record<string, string> = {
  // Home services — underserved local
  hvac:                    "hvac",
  heating:                 "hvac",
  "heating and cooling":   "hvac",
  roofing:                 "roofing",
  roofer:                  "roofing",
  solar:                   "solar",
  "solar panel":           "solar",
  plumber:                 "plumbing",
  plumbers:                "plumbing",
  plumbing:                "plumbing",
  "water damage":          "water damage",
  "water-damage":          "water damage",
  "senior home care":      "senior home care",
  "senior-home-care":      "senior home care",

  // Legal — all sub-niches collapse to one AC branch
  "bankruptcy-law":        "legal",
  "estate-planning":       "legal",
  "family-law":            "legal",
  "immigration-law":       "legal",
  "personal-injury":       "legal",
  "real-estate-law":       "legal",
  "workers-comp":          "legal",

  // Medical / tech-enabled premium
  // Routes to "medical" — matches the future Cold Outreach Premium automation.
  "med-spa":               "medical",
  medspa:                  "medical",
  dentistry:               "medical",
  fertility:               "medical",
  orthodontics:            "medical",
  "trt-clinic":            "medical",
  "dental-implants":       "medical",
  "plastic-surgery":       "medical",
  "weight-loss":           "medical",
};

export function normalizeNiche(raw: string): string {
  return NICHE_MAP[raw.toLowerCase().trim()] || raw;
}

export async function upsertContact(
  email: string,
  firstName: string,
  lastName: string,
  phone?: string,
): Promise<any> {
  const { apiUrl, apiKey } = getAcConfig();
  console.error(`[AC] Syncing contact: ${email} | Phone: ${phone}`);
  const res = await fetch(`${apiUrl}/api/3/contact/sync`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contact: {
        email,
        firstName,
        lastName,
        phone,
      },
    }),
  });
  const data = await res.json();
  console.error(`[AC] Sync result:`, JSON.stringify(data, null, 2));
  return data;
}

export async function addTagToContact(
  contactId: string,
  tagName: string,
): Promise<any> {
  const { apiUrl, apiKey } = getAcConfig();
  console.error(`[AC] Adding tag '${tagName}' to contact ${contactId}...`);

  const tagRes = await fetch(`${apiUrl}/api/3/tags`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tag: { tag: tagName, tagType: "contact" } }),
  });
  const tagData = (await tagRes.json()) as any;
  let tagId = tagData.tag?.id;

  if (!tagId) {
    console.error(`[AC] Tag '${tagName}' might already exist, searching...`);
    const searchRes = await fetch(
      `${apiUrl}/api/3/tags?search=${encodeURIComponent(tagName)}`,
      {
        method: "GET",
        headers: { "Api-Token": apiKey },
      },
    );
    const searchData = (await searchRes.json()) as any;
    const found = searchData.tags?.find((t: any) => t.tag === tagName);
    tagId = found?.id;
  }

  if (!tagId) {
    console.error(`[AC] Could not create or find tag: ${tagName}`);
    return null;
  }

  const res = await fetch(`${apiUrl}/api/3/contactTags`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contactTag: {
        contact: contactId,
        tag: tagId,
      },
    }),
  });
  const result = await res.json();
  console.error(`[AC] Tag association result:`, JSON.stringify(result, null, 2));
  return result;
}

/**
 * Write a contact-level custom field value. fieldId must be the AC field ID
 * (number cast to string is fine - AC accepts both).
 */
export async function updateContactField(
  contactId: string,
  fieldId: string,
  value: string,
): Promise<unknown> {
  const { apiUrl, apiKey } = getAcConfig();
  const res = await fetch(`${apiUrl}/api/3/fieldValues`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fieldValue: {
        contact: contactId,
        field: fieldId,
        value,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[AC] updateContactField failed (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function subscribeContactToList(
  contactId: string,
  listId: string | number,
): Promise<any> {
  const { apiUrl, apiKey } = getAcConfig();
  const res = await fetch(`${apiUrl}/api/3/contactLists`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contactList: {
        list: String(listId),
        contact: contactId,
        status: 1,
      },
    }),
  });
  return res.json();
}

export async function createDeal(
  contactId: string,
  title: string,
  value: number,
  pipelineId: number | string = 1,
  stageId: number | string = 1,
  fields?: Array<{ customFieldId: number; fieldValue: string }>,
  description?: string,
  owner?: string | number,
): Promise<any> {
  const { apiUrl, apiKey } = getAcConfig();
  const payload = {
    deal: {
      contact: contactId,
      title,
      value,
      currency: "usd",
      group: String(pipelineId),
      stage: String(stageId),
      status: 0,
      ...(fields && { fields }),
      ...(description && { description }),
      ...(owner && { owner }),
    },
  };
  console.error("[AC] createDeal payload:", JSON.stringify(payload, null, 2));
  const res = await fetch(`${apiUrl}/api/3/deals`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AC] createDeal failed (${res.status}):`, errBody);
    return { error: errBody, status: res.status };
  }
  return res.json();
}

export async function updateDealField(
  dealId: string,
  fieldId: string,
  value: string,
): Promise<any> {
  const { apiUrl, apiKey } = getAcConfig();
  const res = await fetch(`${apiUrl}/api/3/dealCustomFieldData`, {
    method: "POST",
    headers: {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dealCustomFieldDatum: {
        dealId,
        customFieldId: fieldId,
        fieldValue: value,
      },
    }),
  });
  return res.json();
}
