import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { toRuns } from "./export-pdf";

describe("PDF text runs", () => {
  it("keeps Arabic words together and separates Latin text", () => {
    expect(toRuns("محمد سالم 710013")).toEqual([
      { text: "محمد سالم", arabic: true },
      { text: "710013", arabic: false },
    ]);
  });

  it("puts punctuation stuck to an Arabic word in its own Latin run", () => {
    expect(toRuns("تاريخ التصدير: 2026-11-09 17:16")).toEqual([
      { text: "تاريخ التصدير", arabic: true },
      { text: ":", arabic: false },
      { text: "2026-11-09 17:16", arabic: false },
    ]);
  });

  it("puts the shortening mark after an Arabic word in the Latin font (the Arabic font has no glyph for it)", () => {
    expect(toRuns("بأمان في مكا…")).toEqual([
      { text: "بأمان في مكا", arabic: true },
      { text: "…", arabic: false },
    ]);
  });
});
