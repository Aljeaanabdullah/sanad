import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { reportToPdf, reportToXlsx, type ReportTable } from "./export-report";
import { COLUMN_WIDTH, KIND_COLUMNS, PDF_MAX_ROWS, reportRowCells, type ReportRow } from "./reports";
import { repT } from "./i18n-rep";

const t = repT("ar");
const row: ReportRow = {
  day: "2026-11-16",
  file_number: 710200,
  name_ar: "محمد عبدالله السالم",
  name_en: "Mohammad Abdullah Al-Salem",
  department_ar: "الموارد البشرية",
  department_en: "Human resources",
  shift_start: "2026-11-16T04:00:00Z",
  status: "late",
  check_in_at: "2026-11-16T05:25:00Z",
  check_out_at: null,
  late_minutes: 25,
  check_in_corrected: false,
  site_ar: "المقر الرئيسي",
  site_en: "Head office",
  leave_type: null,
};

function table(n: number): ReportTable {
  const cells = reportRowCells("late", row, true, { statuses: t.statuses });
  return {
    title: t.exportTitle(t.kinds.late),
    meta: [
      [t.exportPeriod, "2026-11-01 → 2026-11-16"],
      [t.rowsCount, String(n)],
    ],
    columns: KIND_COLUMNS.late.map((k) => ({ label: t.columns[k], width: COLUMN_WIDTH[k] })),
    rows: Array.from({ length: n }, () => cells),
    lang: "ar",
  };
}

describe("report export", () => {
  it("writes an Arabic PDF with the Arabic font embedded", async () => {
    const buf = await reportToPdf(table(40), t.pdfCut);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2); // 40 rows do not fit one landscape page
    expect(doc.getTitle()).toBe("تقرير التأخير");
    const fonts = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o): o is PDFDict => o instanceof PDFDict && String(o.get(PDFName.of("Type"))) === "/Font")
      .map((o) => String(o.get(PDFName.of("BaseFont"))));
    expect(fonts.some((f) => f.includes("IBMPlexSansArabic"))).toBe(true);
  });

  it("cuts a very long PDF and says so, but keeps it valid", async () => {
    const buf = await reportToPdf(table(PDF_MAX_ROWS + 1), t.pdfCut);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBeGreaterThan(100);
  }, 60_000);

  it("writes an Excel sheet, right-to-left, with the Arabic text as is", async () => {
    const buf = await reportToXlsx(table(3), t.kinds.late);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(t.kinds.late)!;
    expect(ws.views[0].rightToLeft).toBe(true);
    expect(ws.getCell("A1").value).toBe("تقرير التأخير");
    const header = ws.getRow(5).values as unknown[];
    expect(header.slice(1)).toEqual(KIND_COLUMNS.late.map((k) => t.columns[k]));
    expect(ws.getRow(6).getCell(3).value).toBe("محمد عبدالله السالم");
    expect(ws.rowCount).toBe(5 + 3);
  });
});
