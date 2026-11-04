// Imports the "GT - IT Monitoring" sheet of the Sophos Tracker workbook into the it_monitoring table.
//
//   npm run import-it -- "C:\path\to\Sophos Tracker.xlsx" --dry-run     (parse and report only)
//   npm run import-it -- "C:\path\to\Sophos Tracker.xlsx"               (import)
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL.
// Run supabase/it_monitoring.sql in the Supabase SQL Editor first. Refuses to import into a non-empty table.
// The workbook holds employee data: keep it out of the repo (*.xlsx is git-ignored).
//
// Column "No" (a counter) and the column right after "Sophos Email" (a duplicate ID) are skipped.
import readXlsxFile from "read-excel-file/node";
import { createClient } from "@supabase/supabase-js";

const SHEET = "GT - IT Monitoring";
const BATCH = 200;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const xlsxPath = args.find((a) => !a.startsWith("--"));
if (!xlsxPath) {
  console.error('Usage: npm run import-it -- "<path to Sophos Tracker.xlsx>" [--dry-run]');
  process.exit(1);
}

const clean = (v) => (v === null || v === undefined ? "" : String(v)).replace(/\u00a0/g, " ").trim();
const orNull = (v) => clean(v) || null;
const intOrNull = (v) => (/^\d+$/.test(clean(v)) ? Number(clean(v)) : null);
const emailOrNull = (v) => clean(v).toLowerCase() || null;
const dateOrNull = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const t = clean(v);
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

// Returns every sheet as { sheet, data }; pick the one we need.
const book = await readXlsxFile(xlsxPath);
const found = book.find((s) => s.sheet === SHEET);
if (!found) {
  console.error(`Sheet "${SHEET}" not found. Sheets in the file: ${book.map((s) => s.sheet).join(", ")}`);
  process.exit(1);
}
const [header, ...data] = found.data;
const col = (name) => {
  const i = header.findIndex((h) => clean(h) === name);
  if (i < 0) throw new Error(`Column "${name}" not found in sheet "${SHEET}"`);
  return i;
};
const C = Object.fromEntries(
  ["ID Number", "MS 365 Email", "Sophos Email", "Family Name", "First Name", "Middle Name", "Complete Name",
   "Department / Client name", "Division", "Cost Center", "Position", "Status", "Remarks", "Heartcount Status",
   "Date License Removal"].map((n) => [n, col(n)])
);

const adminEmail = process.env.ADMIN_EMAIL;
if (!adminEmail && !dryRun) {
  console.error("Set ADMIN_EMAIL in .env.local. It is recorded as the user who created the imported records.");
  process.exit(1);
}

const STATUSES = ["Active", "Deleted", "Pending", "No Record"];
const HC_STATUSES = ["Active", "Resigned"];
const notes = [];

// Rows with every kept column empty (the sheet has a blank trailing row) are skipped.
const records = [];
data.forEach((r, i) => {
  const get = (name) => r[C[name]];
  if (Object.values(C).every((ci) => !clean(r[ci]))) return;

  const status = orNull(get("Status"));
  const hcStatus = orNull(get("Heartcount Status"));
  if (status && !STATUSES.includes(status)) notes.push(`row ${i + 2}: Status "${status}" is not in the usual list`);
  if (hcStatus && !HC_STATUSES.includes(hcStatus)) notes.push(`row ${i + 2}: Heartcount Status "${hcStatus}" is not in the usual list`);

  records.push({
    id_number: intOrNull(get("ID Number")),
    ms365_email: emailOrNull(get("MS 365 Email")),
    sophos_email: emailOrNull(get("Sophos Email")),
    family_name: orNull(get("Family Name")),
    first_name: orNull(get("First Name")),
    middle_name: orNull(get("Middle Name")),
    complete_name: orNull(get("Complete Name")),
    client_name: orNull(get("Department / Client name")),
    division: orNull(get("Division")),
    cost_center: orNull(get("Cost Center")),
    position: orNull(get("Position")),
    status,
    remarks: orNull(get("Remarks")),
    hc_status: hcStatus,
    date_license_removal: dateOrNull(get("Date License Removal")),
    created_by: adminEmail ?? "(ADMIN_EMAIL)",
  });
});

console.log(`Parsed ${records.length} records from sheet "${SHEET}" of ${xlsxPath}`);
console.log(`  with a removal date: ${records.filter((r) => r.date_license_removal).length}`);
console.log(`  without a complete name: ${records.filter((r) => !r.complete_name).length}`);
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

// (A head-only request hides the error body, so this uses a normal one-row query.)
const { count, error: countError } = await db.from("it_monitoring").select("id", { count: "exact" }).limit(1);
if (countError) {
  const missing = countError.code === "PGRST205" || countError.code === "42P01";
  console.error(
    missing ? "The it_monitoring table doesn't exist. Run supabase/it_monitoring.sql in the Supabase SQL Editor first." : countError.message
  );
  process.exit(1);
}
if (count > 0) {
  console.error(`it_monitoring already has ${count} row(s). Refusing to import again (it would duplicate rows).`);
  process.exit(1);
}

// Sequential batches keep the sheet order, so the newest ID numbers end up with the highest row ids.
let done = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const { error } = await db.from("it_monitoring").insert(records.slice(i, i + BATCH));
  if (error) {
    console.error(`Insert failed after ${done} record(s): ${error.message}`);
    process.exit(1);
  }
  done += Math.min(BATCH, records.length - i);
  console.log(`  imported ${done}/${records.length}`);
}
console.log(`Done. Created by: ${adminEmail}.`);
