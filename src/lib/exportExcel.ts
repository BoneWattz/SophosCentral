export type ExportValue = string | number | boolean | Date | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportValue;
  width?: number; // in characters
}

// Builds an .xlsx from the rows and downloads it in the browser: bold frozen header row, real dates,
// and text kept as text (a cell like =HYPERLINK(...) is stored as plain text, never as a formula).
export async function downloadXlsx<T>(fileName: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
  // Loaded on demand so the Excel library isn't part of a page's initial download.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const cell = (v: ExportValue) => {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date) return { value: v, format: "yyyy-mm-dd hh:mm" };
    return v;
  };

  const sheetData = [
    columns.map((c) => ({ value: c.header, fontWeight: "bold" as const })),
    ...rows.map((row) => columns.map((c) => cell(c.value(row)))),
  ];

  const day = new Date().toISOString().slice(0, 10);
  await writeXlsxFile(sheetData, {
    columns: columns.map((c) => ({ width: c.width ?? 18 })),
    stickyRowsCount: 1,
  }).toFile(`${fileName}-${day}.xlsx`);
}
