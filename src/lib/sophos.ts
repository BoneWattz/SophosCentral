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
  associatedPerson?: { id?: string; name?: string; viaLogin?: string };
  ipv4Addresses?: string[];
  macAddresses?: string[];
  lastSeenAt?: string;
  registeredAt?: string;
  serialNumber?: string;
  online?: boolean;
  tamperProtectionEnabled?: boolean;
  encryption?: { volumes?: { volumeId: string; status: string }[] };
  assignedProducts?: { code: string; version?: string; status?: string }[];
}

const ENDPOINT_FIELDS = [
  "id",
  "type",
  "hostname",
  "health",
  "os",
  "ipv4Addresses",
  "macAddresses",
  "associatedPerson",
  "tamperProtectionEnabled",
  "lastSeenAt",
  "registeredAt",
  "serialNumber",
  "online",
  "assignedProducts",
  "encryption",
].join(",");

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

export interface SophosLicense {
  id: string;
  licenseIdentifier: string;
  code: string;
  genericCode: string | null;
  name: string;
  type: string;
  unlimited: boolean;
  startDate: string | null;
  // Usage-based (MSP monthly) licences report licences in use, not a purchased quantity.
  count: number;
  asOf: string | null;
}

interface RawLicense {
  id: string;
  licenseIdentifier: string;
  type: string;
  unlimited?: boolean;
  startDate?: string;
  product: { code: string; genericCode?: string; name: string };
  usage?: { current?: { count?: number; date?: string; collectedAt?: string } };
}

export async function listLicenses(): Promise<SophosLicense[]> {
  const session = await getSession();
  const res = await fetch("https://api.central.sophos.com/licenses/v1/licenses", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "X-Tenant-ID": session.tenantId,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 401) cached = null;
  if (!res.ok) throw new Error(`Sophos licenses request failed (${res.status})`);

  const body = (await res.json()) as { licenses: RawLicense[] };
  return body.licenses.map((l) => ({
    id: l.id,
    licenseIdentifier: l.licenseIdentifier,
    code: l.product.code,
    genericCode: l.product.genericCode ?? null,
    name: l.product.name,
    type: l.type,
    unlimited: l.unlimited ?? false,
    startDate: l.startDate ?? null,
    count: l.usage?.current?.count ?? 0,
    asOf: l.usage?.current?.collectedAt ?? l.usage?.current?.date ?? null,
  }));
}

// GET against the tenant's regional API. Sophos occasionally answers 5xx/429 for a request that
// works a moment later, so retry briefly. A 401 drops the cached token so the next call re-authenticates.
async function sophosGet(url: URL, session: Session): Promise<Response> {
  let res!: Response;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Tenant-ID": session.tenantId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  if (res.status === 401) cached = null;
  return res;
}

export interface DirectoryPerson {
  id: string;
  email: string | null;
  groups: string[];
}

// Sophos accepts at most 50 ids per lookup.
export const MAX_IDS_PER_LOOKUP = 50;

// Email and group names for up to 50 directory users (a device's associatedPerson.id is a directory user id).
export async function getPeopleByIds(ids: string[]): Promise<DirectoryPerson[]> {
  if (ids.length === 0) return [];
  if (ids.length > MAX_IDS_PER_LOOKUP) throw new Error(`At most ${MAX_IDS_PER_LOOKUP} ids per lookup`);

  const session = await getSession();
  const url = new URL(`${session.apiHost}/common/v1/directory/users`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("fields", "id,email,groups"); // keeps the reply small and fast
  url.searchParams.set("ids", ids.join(","));

  const res = await sophosGet(url, session);
  if (!res.ok) throw new Error(`Sophos user lookup failed (${res.status})`);

  const body = (await res.json()) as {
    items: { id: string; email?: string; groups?: { items?: { name?: string; displayName?: string }[] } }[];
  };
  return body.items.map((u) => ({
    id: u.id,
    email: u.email?.trim() || null,
    groups: (u.groups?.items ?? [])
      .map((g) => (g.displayName ?? g.name ?? "").replace(/ /g, " ").trim())
      .filter(Boolean),
  }));
}

export type DirectoryKind = "users" | "groups";

export interface DirectoryQuery {
  kind: DirectoryKind;
  page: number;
  pageSize: number; // Sophos caps this at 100
  sort: string; // e.g. "createdAt:desc"
  search?: string;
}

export interface DirectoryPage<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

// One page of the Sophos Central directory (synced users or user groups).
// Sophos sorts, searches and pages server-side, so we never need to download all ~4,500 users.
export async function getDirectoryPage<T = Record<string, unknown>>(q: DirectoryQuery): Promise<DirectoryPage<T>> {
  const session = await getSession();
  const url = new URL(
    `${session.apiHost}/common/v1/directory/${q.kind === "users" ? "users" : "user-groups"}`
  );
  url.searchParams.set("pageTotal", "true"); // required for page-number paging
  url.searchParams.set("page", String(q.page));
  url.searchParams.set("pageSize", String(q.pageSize));
  url.searchParams.set("sort", q.sort);
  if (q.search) {
    url.searchParams.set("search", q.search);
    // Without searchFields Sophos only searches names. Groups reject the parameter (HTTP 400).
    if (q.kind === "users") url.searchParams.set("searchFields", "name,email");
  }

  const res = await sophosGet(url, session);
  if (!res.ok) throw new Error(`Sophos directory request failed (${res.status})`);

  const body = (await res.json()) as {
    items: T[];
    pages?: { current?: number; total?: number; items?: number };
  };
  return {
    items: body.items,
    page: body.pages?.current ?? q.page,
    pages: body.pages?.total ?? 1,
    total: body.pages?.items ?? body.items.length,
  };
}

// One page (up to 500) of enrolled endpoints. Sophos pages by key, not number, so pages must be
// fetched in order; the browser walks them one request at a time to stay well inside the
// serverless time limit (a full fetch of ~1,500 devices can take close to 10 seconds).
export async function getEndpointsPage(
  pageFromKey?: string
): Promise<{ items: SophosEndpoint[]; nextKey: string | null }> {
  const session = await getSession();
  const url = new URL(`${session.apiHost}/endpoint/v1/endpoints`);
  url.searchParams.set("pageSize", "500");
  // serialNumber is only returned by the "full" view; `fields` keeps the payload small.
  url.searchParams.set("view", "full");
  url.searchParams.set("fields", ENDPOINT_FIELDS);
  if (pageFromKey) url.searchParams.set("pageFromKey", pageFromKey);

  const res = await sophosGet(url, session);
  if (!res.ok) throw new Error(`Sophos endpoints request failed (${res.status})`);

  const page = (await res.json()) as { items: SophosEndpoint[]; pages?: { nextKey?: string } };
  return { items: page.items, nextKey: page.pages?.nextKey ?? null };
}
