// Minimal Sophos Central API client (server-side only).
// Docs: https://developer.sophos.com/getting-started-tenant

const TOKEN_URL = "https://id.sophos.com/api/v2/oauth2/token";
const WHOAMI_URL = "https://api.central.sophos.com/whoami/v1";

export interface SophosEndpoint {
  id: string;
  type: string;
  hostname: string;
  os?: { name?: string; platform?: string; isServer?: boolean };
  health?: { overall?: string };
  associatedPerson?: { name?: string; viaLogin?: string };
  ipv4Addresses?: string[];
  lastSeenAt?: string;
  tamperProtectionEnabled?: boolean;
  assignedProducts?: { code: string; version?: string; status?: string }[];
}

interface Session {
  accessToken: string;
  expiresAt: number;
  tenantId: string;
  apiHost: string;
}

// Cached per server instance so we don't re-authenticate on every request.
let cached: Session | null = null;

async function getSession(): Promise<Session> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const clientId = process.env.SOPHOS_CLIENT_ID;
  const clientSecret = process.env.SOPHOS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SOPHOS_CLIENT_ID / SOPHOS_CLIENT_SECRET are not configured");
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "token",
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    throw new Error(`Sophos auth failed (${tokenRes.status})`);
  }
  const token = (await tokenRes.json()) as { access_token: string; expires_in: number };

  const whoamiRes = await fetch(WHOAMI_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!whoamiRes.ok) {
    throw new Error(`Sophos whoami failed (${whoamiRes.status})`);
  }
  const whoami = (await whoamiRes.json()) as {
    id: string;
    idType: string;
    apiHosts: { dataRegion?: string };
  };
  if (whoami.idType !== "tenant" || !whoami.apiHosts.dataRegion) {
    throw new Error(
      `These credentials are for a "${whoami.idType}", not a tenant. Use tenant-level API credentials.`
    );
  }

  cached = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    tenantId: whoami.id,
    apiHost: whoami.apiHosts.dataRegion,
  };
  return cached;
}

// Fetches every enrolled endpoint, following Sophos' key-based pagination.
export async function listEndpoints(): Promise<SophosEndpoint[]> {
  const session = await getSession();
  const endpoints: SophosEndpoint[] = [];
  let pageFromKey: string | undefined;

  do {
    const url = new URL(`${session.apiHost}/endpoint/v1/endpoints`);
    url.searchParams.set("pageSize", "500");
    url.searchParams.set("pageTotal", "true");
    if (pageFromKey) url.searchParams.set("pageFromKey", pageFromKey);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Tenant-ID": session.tenantId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.status === 401) cached = null;
    if (!res.ok) {
      throw new Error(`Sophos endpoints request failed (${res.status})`);
    }

    const page = (await res.json()) as {
      items: SophosEndpoint[];
      pages?: { nextKey?: string };
    };
    endpoints.push(...page.items);
    pageFromKey = page.pages?.nextKey;
  } while (pageFromKey);

  return endpoints;
}
