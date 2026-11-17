import { describe, expect, it } from "vitest";
import { bonusSummary, quickLinksFor, todaySummary } from "./home";

const zero = { scheduled: 0, on_time: 0, late: 0, not_arrived: 0, absent: 0, leave: 0, upcoming: 0, checked_out: 0 };

describe("home quick links", () => {
  it("follow the side menu of each role", () => {
    expect(quickLinksFor("admin")).toEqual(["liveBoard", "approvals", "reports", "employees", "emergencies"]);
    expect(quickLinksFor("supervisor")).toEqual(["liveBoard", "approvals", "reports", "emergencies"]);
    expect(quickLinksFor("hr")).toEqual(["liveBoard", "approvals", "reports"]);
  });
});

describe("todaySummary", () => {
  it("adds arrived and missing, and the bar shares add up to 100", () => {
    const s = todaySummary({ ...zero, scheduled: 10, on_time: 5, late: 2, not_arrived: 1, absent: 1, leave: 1 });
    expect(s.arrived).toBe(7);
    expect(s.missing).toBe(2);
    expect(s.shares).toEqual({ onTime: 50, late: 20, missing: 20, other: 10 });
  });
  it("has no shares without shifts", () => {
    expect(todaySummary(zero).shares).toEqual({ onTime: 0, late: 0, missing: 0, other: 0 });
  });
});

describe("bonusSummary", () => {
  it("is empty without a list", () => {
    expect(bonusSummary(null, 0, 0, 0)).toBeNull();
    expect(bonusSummary("2026-10", 0, 0, 0)).toBeNull();
  });
  it("is locked only when no row is a draft", () => {
    expect(bonusSummary("2026-10", 30, 25, 0)).toEqual({ month: "2026-10", total: 30, eligible: 25, locked: true });
    expect(bonusSummary("2026-10", 30, 25, 3)?.locked).toBe(false);
  });
});
