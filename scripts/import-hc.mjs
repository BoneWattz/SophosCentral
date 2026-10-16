// Imports the HC sheet (CSV export) into the hc_employees table.
//
//   npm run import-hc -- "C:\path\to\HC.csv" --dry-run     (parse and report only)
//   npm run import-hc -- "C:\path\to\HC.csv"               (import)
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL.
// Run supabase/hc.sql in the Supabase SQL Editor first. Refuses to import into a non-empty table.
// The CSV holds employee data: keep it out of the repo (*.csv is git-ignored).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DATE_CREATED = "2026-10-10"; // every imported record gets this creation date, per request
const BATCH = 200;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error('Usage: npm run import-hc -- "<path to HC.csv>" [--dry-run]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  return rows;
}

const clean = (v) => (v ?? "").replace(/\u00a0/g, " ").trim();
const orNull = (v) => clean(v) || null;
const intOrNull = (v) => (/^\d+$/.test(clean(v)) ? Number(clean(v)) : null);

const [header, ...data] = parseCsv(readFileSync(csvPath, "utf8").replace(/^\uFEFF/, ""));
const col = (name) => {
  const i = header.findIndex((h) => h.trim() === name);
  if (i < 0) throw new Error(`Column "${name}" not found in the CSV`);
  return i;
};
const C = Object.fromEntries(
  ["ID Number", "Email", "Family Name", "First Name", "Middle Name", "Complete Name", "Name Extension", "Client ID",
   "Department / Client name", "Division", "Cost Center", "Position", "Status", "Remarks", "Date Deleted"].map((n) => [n, col(n)])
);

const adminEmail = process.env.ADMIN_EMAIL;
if (!adminEmail && !dryRun) {
  console.error("Set ADMIN_EMAIL in .env.local. It is recorded as the user who added the imported records.");
  process.exit(1);
}

const notes = [];
const records = data.map((r, i) => {
  const get = (name) => r[C[name]];

  // "Date Deleted" should hold a date. Two rows hold a Sophos login name instead: keep that text in Remarks.
  let remarks = orNull(get("Remarks"));
  let dateDeleted = null;
  const rawDeleted = clean(get("Date Deleted"));
  if (rawDeleted) {
    const d = new Date(rawDeleted);
    if (!Number.isNaN(d.getTime()) && /\d/.test(rawDeleted) && !rawDeleted.includes("\\")) {
      dateDeleted = d.toISOString().slice(0, 10);
    } else {
      remarks = [remarks, `Sophos login: ${rawDeleted}`].filter(Boolean).join(" - ");
      notes.push(`row ${i + 2}: "Date Deleted" was not a date (${rawDeleted}); moved to Remarks`);
    }
  }

  const idNumber = intOrNull(get("ID Number"));
  if (idNumber === null) notes.push(`row ${i + 2}: no ID Number (${clean(get("Email"))}); imported with an empty ID`);

  return {
    id_number: idNumber,
    email: clean(get("Email")).toLowerCase(),
    family_name: orNull(get("Family Name")),
    first_name: orNull(get("First Name")),
    middle_name: orNull(get("Middle Name")),
    complete_name: clean(get("Complete Name")) || clean(`${get("First Name")} ${get("Family Name")}`),
    name_extension: orNull(get("Name Extension")),
    client_id: intOrNull(get("Client ID")),
    client_name: orNull(get("Department / Client name")),
    division: orNull(get("Division")),
    cost_center: orNull(get("Cost Center")),
    position: orNull(get("Position")),
    status: orNull(get("Status")),
    remarks,
    date_created: DATE_CREATED,
    added_by: adminEmail ?? "(ADMIN_EMAIL)",
    date_deleted: dateDeleted,
    deleted_by: null,
  };
});

console.log(`Parsed ${records.length} records from ${csvPath}`);
const problems = records.filter((r) => !r.email || !r.complete_name);
if (problems.length) {
  console.error(`${problems.length} record(s) are missing an email or name; fix the CSV first.`);
  process.exit(1);
}
notes.forEach((n) => console.log("  note:", n));

if (dryRun) {
  console.log("Dry run: nothing was written. First record:", JSON.stringify(records[0]));
  process.exit(0);
}

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { count, error: countError } = await db.from("hc_employees").select("*", { count: "exact", head: true });
if (countError) {
  const missing = countError.code === "PGRST205" || countError.code === "42P01";
  console.error(
    missing ? "The hc_employees table doesn't exist. Run supabase/hc.sql in the Supabase SQL Editor first." : countError.message
  );
  process.exit(1);
}
if (count > 0) {
  console.error(`hc_employees already has ${count} row(s). Refusing to import again (it would duplicate or collide).`);
  process.exit(1);
}

// Sequential batches keep the CSV order, so "No." runs 1..N in the sheet's order.
let done = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const { error } = await db.from("hc_employees").insert(records.slice(i, i + BATCH));
  if (error) {
    console.error(`Insert failed after ${done} record(s): ${error.message}`);
    process.exit(1);
  }
  done += Math.min(BATCH, records.length - i);
  console.log(`  imported ${done}/${records.length}`);
}
console.log(`Done. Added by: ${adminEmail}; date created: ${DATE_CREATED}.`);
