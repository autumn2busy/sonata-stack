// Vercel API client — Sonata Stack
// Handles demo site deployment and password protection.

const TEAM_ID = "team_uSLsRZHA5u8JAkI9tVVipAFi";
const TARGET_PROJECT = process.env.VERCEL_TARGET_PROJECT ?? "flynerd-demo-lead";
const FALLBACK_BASE_URL =
    process.env.VERCEL_FALLBACK_BASE_URL ?? "https://flynerd-demo-lead.vercel.app";

function getToken(): string {
    const token = process.env.VERCEL_API_TOKEN;
    if (!token) throw new Error("VERCEL_API_TOKEN is required");
    return token;
}

export function getCanonicalDemoUrl(leadId: string): string {
    return `${FALLBACK_BASE_URL}/demo/${leadId}`;
}

export async function triggerDeploy(): Promise<boolean> {
    // Try deploy hook first (fastest path)
    const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
    if (hookUrl) {
        try {
            const res = await fetch(hookUrl, { method: "POST" });
            if (res.ok) {
                console.error("[Vercel] Deploy hook accepted.");
                return true;
            }
            console.warn(`[Vercel] Deploy hook failed (${res.status})`);
        } catch (err) {
            console.warn("[Vercel] Deploy hook network error:", err);
        }
    }

    // Fallback: trigger via API
    const token = getToken();
    try {
        const res = await fetch(
            `https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: TARGET_PROJECT,
                    project: TARGET_PROJECT,
                    target: "production",
                    gitSource: {
                        type: "github",
                        repo: "autumn2busy/flynerd_agency",
                        ref: "main",
                    },
                }),
            }
        );

        if (!res.ok) {
            const body = await res.text();
            console.warn(`[Vercel] API deploy failed (${res.status}): ${body.slice(0, 200)}`);
            return false;
        }

        console.error("[Vercel] API deploy triggered successfully.");
        return true;
    } catch (err) {
        console.warn("[Vercel] API deploy network error:", err);
        return false;
    }
}

export async function passwordProtectDeployment(
    bypassSecret: string
): Promise<{ ok: boolean; error?: string }> {
    const token = getToken();

    try {
        const res = await fetch(
            `https://api.vercel.com/v9/projects/${TARGET_PROJECT}?teamId=${TEAM_ID}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    passwordProtection: {
                        deploymentType: "all",
                        password: bypassSecret,
                    },
                }),
            }
        );

        if (!res.ok) {
            const err = await res.text();
            console.error("[Vercel] passwordProtect failed:", err);
            return { ok: false, error: err };
        }

        console.error("[Vercel] Password protection enabled.");
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
