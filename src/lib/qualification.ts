/**
 * Classify a Google Places result by digital presence strength.
 * Returns one of: "NONE", "WEAK_PLACEHOLDER", "DEAD_SITE", "REAL_SITE"
 */
export async function classifyWebPresence(place: any): Promise<{
  classification: "NONE" | "WEAK_PLACEHOLDER" | "DEAD_SITE" | "REAL_SITE";
  detail: string;
  checkedUrl?: string;
}> {
  // No website at all
  if (!place.websiteUri) {
    return { classification: "NONE", detail: "No website URI returned by Google Places" };
  }

  const url = place.websiteUri;
  
  // Check for known weak placeholder patterns
  const WEAK_PATTERNS = [
    /facebook\.com\//i,
    /m\.facebook\.com\//i,
    /business\.google\.com\//i,
    /sites\.google\.com\//i,
    /linktr\.ee\//i,
    /bio\.link\//i,
    /beacons\.ai\//i,
    /yelp\.com\//i,
    /yellowpages\.com\//i,
    /wix\.com\//i,
    /wixsite\.com\//i,
    /square\.site\//i,
    /godaddysites\.com\//i,
  ];
  
  for (const pattern of WEAK_PATTERNS) {
    if (pattern.test(url)) {
      return { 
        classification: "WEAK_PLACEHOLDER", 
        detail: `Placeholder site: ${pattern.source}`,
        checkedUrl: url 
      };
    }
  }
  
  // Real domain — check if it's alive
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err: any) {
    return { 
      classification: "WEAK_PLACEHOLDER" as const, 
      detail: `Malformed URL: ${err.message}`,
      checkedUrl: url 
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second max
    
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "FlyNerd-QualifyBot/1.0 (+https://www.flynerd.tech)"
      }
    });
    clearTimeout(timeout);
    
    if (response.status >= 400) {
      return { 
        classification: "DEAD_SITE", 
        detail: `HTTP ${response.status}`,
        checkedUrl: url 
      };
    }
    
    // TODO Phase 2: check if response URL is a parking page
    return { classification: "REAL_SITE", detail: "Live website", checkedUrl: url };
    
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { 
        classification: "DEAD_SITE", 
        detail: "Connection timeout (5s)",
        checkedUrl: url 
      };
    }
    return { 
      classification: "DEAD_SITE", 
      detail: `Fetch error: ${error.message}`,
      checkedUrl: url 
    };
  }
}

/**
 * Determines if a Google Places result qualifies as a FlyNerd lead.
 * A lead qualifies if it's a real operational business with weak digital presence.
 */
export function isQualifiedLead(place: any, presence: { classification: string }): boolean {
  // Viability gates
  if (!place.rating || place.rating < 3.0) return false;
  if (!place.userRatingCount || place.userRatingCount <= 3) return false;
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return false;
  
  // Weak presence gate
  const weakClassifications = ["NONE", "WEAK_PLACEHOLDER", "DEAD_SITE"];
  return weakClassifications.includes(presence.classification);
}
