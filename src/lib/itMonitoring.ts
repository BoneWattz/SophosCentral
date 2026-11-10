// Shared by the GT - IT Monitoring API route and page.

export interface ItRow {
  id: number;
  idNumber: number | null;
  ms365Email: string | null;
  sophosEmail: string | null;
  familyName: string | null;
  firstName: string | null;
  middleName: string | null;
  completeName: string | null;
  clientName: string | null;
  division: string | null;
  costCenter: string | null;
  position: string | null;
  status: string | null;
  remarks: string | null;
  hcStatus: string | null;
  dateLicenseRemoval: string | null; // YYYY-MM-DD
}

// The drop-down lists the Excel sheet uses.
export const STATUS_OPTIONS = ["Active", "Deleted", "Pending", "No Record"];
export const HC_STATUS_OPTIONS = ["Active", "Resigned"];

// What the form sends: every field as text.
export type ItInput = {
  [K in keyof Omit<ItRow, "id">]: string;
};

export const lowerEmail = (v: string | null | undefined) => v?.trim().toLowerCase() || null;

// The sheet can hold the same person more than once (same MS 365 email, sometimes a different Sophos email).
// Groups such records together, keeping the sheet order (newest first) of each person's first record.
export function groupByPerson(employees: ItRow[]): ItRow[][] {
  const groups = new Map<string, ItRow[]>();
  for (const e of employees) {
    const key = lowerEmail(e.ms365Email) ?? lowerEmail(e.sophosEmail) ?? `id:${e.id}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return Array.from(groups.values());
}

// First non-empty value of a field across one person's records.
export function firstValue<K extends keyof ItRow>(group: ItRow[], key: K): ItRow[K] | null {
  return group.map((e) => e[key]).find((v) => v !== null && v !== "") ?? null;
}

// email (MS 365 or Sophos, any record of the person) -> index of the person owning it. MS 365 emails take priority.
export function ownerIndex(people: ItRow[][]): Map<string, number> {
  const owner = new Map<string, number>();
  for (const field of ["ms365Email", "sophosEmail"] as const) {
    people.forEach((g, i) => {
      for (const e of g) {
        const m = lowerEmail(e[field]);
        if (m && !owner.has(m)) owner.set(m, i);
      }
    });
  }
  return owner;
}
