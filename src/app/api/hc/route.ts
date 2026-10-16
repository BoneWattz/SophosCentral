import { NextResponse } from "next/server";
import { createAdminClient, getSessionUser } from "@/lib/supabase/admin";
import { composeCompleteName, todayManila, type HcRow } from "@/lib/hc";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

function serverError(err: unknown) {
  console.error(err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unexpected server error" },
    { status: 500 }
  );
}

// Table missing: the SQL in supabase/hc.sql hasn't been run yet.
const TABLE_HINT = "The HC table doesn't exist yet. Run supabase/hc.sql in the Supabase SQL Editor.";

interface DbRow {
  no: number;
  id_number: number | null;
  email: string;
  family_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  name_extension: string | null;
  complete_name: string;
  client_id: number | null;
  client_name: string | null;
  division: string | null;
  cost_center: string | null;
  position: string | null;
  status: string | null;
  remarks: string | null;
  date_created: string;
  added_by: string;
  date_deleted: string | null;
  deleted_by: string | null;
}

const toRow = (r: DbRow): HcRow => ({
  no: r.no,
  idNumber: r.id_number,
  email: r.email,
  familyName: r.family_name,
  firstName: r.first_name,
  middleName: r.middle_name,
  nameExtension: r.name_extension,
  completeName: r.complete_name,
  clientId: r.client_id,
  clientName: r.client_name,
  division: r.division,
  costCenter: r.cost_center,
  position: r.position,
  status: r.status,
  remarks: r.remarks,
  dateCreated: r.date_created,
  addedBy: r.added_by,
  dateDeleted: r.date_deleted,
  deletedBy: r.deleted_by,
});

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/ /g, " ").trim();
  return t || null;
};

const integer = (v: unknown): number | null | "invalid" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : "invalid";
};

// GET /api/hc -> every record, oldest "No." first
export async function GET() {
  try {
    if (!(await getSessionUser())) return unauthorized();

    const db = createAdminClient();
    const rows: DbRow[] = [];
    // PostgREST returns at most 1000 rows per request, so page through the table.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("hc_employees")
        .select("*")
        .order("no", { ascending: true })
        .range(from, from + 999);
      if (error) {
        const missing = error.code === "PGRST205" || error.code === "42P01";
        return NextResponse.json({ error: missing ? TABLE_HINT : error.message }, { status: 500 });
      }
      rows.push(...(data as DbRow[]));
      if (data.length < 1000) break;
    }
    return NextResponse.json({ rows: rows.map(toRow) });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/hc -> add a record. added_by and date_created are set by the server, never the client.
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const email = text(b.email)?.toLowerCase() ?? null;
    const familyName = text(b.familyName);
    const firstName = text(b.firstName);
    const clientName = text(b.clientName);
    const idNumber = integer(b.idNumber);
    const clientId = integer(b.clientId);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!familyName || !firstName) {
      return NextResponse.json({ error: "Family name and first name are required" }, { status: 400 });
    }
    if (!clientName) {
      return NextResponse.json({ error: "Department / client name is required" }, { status: 400 });
    }
    if (idNumber === "invalid" || clientId === "invalid") {
      return NextResponse.json({ error: "ID Number and Client ID must be whole numbers" }, { status: 400 });
    }

    const middleName = text(b.middleName);
    const nameExtension = text(b.nameExtension);

    const { data, error } = await createAdminClient()
      .from("hc_employees")
      .insert({
        id_number: idNumber,
        email,
        family_name: familyName,
        first_name: firstName,
        middle_name: middleName,
        name_extension: nameExtension,
        complete_name:
          text(b.completeName) ?? composeCompleteName({ firstName, middleName, familyName, nameExtension }),
        client_id: clientId,
        client_name: clientName,
        division: text(b.division),
        cost_center: text(b.costCenter),
        position: text(b.position),
        status: text(b.status),
        remarks: text(b.remarks),
        date_created: todayManila(),
        added_by: user.email ?? "unknown",
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const dupId = error.message.includes("id_number");
        return NextResponse.json(
          { error: dupId ? "That ID Number already exists" : "That email already exists" },
          { status: 409 }
        );
      }
      const missing = error.code === "PGRST205" || error.code === "42P01";
      return NextResponse.json({ error: missing ? TABLE_HINT : error.message }, { status: 400 });
    }
    return NextResponse.json({ row: toRow(data as DbRow) }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/hc?no=123 -> soft delete: keep the row, record the date and who deleted it.
export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const no = Number(new URL(request.url).searchParams.get("no"));
    if (!Number.isInteger(no) || no < 1) {
      return NextResponse.json({ error: "A valid record number is required" }, { status: 400 });
    }

    const { data, error } = await createAdminClient()
      .from("hc_employees")
      .update({ date_deleted: todayManila(), deleted_by: user.email ?? "unknown" })
      .eq("no", no)
      .is("date_deleted", null) // already-deleted rows keep their original deleter and date
      .select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data.length) {
      return NextResponse.json({ error: "Record not found or already deleted" }, { status: 404 });
    }
    return NextResponse.json({ row: toRow(data[0] as DbRow) });
  } catch (err) {
    return serverError(err);
  }
}
