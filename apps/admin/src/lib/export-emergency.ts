import "server-only";
import ExcelJS from "exceljs";
import type { Lang } from "./i18n";
import { emgT } from "./i18n-emg";
import { emergencyLabels, formatKuwait, REPORT_COLUMNS, reportRows, reportSummary, type Board } from "./emergency";
import { newPdf, Writer } from "./export-pdf";

// Emergency report (PRD 8.5, 10.1): a summary and one row per targeted employee, in Excel and PDF.
// Same approach as the employee record export: Excel sheets right-to-left in Arabic; the PDF uses the
// shared Writer that lays Arabic out right-to-left with joined letters.

const summaryLabels = (lang: Lang) => {
  const t = emgT(lang);
  return {
    site: t.site,
    hazard: t.hazard,
    startedAt: t.startedAt,
    closedAt: t.closedAt,
    startedBy: t.startedBy,
    closedBy: t.closedBy,
    danger: t.danger,
    safe: t.safe,
    drill: t.drill,
    counters: t.counters,
  };
};

export async function emergencyToXlsx(board: Board, lang: Lang): Promise<Buffer> {
  const t = emgT(lang);
  const L = emergencyLabels(lang);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sanad";
  const view = [{ rightToLeft: lang === "ar" }];
  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1A33" } };
  };

  const summary = wb.addWorksheet(t.reportTitle, { views: view });
  summary.columns = [
    { header: t.reportTitle, width: 34 },
    { header: "", width: 48 },
  ];
  header(summary);
  reportSummary(board, lang, summaryLabels(lang)).forEach((r) => summary.addRow(r));
  summary.addRow([t.exportedAt, formatKuwait(new Date().toISOString(), lang, true)]);

  const people = wb.addWorksheet(t.people, { views: view });
  people.columns = REPORT_COLUMNS.map((k) => ({
    header: L.cols[k],
    key: k,
    width: k === "name" ? 28 : k === "location" ? 26 : 18,
  }));
  header(people);
  const outsideCol = REPORT_COLUMNS.indexOf("outside") + 1;
  reportRows(board.people, lang).forEach((r) => {
    const row = people.addRow(r);
    // Highlight "arrived" pressed outside the safe building (amber).
    if (row.getCell(outsideCol).value) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4D6" } };
    }
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function emergencyToPdf(board: Board, lang: Lang): Promise<Buffer> {
  const t = emgT(lang);
  const L = emergencyLabels(lang);
  const { doc, fonts } = await newPdf();
  const site = lang === "ar" ? board.emergency.site.name_ar : board.emergency.site.name_en;
  doc.setTitle(`${t.reportTitle} — ${site}`);
  doc.setCreator("Sanad");

  const w = new Writer(doc, fonts, lang === "ar");
  w.heading(`${t.reportTitle} — ${L.hazard[board.emergency.hazard]} — ${site}`, 16);
  w.y -= 2;
  w.line(`${t.exportedAt}: ${formatKuwait(new Date().toISOString(), lang, true)}`, w.margin, w.width - w.margin, w.y, 9, {
    color: [0.35, 0.42, 0.52],
  });
  w.y -= 18;

  w.table(
    [
      { label: "", width: 1.3 },
      { label: "", width: 2 },
    ],
    reportSummary(board, lang, summaryLabels(lang)),
    "",
    false,
  );

  w.heading(t.people, 12);
  // The PDF leaves out the coordinates column (it is in the Excel file) so the rest fits on A4.
  const pdfColumns = REPORT_COLUMNS.filter((k) => k !== "location");
  const widths: Record<string, number> = {
    file_number: 50,
    name: 100,
    phone: 84,
    department: 64,
    status: 78,
    responded_at: 48,
    distance: 46,
    outside: 40,
  };
  const keep = pdfColumns.map((k) => REPORT_COLUMNS.indexOf(k));
  w.table(
    pdfColumns.map((k) => ({ label: L.pdfCols[k as keyof typeof L.pdfCols], width: widths[k] })),
    reportRows(board.people, lang).map((r) => keep.map((i) => r[i])),
    t.emptyList,
  );

  return Buffer.from(await doc.save());
}
