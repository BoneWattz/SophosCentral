import { NextResponse } from "next/server";
import { createAdminClient, getSessionUser } from "@/lib/supabase/admin";
import { composeCompleteName } from "@/lib/hc";
import { HC_STATUS_OPTIONS, STATUS_OPTIONS, type ItRow } from "@/lib/itMonitoring";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function serverError(err: unknown) {
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected server error" }, { status: 500 });
}

// Table missing: the SQL in supabase/it_monitoring.sql hasn't been run yet.
const TABLE_HINT = "The GT - IT Monitoring table doesn't exist yet. Run supabase/it_monitoring.sql in the Supabase SQL Editor.";
const isMissing = (code?: string) => code === "PGRST205" || code === "42P01";

interface DbRow {
  id: number;
  id_number: number | null;
  ms365_email: string | null;
  sophos_email: string | null;
  family_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  complete_name: string | null;
  client_name: string | null;
  division: string | null;
  cost_center: string | null;
  position: string | null;
  status: string | null;
  remarks: string | null;
  hc_status: string | null;
  date_license_removal: string | null;
}

const toRow = (r: DbRow): ItRow => ({
  id: r.id,
  idNumber: r.id_number,
  ms365Email: r.ms365_email,
  sophosEmail: r.sophos_email,
  familyName: r.family_name,
  firstName: r.first_name,
  middleName: r.middle_name,
  completeName: r.complete_name,
  clientName: r.client_name,
  division: r.division,
  costCenter: r.cost_center,
  position: r.position,
  status: r.status,
  remarks: r.remarks,
  hcStatus: r.hc_status,
  dateLicenseRemoval: r.date_license_removal,
});

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/ /g, " ").trim();
  return t || null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Turns the request body into the columns to store, or an error message.
function parseBody(b: Record<string, unknown>): { values: Record<string, unknown> } | { error: string } {
  const ms365 = text(b.ms365Email)?.toLowerCase() ?? null;
  const sophos = text(b.sophosEmail)?.toLowerCase() ?? null;
  if ((ms365 && !EMAIL.test(ms365)) || (sophos && !EMAIL.test(sophos))) {
    return { error: "Email addresses must be valid (name@company.com)" };
  }

  const idRaw = text(b.idNumber);
  if (idRaw && !/^\d{1,9}$/.test(idRaw)) return { error: "ID Number must be a whole number" };

  const status = text(b.status);
  if (status && !STATUS_OPTIONS.includes(status)) return { error: `Status must be one of: ${STATUS_OPTIONS.join(", ")}` };
  const hcStatus = text(b.hcStatus);
  if (hcStatus && !HC_STATUS_OPTIONS.includes(hcStatus)) {
    return { error: `Heartcount Status must be one of: ${HC_STATUS_OPTIONS.join(", ")}` };
  }

  const removal = text(b.dateLicenseRemoval);
  if (removal && (!/^\d{4}-\d{2}-\d{2}$/.test(removal) || Number.isNaN(new Date(`${removal}T00:00:00Z`).getTime()))) {
    return { error: "Date License Removal must be a valid date" };
  }

  const familyName = text(b.familyName);
  const firstName = text(b.firstName);
  const middleName = text(b.middleName);
  const completeName = text(b.completeName) ?? (composeCompleteName({ firstName, middleName, familyName }) || null);
  if (!completeName) return { error: "Enter a Complete Name (or a first and family name)" };

  return {
    values: {
      id_number: idRaw ? Number(idRaw) : null,
      ms365_email: ms365,
      sophos_email: sophos,
      family_name: familyName,
      first_name: firstName,
      middle_name: middleName,
      complete_name: completeName,
      client_name: text(b.clientName),
      division: text(b.division),
      cost_center: text(b.costCenter),
      position: text(b.position),
      status,
      remarks: text(b.remarks),
      hc_status: hcStatus,
      date_license_removal: removal,
    },
  };
}

function idFrom(request: Request): number | null {
  const id = Number(new URL(request.url).searchParams.get("id"));
  return Number.isInteger(id) && id >= 1 ? id : null;
}

// GET /api/it-monitoring -> every record, newest first
export async function GET() {
  try {
    if (!(await getSessionUser())) return unauthorized();

    const db = createAdminClient();
    const rows: DbRow[] = [];
    // PostgREST returns at most 1000 rows per request, so page through the table.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("it_monitoring")
        .select("*")
        .order("id", { ascending: false })
        .range(from, from + 999);
      if (error) return bad(isMissing(error.code) ? TABLE_HINT : error.message, 500);
      rows.push(...(data as DbRow[]));
      if (data.length < 1000) break;
    }
    return NextResponse.json({ rows: rows.map(toRow) });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/it-monitoring -> add a record
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const parsed = parseBody((await request.json().catch(() => ({}))) as Record<string, unknown>);
    if ("error" in parsed) return bad(parsed.error);

    const { data, error } = await createAdminClient()
      .from("it_monitoring")
      .insert({ ...parsed.values, created_by: user.email ?? "unknown" })
      .select("*")
      .single();
    if (error) return bad(isMissing(error.code) ? TABLE_HINT : error.message);
    return NextResponse.json({ row: toRow(data as DbRow) }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

// PUT /api/it-monitoring?id=123 -> replace a record's fields
export async function PUT(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const id = idFrom(request);
    if (!id) return bad("A valid record id is required");

    const parsed = parseBody((await request.json().catch(() => ({}))) as Record<string, unknown>);
    if ("error" in parsed) return bad(parsed.error);

    const { data, error } = await createAdminClient()
      .from("it_monitoring")
      .update({ ...parsed.values, updated_at: new Date().toISOString(), updated_by: user.email ?? "unknown" })
      .eq("id", id)
      .select("*");
    if (error) return bad(error.message);
    if (!data.length) return bad("Record not found (it may have been deleted)", 404);
    return NextResponse.json({ row: toRow(data[0] as DbRow) });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/it-monitoring?id=123 -> remove a record
export async function DELETE(request: Request) {
  try {
    if (!(await getSessionUser())) return unauthorized();

    const id = idFrom(request);
    if (!id) return bad("A valid record id is required");

    const { data, error } = await createAdminClient().from("it_monitoring").delete().eq("id", id).select("id");
    if (error) return bad(error.message);
    if (!data.length) return bad("Record not found (it may already be deleted)", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
