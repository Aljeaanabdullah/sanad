import { describe, expect, it } from "vitest";
import {
  authorText, canManageIdeas, canRevealAuthor, daysLeft, deadlineOf, ideaError, IDEA_STATUSES, needsReason, nextStatuses, normaliseStats,
  parseFilter, statusTone,
} from "./ideas";
import { ideasText } from "./i18n-ideas";

const now = new Date("2026-11-17T09:00:00Z");

describe("who may do what", () => {
  it("only HR and the system admin manage ideas; only the admin reveals", () => {
    expect(["employee", "supervisor", "hr", "admin"].filter(canManageIdeas)).toEqual(["hr", "admin"]);
    expect(["employee", "supervisor", "hr", "admin"].filter(canRevealAuthor)).toEqual(["admin"]);
  });
});

describe("anonymity on the panel", () => {
  const row = { is_anonymous: true, author_name_ar: null, author_name_en: null, author_file_number: null };
  it("anonymous ideas never show a name, even if one were sent", () => {
    expect(authorText(row, "ar", "بدون اسم", "?")).toBe("بدون اسم");
    expect(authorText({ ...row, author_name_ar: "سالم", author_file_number: 710001 }, "ar", "بدون اسم", "?")).toBe("بدون اسم");
  });
  it("named ideas show name and file number; a deleted author shows a neutral label", () => {
    expect(authorText({ ...row, is_anonymous: false, author_name_en: "Salem", author_file_number: 710001 }, "en", "Anonymous", "Former")).toBe("Salem · 710001");
    expect(authorText({ ...row, is_anonymous: false }, "en", "Anonymous", "Former")).toBe("Former");
  });
});

describe("status changes (same rule as the database)", () => {
  it("forward only, rejected from any open status, nothing after the end", () => {
    expect(nextStatuses("published")).toEqual(["under_study", "accepted", "in_progress", "implemented", "rejected"]);
    expect(nextStatuses("awaiting_response")).toEqual(["under_study", "accepted", "in_progress", "implemented", "rejected"]);
    expect(nextStatuses("accepted")).toEqual(["in_progress", "implemented", "rejected"]);
    expect(nextStatuses("in_progress")).toEqual(["implemented", "rejected"]);
    for (const s of ["new", "implemented", "rejected", "review_rejected"] as const) expect(nextStatuses(s)).toEqual([]);
  });
  it("rejection needs a reason", () => {
    expect(IDEA_STATUSES.filter(needsReason)).toEqual(["rejected"]);
  });
  it("every status has a tone and both texts", () => {
    for (const s of IDEA_STATUSES) {
      expect(statusTone(s)).toBeTruthy();
      expect(ideasText.ar.statuses[s]).toBeTruthy();
      expect(ideasText.en.statuses[s]).toBeTruthy();
    }
    expect(statusTone("awaiting_response")).toBe("warn");
  });
});

describe("deadlines: review 2 days, reply 14 days", () => {
  it("days left, and late in red", () => {
    expect(daysLeft("2026-11-30T09:00:00Z", now)).toBe(13);
    expect(daysLeft("2026-11-17T10:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-11-15T08:00:00Z", now)).toBe(-3);
    expect(daysLeft(null, now)).toBeNull();
  });
  it("the deadline that matters depends on the status", () => {
    expect(deadlineOf({ status: "new", review_due_at: "2026-11-16T09:00:00Z", response_due_at: null }, now)).toEqual({ kind: "review", days: -1, overdue: true });
    expect(deadlineOf({ status: "awaiting_response", review_due_at: "2026-11-01T00:00:00Z", response_due_at: "2026-11-20T09:00:00Z" }, now))
      .toEqual({ kind: "response", days: 3, overdue: false });
    expect(deadlineOf({ status: "under_study", review_due_at: "2026-11-01T00:00:00Z", response_due_at: "2026-11-10T09:00:00Z" }, now)).toBeNull();
  });
  it("texts say late plainly", () => {
    expect(ideasText.ar.responseDue(-2)).toBe("تأخر الرد 2 يوم");
    expect(ideasText.en.reviewDue(1)).toBe("Review within 1 day(s)");
  });
});

describe("stats, filters, errors", () => {
  it("normalises the stats payload", () => {
    const s = normaliseStats({ submitted: 9, implemented: 2, overdue: 1, by_category: { safety: { submitted: 3, implemented: 1 }, bogus: { submitted: 9 } } });
    expect(s.submitted).toBe(9);
    expect(s.waiting_review).toBe(0);
    expect(s.by_category).toEqual({ safety: { submitted: 3, implemented: 1 } });
    expect(normaliseStats(null).submitted).toBe(0);
  });
  it("unknown filter falls back to the review queue", () => {
    expect(parseFilter("overdue")).toBe("overdue");
    expect(parseFilter("drop table")).toBe("review");
    expect(parseFilter(undefined)).toBe("review");
  });
  it("maps server errors to texts", () => {
    expect(ideaError("reason_required")).toBe("reason_required");
    expect(ideaError("something else")).toBe("generic");
    for (const k of ["not_allowed", "reason_required", "idea_status_invalid", "idea_not_anonymous", "generic"]) {
      expect(ideasText.ar.errors[k]).toBeTruthy();
      expect(ideasText.en.errors[k]).toBeTruthy();
    }
  });
});
