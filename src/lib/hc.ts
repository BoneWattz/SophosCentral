// Shared by the HC API route and the HC page.

export interface HcRow {
  no: number;
  idNumber: number | null;
  email: string;
  familyName: string | null;
  firstName: string | null;
  middleName: string | null;
  nameExtension: string | null;
  completeName: string;
  clientId: number | null;
  clientName: string | null;
  division: string | null;
  costCenter: string | null;
  position: string | null;
  status: string | null;
  remarks: string | null;
  dateCreated: string; // YYYY-MM-DD
  addedBy: string;
  dateDeleted: string | null; // YYYY-MM-DD
  deletedBy: string | null;
}

// "2026-10-10" -> "October 10, 2026". Parsed as UTC so the day never shifts with the viewer's timezone.
export function formatLongDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// Today's date in Manila as YYYY-MM-DD (the team's local date, whatever the server's timezone is).
export function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function composeCompleteName(p: {
  firstName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nameExtension?: string | null;
}): string {
  const middleInitial = p.middleName?.trim() ? `${p.middleName.trim()[0].toUpperCase()}.` : "";
  return [p.firstName, middleInitial, p.familyName, p.nameExtension]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
