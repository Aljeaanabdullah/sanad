import { describe, expect, it } from "vitest";
import {
  chunkRange,
  filterQuery,
  groupLive,
  KIND_COLUMNS,
  kuwaitDate,
  kuwaitDayBounds,
  kuwaitTime,
  parseReportFilters,
  punchRowCells,
  rangeDays,
  reportRowCells,
  type PunchRow,
  type ReportRow,
  type ShiftStatus,
} from "./reports";
import { repT } from "./i18n-rep";

const TODAY = "2026-11-17";

describe("live board buckets", () => {
  const row = (status: ShiftStatus, checked_out = false) => ({ status, checked_out });

  it("splits everyone into one status each, and counts check-outs among those who arrived", () => {
    const rows = [
      row("on_time"),
      row("on_time", true),
      row("late", true),
      row("late"),
      row("late"),
      row("not_arrived"),
      row("absent"),
      row("leave"),
      row("upcoming"),
      row("upcoming"),
    ];
    const { counts, lists } = groupLive(rows);
    expect(counts).toEqual({
      scheduled: 10,
      on_time: 2,
      late: 3,
      not_arrived: 1,
      absent: 1,
      leave: 1,
      upcoming: 2,
      checked_out: 2,
    });
    const split = counts.on_time + counts.late + counts.not_arrived + counts.absent + counts.leave + counts.upcoming;
    expect(split).toBe(counts.scheduled);
    expect(lists.checked_out.every((r) => r.status === "on_time" || r.status === "late")).toBe(true);
  });

  it("gives zero for every bucket when nobody is scheduled", () => {
    const { counts } = groupLive([]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe("report filters", () => {
  it("defaults to the daily report for today", () => {
    expect(parseReportFilters({}, TODAY)).toEqual({
      filters: { kind: "daily", from: TODAY, to: TODAY, department: null, site: null, file: null, page: 1 },
      error: null,
    });
  });

  it("accepts a 31-day range and refuses 32 days", () => {
    expect(parseReportFilters({ from: "2026-10-17", to: "2026-11-16" }, TODAY).error).toBeNull();
    const bad = parseReportFilters({ from: "2026-10-16", to: "2026-11-16" }, TODAY);
    expect(bad.error).toBe("range_too_long");
    expect(bad.filters.to).toBe(bad.filters.from); // falls back to a single day
  });

  it("refuses reversed ranges, future dates, impossible dates and bad file numbers", () => {
    expect(parseReportFilters({ from: "2026-11-10", to: "2026-11-01" }, TODAY).error).toBe("range_order");
    expect(parseReportFilters({ from: "2026-11-10", to: "2026-11-18" }, TODAY).error).toBe("future");
    expect(parseReportFilters({ from: "2026-02-30" }, TODAY).error).toBe("bad_date");
    expect(parseReportFilters({ file: "12345" }, TODAY).error).toBe("bad_file");
  });

  it("keeps valid ids and file numbers and drops anything else", () => {
    const id = "6f1c2a7e-1b2c-4d5e-8f90-123456789abc";
    const { filters } = parseReportFilters({ kind: "late", dept: id, site: "x' or 1=1", file: "710200", page: "3" }, TODAY);
    expect(filters).toMatchObject({ kind: "late", department: id, site: null, file: 710200, page: 3 });
    expect(parseReportFilters({ kind: "salaries" }, TODAY).filters.kind).toBe("daily");
  });

  it("builds links that keep the filters", () => {
    expect(filterQuery({ kind: "absent", from: "2026-11-01", to: "2026-11-16", department: null, file: 710200, page: 1 })).toBe(
      "kind=absent&from=2026-11-01&to=2026-11-16&file=710200",
    );
  });
});

describe("dates in Kuwait time", () => {
  it("counts days and splits long periods into 7-day pieces", () => {
    expect(rangeDays("2026-10-17", "2026-11-16")).toBe(31);
    expect(chunkRange("2026-10-17", "2026-11-16")).toEqual([
      ["2026-10-17", "2026-10-23"],
      ["2026-10-24", "2026-10-30"],
      ["2026-10-31", "2026-11-06"],
      ["2026-11-07", "2026-11-13"],
      ["2026-11-14", "2026-11-16"],
    ]);
    expect(chunkRange("2026-11-16", "2026-11-16")).toEqual([["2026-11-16", "2026-11-16"]]);
  });

  it("uses Kuwait time (UTC+3) for dates, times and day bounds", () => {
    expect(kuwaitDate(new Date("2026-11-16T22:30:00Z"))).toBe("2026-11-17");
    expect(kuwaitTime("2026-11-16T04:05:00Z")).toBe("07:05");
    expect(kuwaitTime(null)).toBe("");
    expect(kuwaitDayBounds("2026-11-01", "2026-11-16")).toEqual({
      start: "2026-10-31T21:00:00.000Z",
      end: "2026-11-16T21:00:00.000Z",
    });
  });
});

describe("report rows -> export rows", () => {
  const base: ReportRow = {
    day: "2026-11-16",
    employee_id: "e1",
    file_number: 710200,
    name_ar: "محمد سالم",
    name_en: "Mohammad Salem",
    department_ar: "العمليات",
    department_en: "Operations",
    shift_start: "2026-11-16T04:00:00Z",
    status: "late",
    check_in_at: "2026-11-16T05:25:00Z",
    check_out_at: "2026-11-16T12:10:00Z",
    late_minutes: 25,
    check_in_corrected: false,
    site_ar: "المقر الرئيسي",
    site_en: "Head office",
    leave_type: null,
  };

  it("gives one cell per column, in column order, in Arabic", () => {
    const t = repT("ar");
    const cells = reportRowCells("daily", base, true, { statuses: t.statuses });
    expect(cells).toHaveLength(KIND_COLUMNS.daily.length);
    expect(cells).toEqual([
      "2026-11-16",
      "710200",
      "محمد سالم",
      "العمليات",
      "07:00",
      "08:25",
      "15:10",
      "25",
      "المقر الرئيسي",
      "متأخر",
    ]);
  });

  it("uses English names and only the columns of each report", () => {
    const t = repT("en");
    const L = { statuses: t.statuses };
    expect(reportRowCells("late", base, false, L)).toEqual([
      "2026-11-16",
      "710200",
      "Mohammad Salem",
      "Operations",
      "07:00",
      "08:25",
      "25",
      "Head office",
    ]);
    const absent = { ...base, status: "absent" as const, check_in_at: null, check_out_at: null, late_minutes: 0 };
    expect(reportRowCells("absent", absent, false, L)).toEqual(["2026-11-16", "710200", "Mohammad Salem", "Operations", "07:00", "Head office"]);
  });

  it("marks a corrected check-in", () => {
    const t = repT("ar");
    const cells = reportRowCells("late", { ...base, check_in_corrected: true }, true, { statuses: t.statuses });
    expect(cells[5]).toBe("08:25*");
  });

  it("turns a punch into a row of the punch log", () => {
    const t = repT("ar");
    const p: PunchRow = {
      id: "p1",
      punched_at: "2026-11-16T21:30:00Z",
      punch_type: "check_in",
      result: "rejected",
      reject_reason: "outside_geofence",
      photo_path: "x.jpg",
      source: null,
      site: { name_ar: "المقر الرئيسي", name_en: "Head office" },
      employee: {
        id: "e1",
        file_number: 710200,
        full_name_ar: "محمد سالم",
        full_name_en: "Mohammad Salem",
        department: { name_ar: "العمليات", name_en: "Operations" },
      },
    };
    expect(punchRowCells(p, true, { punchTypes: t.punchTypes, results: t.results })).toEqual([
      "2026-11-17",
      "00:30",
      "710200",
      "محمد سالم",
      "العمليات",
      "حضور",
      "مرفوضة",
      "outside_geofence",
      "المقر الرئيسي",
    ]);
  });
});
