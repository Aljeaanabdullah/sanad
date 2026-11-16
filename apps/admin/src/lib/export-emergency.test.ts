import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { emergencyToPdf, emergencyToXlsx } from "./export-emergency";
import type { Board } from "./emergency";

const board: Board = {
  emergency: {
    id: "11111111-2222-3333-4444-555555555555",
    status: "closed",
    hazard: "fire",
    is_drill: true,
    message_ar: "اخرجوا من البوابة الشرقية",
    message_en: null,
    started_at: "2026-11-17T06:00:00Z",
    closed_at: "2026-11-17T06:12:00Z",
    target_mode: "present",
    site: { id: "s", name_ar: "موقع تجريبي ١ — شرق", name_en: "Demo site 1", lat: 29.379, lng: 47.989, radius: 200 },
    started_by: { file_number: 710018, name_ar: "مشرف القسم", name_en: "Supervisor" },
    closed_by: { file_number: 735043, name_ar: "مدير النظام", name_en: "Admin" },
  },
  buildings: [
    { id: "a", kind: "danger", name_ar: "المبنى أ", name_en: "Building A", lat: 29.3794, lng: 47.9886, radius: 30 },
    { id: "b", kind: "safe", name_ar: "المبنى ب", name_en: "Building B", lat: 29.3785, lng: 47.9896, radius: 30 },
  ],
  push: { queued: 3, pending: 0 },
  people: [
    { employee_id: "1", file_number: 719000, name_ar: "عبدالله احمد", name_en: "Abdullah Ahmed", phone: "+96560000661", department_ar: "المالية", department_en: "Finance", status: "arrived", responded_at: "2026-11-17T06:04:00Z", lat: 29.3794, lng: 47.9886, accuracy_m: 8, distance_m: 139.3, outside_safe: true, no_location: false },
    { employee_id: "2", file_number: 710001, name_ar: "سالم علي", name_en: "Salem Ali", phone: null, department_ar: null, department_en: null, status: "unknown", responded_at: null, lat: null, lng: null, accuracy_m: null, distance_m: null, outside_safe: false, no_location: false },
    { employee_id: "3", file_number: 710002, name_ar: "مريم", name_en: "Maryam", phone: "+96550000000", department_ar: "الموارد", department_en: "HR", status: "safe_elsewhere", responded_at: "2026-11-17T06:05:00Z", lat: null, lng: null, accuracy_m: null, distance_m: null, outside_safe: false, no_location: true },
  ],
};

describe("emergency report export", () => {
  it("writes an Arabic right-to-left workbook with the summary and every person", async () => {
    const buf = await emergencyToXlsx(board, "ar");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const [summary, people] = wb.worksheets;
    expect(summary.views[0].rightToLeft).toBe(true);
    expect(summary.getColumn(2).values).toContain("موقع تجريبي ١ — شرق");
    expect(summary.getColumn(2).values).toContain("حريق — تجربة إخلاء");
    expect(people.rowCount).toBe(4); // header + 3
    expect(people.getRow(2).getCell(1).value).toBe("710001"); // unknown first
    expect(people.getRow(3).getCell(8).value).toBe("نعم"); // flagged arrival
  });

  it("writes a PDF in both languages", async () => {
    for (const lang of ["ar", "en"] as const) {
      const buf = await emergencyToPdf(board, lang);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(5000);
    }
  });
});
