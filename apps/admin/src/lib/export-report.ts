import "server-only";
import ExcelJS from "exceljs";
import type { Lang } from "./i18n";
import { newArabicPdf, Writer } from "./export-pdf";
import { PDF_MAX_ROWS } from "./reports";

// Excel and PDF for the Phase 10 reports: a title, a few "label: value" lines, then one table.
// Same Arabic approach as the employee-record export (export-pdf.ts), in Sanad navy.

export type ReportTable = {
  title: string;
  meta: [string, string][];
  columns: { label: string; width: number }[];
  rows: string[][];
  lang: Lang;
};

const NAVY: [number, number, number] = [0.043, 0.102, 0.2]; // #0b1a33

export async function reportToXlsx(t: ReportTable, sheetName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sanad";
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ rightToLeft: t.lang === "ar", state: "frozen", ySplit: t.meta.length + 3 }] });
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  t.meta.forEach((m) => ws.addRow(m));
  ws.addRow([]);
  const header = ws.addRow(t.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFE6C878" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1A33" } };
  t.columns.forEach((c, i) => (ws.getColumn(i + 1).width = Math.max(10, Math.round(c.width * 12))));
  for (const r of t.rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function reportToPdf(t: ReportTable, cutNote: (shown: number, total: number) => string): Promise<Buffer> {
  const { doc, fonts } = await newArabicPdf();
  doc.setTitle(t.title);
  doc.setCreator("Sanad");
  const w = new Writer(doc, fonts, t.lang === "ar", { landscape: true, accent: NAVY });
  w.heading(t.title, 15);
  const muted: [number, number, number] = [0.35, 0.42, 0.52];
  for (const [k, v] of t.meta) {
    w.y -= 2;
    w.line(`${k}: ${v}`, w.margin, w.width - w.margin, w.y, 9, { color: muted });
    w.y -= 13;
  }
  const rows = t.rows.length > PDF_MAX_ROWS ? t.rows.slice(0, PDF_MAX_ROWS) : t.rows;
  if (rows.length < t.rows.length) {
    w.line(cutNote(rows.length, t.rows.length), w.margin, w.width - w.margin, w.y, 9, { bold: true, color: [0.7, 0.25, 0.23] });
    w.y -= 13;
  }
  w.y -= 6;
  w.table(t.columns, rows, "—");
  return Buffer.from(await doc.save());
}
