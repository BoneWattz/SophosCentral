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
