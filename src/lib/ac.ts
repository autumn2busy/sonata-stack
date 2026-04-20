// ActiveCampaign client — minimal helpers for sonata-stack.
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

/**
 * Write a contact-level custom field value. fieldId must be the AC field ID
 * (number cast to string is fine — AC accepts both).
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
