// Emergency module (PRD 8): shapes returned by the emergency_board RPC and the pure helpers the
// board, the map and the report use. No server-only imports, so it is unit tested directly.
import type { Lang } from "./i18n";

export type Hazard = "fire" | "gas_leak" | "other";
export type PersonStatus = "arrived" | "safe_elsewhere" | "unknown";
export type TargetMode = "present" | "site" | "department";

type Named = { name_ar: string; name_en: string };

export type BoardBuilding = Named & {
  id: string;
  kind: "danger" | "safe";
  lat: number;
  lng: number;
  radius: number;
};

export type BoardPerson = {
  employee_id: string;
  file_number: number;
  name_ar: string;
  name_en: string;
  phone: string | null;
  department_ar: string | null;
  department_en: string | null;
  status: PersonStatus;
  responded_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  outside_safe: boolean;
  no_location: boolean;
};

export type Board = {
  emergency: {
    id: string;
    status: "active" | "closed";
    hazard: Hazard;
    is_drill: boolean;
    message_ar: string | null;
    message_en: string | null;
    started_at: string;
    closed_at: string | null;
    target_mode: TargetMode | null;
    site: Named & { id: string; lat: number; lng: number; radius: number };
    started_by: (Named & { file_number: number }) | null;
    closed_by: (Named & { file_number: number }) | null;
  };
  buildings: BoardBuilding[];
  push: { queued: number; pending: number };
  people: BoardPerson[];
};

/** Great-circle distance in metres (same formula as the server). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function insideRadius(point: { lat: number; lng: number }, centre: { lat: number; lng: number; radius: number }): boolean {
  return distanceM(point, centre) <= centre.radius;
}

export type Counters = { total: number; arrived: number; safeElsewhere: number; unknown: number; flagged: number };

/** Live counters (PRD 8.5). "flagged" = pressed "arrived" outside the safe building's radius. */
export function countPeople(people: Pick<BoardPerson, "status" | "outside_safe">[]): Counters {
  const c: Counters = { total: people.length, arrived: 0, safeElsewhere: 0, unknown: 0, flagged: 0 };
  for (const p of people) {
    if (p.status === "arrived") c.arrived++;
    else if (p.status === "safe_elsewhere") c.safeElsewhere++;
    else c.unknown++;
    if (p.status === "arrived" && p.outside_safe) c.flagged++;
  }
  return c;
}

/** Share of people accounted for (arrived or safe elsewhere), 0–100, rounded down so 100 means everyone. */
export function accountedPercent(c: Counters): number {
  return c.total === 0 ? 0 : Math.floor(((c.arrived + c.safeElsewhere) * 100) / c.total);
}

/** People of one status, flagged ones first, then by file number. */
export function peopleWith(people: BoardPerson[], status: PersonStatus): BoardPerson[] {
  return people
    .filter((p) => p.status === status)
    .sort((a, b) => Number(b.outside_safe) - Number(a.outside_safe) || a.file_number - b.file_number);
}

const labels = {
  ar: {
    hazard: { fire: "حريق", gas_leak: "تسرب غاز", other: "خطر آخر" },
    status: { arrived: "وصل", safe_elsewhere: "بأمان في مكان آخر", unknown: "لم يُعرف وضعه" },
    yes: "نعم",
    no: "",
    noLocation: "بدون موقع",
    cols: {
      file_number: "رقم الملف",
      name: "الاسم",
      phone: "الجوال",
      department: "القسم",
      status: "الحالة",
      responded_at: "وقت الضغط",
      distance: "البعد عن المبنى الآمن بالمتر",
      outside: "خارج المبنى الآمن",
      location: "الإحداثيات",
    },
    // Short headers for the PDF table (A4 portrait); the Excel sheet keeps the full ones and the coordinates.
    pdfCols: { file_number: "رقم الملف", name: "الاسم", phone: "الجوال", department: "القسم", status: "الحالة", responded_at: "الوقت", distance: "المسافة م", outside: "خارجه" },
  },
  en: {
    hazard: { fire: "Fire", gas_leak: "Gas leak", other: "Other hazard" },
    status: { arrived: "Arrived", safe_elsewhere: "Safe elsewhere", unknown: "Unknown" },
    yes: "Yes",
    no: "",
    noLocation: "No location",
    cols: {
      file_number: "File number",
      name: "Name",
      phone: "Phone",
      department: "Department",
      status: "Status",
      responded_at: "Pressed at",
      distance: "Distance to safe building (m)",
      outside: "Outside safe building",
      location: "Location (lat, lng)",
    },
    pdfCols: { file_number: "File", name: "Name", phone: "Phone", department: "Department", status: "Status", responded_at: "Time", distance: "Metres", outside: "Out" },
  },
};

