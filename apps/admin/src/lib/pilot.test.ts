import { describe, expect, it } from "vitest";
import { fillDays, firstOkVerdict, parsePilotFilters, percent, pilotQuery, reasonLabel, seconds, share } from "./pilot";

describe("pilot metrics helpers", () => {
  it("opens on the last 14 days when no date is given", () => {
    const { filters, error } = parsePilotFilters({}, "2026-11-17");
    expect(error).toBeNull();
    expect(filters).toEqual({ from: "2026-11-04", to: "2026-11-17", department: null, site: null });
  });

  it("keeps the chosen dates and refuses a range over 31 days", () => {
    expect(parsePilotFilters({ from: "2026-11-10", to: "2026-11-12" }, "2026-11-17").filters.from).toBe("2026-11-10");
    expect(parsePilotFilters({ from: "2026-09-01", to: "2026-11-12" }, "2026-11-17").error).toBe("range_too_long");
    expect(parsePilotFilters({ from: "2026-11-10", to: "2026-11-30" }, "2026-11-17").error).toBe("future");
  });

  it("builds the export query without empty filters", () => {
    expect(pilotQuery({ from: "2026-11-04", to: "2026-11-17", department: null, site: null })).toBe("from=2026-11-04&to=2026-11-17");
  });

  it("shares, percents and seconds", () => {
    expect(share(3, 0)).toBeNull();
    expect(percent(share(19, 20))).toBe("95.0%");
    expect(percent(1)).toBe("100%");
    expect(percent(null)).toBe("—");
    expect(seconds(1450, "s")).toBe("1.4 s");
    expect(seconds(null, "s")).toBe("—");
  });

  it("judges first-attempt success against 95% and the 90% stop line", () => {
    expect(firstOkVerdict(0.96)).toBe("ok");
    expect(firstOkVerdict(0.95)).toBe("ok");
    expect(firstOkVerdict(0.92)).toBe("warn");
    expect(firstOkVerdict(0.89)).toBe("danger");
    expect(firstOkVerdict(null)).toBe("none");
  });

  it("fills days without punches with zeros", () => {
    const days = fillDays({ from: "2026-11-10", to: "2026-11-12", days: [{ day: "2026-11-11", accepted: 4, rejected: 1 }] });
    expect(days).toEqual([
      { day: "2026-11-10", accepted: 0, rejected: 0 },
      { day: "2026-11-11", accepted: 4, rejected: 1 },
      { day: "2026-11-12", accepted: 0, rejected: 0 },
    ]);
  });

  it("falls back to the code for an unknown reason", () => {
    expect(reasonLabel({ weak_gps: "Weak" }, "weak_gps")).toBe("Weak");
    expect(reasonLabel({}, "new_reason")).toBe("new_reason");
  });
});
