import type { StaffRole } from "./auth";
import type { LiveBucket } from "./reports";

// Home page of the web panel: the overview numbers and the quick links (pure part, testable).

export type QuickLink = "liveBoard" | "approvals" | "reports" | "employees" | "emergencies";

/** Quick links per role: the same pages the side menu gives that role (layout.tsx). */
export function quickLinksFor(role: StaffRole): QuickLink[] {
  const all: QuickLink[] = ["liveBoard", "approvals", "reports", "employees", "emergencies"];
  return all.filter((k) => {
    if (k === "employees") return role === "admin";
    if (k === "emergencies") return role === "admin" || role === "supervisor";
    return true;
  });
}

export const QUICK_LINK_HREF: Record<QuickLink, string> = {
  liveBoard: "/live",
  approvals: "/approvals",
  reports: "/reports",
  employees: "/employees",
  emergencies: "/emergencies",
};

export type TodaySummary = {
  scheduled: number;
  /** Arrived (on time + late). */
  arrived: number;
  onTime: number;
  late: number;
  /** Shift started, no check-in yet, plus shift over with no check-in and no leave. */
  missing: number;
  leave: number;
  upcoming: number;
  /** Shares of the scheduled shifts, 0..100, for the bar (sum is 100 when scheduled > 0). */
  shares: { onTime: number; late: number; missing: number; other: number };
};

/** Today's numbers from the live board counts (same rules as the live board page). */
export function todaySummary(c: Record<LiveBucket, number>): TodaySummary {
  const arrived = c.on_time + c.late;
  const missing = c.not_arrived + c.absent;
  const pct = (n: number) => (c.scheduled > 0 ? Math.round((n / c.scheduled) * 100) : 0);
  const onTime = pct(c.on_time);
  const late = pct(c.late);
  const miss = pct(missing);
  const other = c.scheduled > 0 ? Math.max(0, 100 - onTime - late - miss) : 0;
  return {
    scheduled: c.scheduled,
    arrived,
    onTime: c.on_time,
    late: c.late,
    missing,
    leave: c.leave,
    upcoming: c.upcoming,
    shares: { onTime, late, missing: miss, other },
  };
}

export type BonusSummary = { month: string; total: number; eligible: number; locked: boolean } | null;

/** The latest bonus list: locked only when it has rows and none is still a draft. */
export function bonusSummary(month: string | null, total: number, eligible: number, drafts: number): BonusSummary {
  if (!month || total === 0) return null;
  return { month, total, eligible, locked: drafts === 0 };
}