export const emergencyLabels = (lang: Lang) => labels[lang];

export type ReportColumn = keyof (typeof labels)["ar"]["cols"];
export const REPORT_COLUMNS: ReportColumn[] = [
  "file_number", "name", "phone", "department", "status", "responded_at", "distance", "outside", "location",
];

/**
 * Kuwait time, 24-hour, Latin digits: "09:06:00", or "2026-11-17 09:06:00" with the date.
 * The same in both languages (no direction marks), so it lays out cleanly in tables and the PDF.
 */
export function formatKuwait(iso: string | null, _lang: Lang, withDate = false): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kuwait",
  }).formatToParts(new Date(iso));
  const v = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const time = `${v("hour")}:${v("minute")}:${v("second")}`;
  return withDate ? `${v("year")}-${v("month")}-${v("day")} ${time}` : time;
}

/** One row per person for the Excel / PDF report, in REPORT_COLUMNS order; unknown first. */
export function reportRows(people: BoardPerson[], lang: Lang): string[][] {
  const L = labels[lang];
  const order: PersonStatus[] = ["unknown", "arrived", "safe_elsewhere"];
  return order.flatMap((s) =>
    peopleWith(people, s).map((p) => [
      String(p.file_number),
      lang === "ar" ? p.name_ar : p.name_en,
      p.phone ?? "",
      (lang === "ar" ? p.department_ar : p.department_en) ?? "",
      L.status[p.status],
      formatKuwait(p.responded_at, lang),
      p.distance_m == null ? (p.status !== "unknown" && p.no_location ? L.noLocation : "") : String(Math.round(p.distance_m)),
      p.outside_safe ? L.yes : L.no,
      p.lat == null || p.lng == null ? "" : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    ]),
  );
}

/** Summary lines (label, value) at the top of the report. */
export function reportSummary(board: Board, lang: Lang, t: { site: string; hazard: string; startedAt: string; closedAt: string; startedBy: string; closedBy: string; danger: string; safe: string; drill: string; counters: Record<"total" | "arrived" | "safeElsewhere" | "unknown" | "flagged", string> }): [string, string][] {
  const L = labels[lang];
  const name = (n: Named | null) => (n ? (lang === "ar" ? n.name_ar : n.name_en) : "");
  const e = board.emergency;
  const c = countPeople(board.people);
  const sep = lang === "ar" ? "، " : ", ";
  const who = (p: (Named & { file_number: number }) | null) => (p ? `${name(p)} (${p.file_number})` : "");
  const rows: [string, string][] = [
    [t.site, name(e.site)],
    [t.hazard, L.hazard[e.hazard] + (e.is_drill ? ` — ${t.drill}` : "")],
    [t.danger, board.buildings.filter((b) => b.kind === "danger").map(name).join(sep)],
    [t.safe, board.buildings.filter((b) => b.kind === "safe").map(name).join(sep)],
    [t.startedAt, formatKuwait(e.started_at, lang, true)],
    [t.startedBy, who(e.started_by)],
    [t.closedAt, formatKuwait(e.closed_at, lang, true)],
    [t.closedBy, who(e.closed_by)],
    [t.counters.total, String(c.total)],
    [t.counters.arrived, String(c.arrived)],
    [t.counters.safeElsewhere, String(c.safeElsewhere)],
    [t.counters.unknown, String(c.unknown)],
    [t.counters.flagged, String(c.flagged)],
  ];
  return rows;
}
