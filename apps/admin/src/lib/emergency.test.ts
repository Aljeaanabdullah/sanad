import { describe, expect, it } from "vitest";
import {
  accountedPercent,
  countPeople,
  distanceM,
  formatKuwait,
  insideRadius,
  peopleWith,
  REPORT_COLUMNS,
  reportRows,
  reportSummary,
  type Board,
  type BoardPerson,
} from "./emergency";

const person = (over: Partial<BoardPerson>): BoardPerson => ({
  employee_id: crypto.randomUUID(),
  file_number: 710000,
  name_ar: "موظف",
  name_en: "Employee",
  phone: "+96560000000",
  department_ar: "قسم",
  department_en: "Dept",
  status: "unknown",
  responded_at: null,
  lat: null,
  lng: null,
  accuracy_m: null,
  distance_m: null,
  outside_safe: false,
  no_location: false,
  ...over,
});

// Demo site 1: building A and building B (about 140 m apart).
const A = { lat: 29.3794, lng: 47.9886 };
const B = { lat: 29.3785, lng: 47.9896, radius: 30 };

describe("distance and radius", () => {
  it("matches the server's great-circle distance", () => {
    // The SQL proof measured 139.3 m between these two points.
    expect(distanceM(A, B)).toBeCloseTo(139.3, 0);
    expect(distanceM(B, B)).toBe(0);
  });

  it("is inside on the edge and outside just past it", () => {
    expect(insideRadius(B, B)).toBe(true);
    expect(insideRadius(A, B)).toBe(false);
    const edge = { lat: B.lat + 29.9 / 111195, lng: B.lng }; // ~29.9 m north
    expect(insideRadius(edge, B)).toBe(true);
    const past = { lat: B.lat + 30.5 / 111195, lng: B.lng };
    expect(insideRadius(past, B)).toBe(false);
  });
});

describe("counters", () => {
  const people = [
    person({ file_number: 1, status: "arrived" }),
    person({ file_number: 2, status: "arrived", outside_safe: true }),
    person({ file_number: 3, status: "safe_elsewhere" }),
    person({ file_number: 4 }),
    person({ file_number: 5 }),
  ];

  it("counts each status and the flagged arrivals", () => {
    expect(countPeople(people)).toEqual({ total: 5, arrived: 2, safeElsewhere: 1, unknown: 2, flagged: 1 });
  });

  it("gives the share accounted for, never rounding up to 100", () => {
    expect(accountedPercent(countPeople(people))).toBe(60);
    const almost = [...Array(199)].map(() => person({ status: "arrived" })).concat(person({}));
    expect(accountedPercent(countPeople(almost))).toBe(99);
    expect(accountedPercent(countPeople([]))).toBe(0);
  });

  it("lists flagged people first, then by file number", () => {
    expect(peopleWith(people, "arrived").map((p) => p.file_number)).toEqual([2, 1]);
    expect(peopleWith(people, "unknown").map((p) => p.file_number)).toEqual([4, 5]);
  });
});

describe("report rows", () => {
  const people = [
    person({ file_number: 710002, status: "arrived", responded_at: "2026-11-17T06:05:09Z", lat: 29.37851, lng: 47.98961, distance_m: 1.4 }),
    person({ file_number: 710001, name_ar: "سالم", name_en: "Salem", phone: null }),
    person({ file_number: 710003, status: "arrived", outside_safe: true, distance_m: 139.3, lat: 29.3794, lng: 47.9886, responded_at: "2026-11-17T06:06:00Z" }),
    person({ file_number: 710004, status: "safe_elsewhere", no_location: true, responded_at: "2026-11-17T06:07:00Z" }),
  ];

  it("puts unknown first and fills every column in order (Arabic)", () => {
    const rows = reportRows(people, "ar");
    expect(rows.map((r) => r[0])).toEqual(["710001", "710003", "710002", "710004"]);
    expect(rows.every((r) => r.length === REPORT_COLUMNS.length)).toBe(true);
    expect(rows[0]).toEqual(["710001", "سالم", "", "قسم", "لم يُعرف وضعه", "", "", "", ""]);
    // Flagged arrival: distance rounded, "outside" marked, location with 5 decimals; Kuwait time (UTC+3).
    expect(rows[1]).toEqual(["710003", "موظف", "+96560000000", "قسم", "وصل", "09:06:00", "139", "نعم", "29.37940, 47.98860"]);
    expect(rows[3][6]).toBe("بدون موقع");
  });

  it("uses English labels in English", () => {
    const rows = reportRows(people, "en");
    expect(rows[0][4]).toBe("Unknown");
    expect(rows[2][4]).toBe("Arrived");
    expect(rows[3][4]).toBe("Safe elsewhere");
  });

  it("summarises the emergency with counters", () => {
    const board: Board = {
      emergency: {
        id: "e",
        status: "closed",
        hazard: "gas_leak",
        is_drill: true,
        message_ar: null,
        message_en: null,
        started_at: "2026-11-17T06:00:00Z",
        closed_at: "2026-11-17T06:20:00Z",
        target_mode: "site",
        site: { id: "s", name_ar: "الموقع", name_en: "Site", lat: 0, lng: 0, radius: 200 },
        started_by: { file_number: 710018, name_ar: "مشرف", name_en: "Supervisor" },
        closed_by: null,
      },
      buildings: [
        { id: "a", kind: "danger", name_ar: "أ", name_en: "A", ...A, radius: 30 },
        { id: "c", kind: "danger", name_ar: "ج", name_en: "C", ...A, radius: 30 },
        { id: "b", kind: "safe", name_ar: "ب", name_en: "B", ...B },
      ],
      push: { queued: 0, pending: 4 },
      people,
    };
    const labels = {
      site: "site", hazard: "hazard", startedAt: "start", closedAt: "end", startedBy: "by", closedBy: "closer",
      danger: "danger", safe: "safe", drill: "drill",
      counters: { total: "total", arrived: "arrived", safeElsewhere: "safe2", unknown: "unknown", flagged: "flagged" },
    };
    const s = Object.fromEntries(reportSummary(board, "en", labels));
    expect(s.hazard).toBe("Gas leak — drill");
    expect(s.danger).toBe("A, C");
    expect(s.safe).toBe("B");
    expect(s.by).toBe("Supervisor (710018)");
    expect(s.closer).toBe("");
    expect([s.total, s.arrived, s.safe2, s.unknown, s.flagged]).toEqual(["4", "2", "1", "1", "1"]);
    expect(Object.fromEntries(reportSummary(board, "ar", labels)).danger).toBe("أ، ج");
  });
});

describe("Kuwait time", () => {
  it("is 24-hour Kuwait time with Latin digits in both languages", () => {
    expect(formatKuwait("2026-11-17T21:05:09Z", "ar")).toBe("00:05:09");
    expect(formatKuwait("2026-11-17T21:05:09Z", "en", true)).toBe("2026-11-18 00:05:09");
    expect(formatKuwait(null, "ar")).toBe("");
  });
});
