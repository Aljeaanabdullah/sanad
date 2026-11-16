import { describe, expect, it } from "vitest";
import {
  REDACTED,
  diffEntry,
  diffText,
  filtersToQuery,
  formatValue,
  isSecretField,
  kuwaitDayRange,
  parseAuditFilters,
  recordName,
  redactData,
  safeIds,
  subjectEmployeeId,
  summarize,
  tableLabel,
  actionLabel,
  fieldLabel,
  type AuditEntry,
} from "./audit-log";
import { auditText } from "./i18n-audit";

const ar = auditText.ar;
const en = auditText.en;
const EMP = "39fb6c9d-ee9d-42fb-9f56-f856d524614f";

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  actor_user_id: null,
  action: "update",
  table_name: "employees",
  record_id: EMP,
  old_data: null,
  new_data: null,
  created_at: "2026-11-16T22:03:17Z",
  ...over,
});

describe("parseAuditFilters", () => {
  it("reads valid filters", () => {
    const { filters, invalid } = parseAuditFilters({
      from: "2026-11-01",
      to: "2026-11-16",
      actor: "735043",
      employee: "719000",
      table: "devices",
      action: "export",
      before: "5400",
    });
    expect(invalid).toBe(false);
    expect(filters).toEqual({
      from: "2026-11-01",
      to: "2026-11-16",
      actor: 735043,
      employee: 719000,
      table: "devices",
      action: "export",
      before: 5400,
    });
  });

  it("drops bad values and reports them", () => {
    const { filters, invalid } = parseAuditFilters({
      from: "2026-02-30",
      actor: "12",
      employee: "abc",
      table: "auth.users",
      action: "drop",
    });
    expect(invalid).toBe(true);
    expect(filters).toEqual({});
  });

  it("ignores empty values, swaps a reversed range, takes the first of repeated keys", () => {
    const { filters, invalid } = parseAuditFilters({ from: "2026-11-16", to: "2026-11-01", table: ["sites", "x"], actor: "" });
    expect(invalid).toBe(false);
    expect(filters).toEqual({ from: "2026-11-01", to: "2026-11-16", table: "sites" });
  });

  it("system-only is ignored when an actor is given; before wins over after", () => {
    expect(parseAuditFilters({ system: "1" }).filters).toEqual({ system: true });
    expect(parseAuditFilters({ system: "1", actor: "735043" }).filters).toEqual({ actor: 735043 });
    expect(parseAuditFilters({ before: "10", after: "20" }).filters).toEqual({ before: 10 });
    expect(parseAuditFilters({ after: "20" }).filters).toEqual({ after: 20 });
    expect(parseAuditFilters({ before: "1; drop" }).filters).toEqual({});
  });

  it("accepts URLSearchParams (export route) and round-trips with filtersToQuery", () => {
    const q = "?from=2026-11-01&actor=735043&employee=719000&table=employees&action=update";
    const { filters } = parseAuditFilters(new URLSearchParams(q));
    expect(filtersToQuery(filters)).toBe(q);
    expect(filtersToQuery(filters, { before: 99 })).toBe(`${q}&before=99`);
    expect(filtersToQuery({})).toBe("");
    expect(filtersToQuery({ system: true }, { after: 5 })).toBe("?system=1&after=5");
  });
});

describe("kuwaitDayRange", () => {
  it("turns Kuwait days into UTC instants, end exclusive", () => {
    expect(kuwaitDayRange("2026-11-16", "2026-11-16")).toEqual({
      gte: "2026-11-15T21:00:00.000Z",
      lt: "2026-11-16T21:00:00.000Z",
    });
    expect(kuwaitDayRange()).toEqual({});
  });
});

describe("redaction", () => {
  it("hides device keys, identifiers and face data, keeps harmless flags", () => {
    for (const k of ["public_key", "key_attestation", "device_identifier", "embedding", "face_descriptor", "refresh_token", "api_key"]) {
      expect(isSecretField(k)).toBe(true);
    }
    for (const k of ["must_change_password", "key_attested", "key_registered_at", "model", "phone", "full_name_ar"]) {
      expect(isSecretField(k)).toBe(false);
    }
  });

  it("redactData replaces non-empty secrets only", () => {
    expect(redactData({ public_key: "MIIB...", key_attestation: null, model: "SM-F956B" })).toEqual({
      public_key: "[hidden]",
      key_attestation: null,
      model: "SM-F956B",
    });
    expect(redactData(null)).toBeNull();
  });
});

describe("diffEntry", () => {
  it("update: only changed fields, without updated_at", () => {
    const rows = diffEntry(
      entry({
        old_data: { id: EMP, role: "employee", must_change_password: true, updated_at: "a" },
        new_data: { id: EMP, role: "employee", must_change_password: false, updated_at: "b" },
      }),
    );
    expect(rows).toEqual([{ key: "must_change_password", before: true, after: false, secret: false }]);
  });

  it("update of a secret field shows that it changed but not the values", () => {
    const rows = diffEntry(
      entry({
        table_name: "devices",
        old_data: { public_key: null, key_attested: false },
        new_data: { public_key: "MIIBIjANBg", key_attested: true },
      }),
    );
    expect(rows).toEqual([
      { key: "key_attested", before: false, after: true, secret: false },
      { key: "public_key", before: null, after: REDACTED, secret: true },
    ]);
    expect(JSON.stringify(rows.map((r) => formatValue(en, r.after)))).not.toContain("MIIB");
  });

  it("insert / delete / export list the row's fields", () => {
    const ins = diffEntry(entry({ action: "insert", table_name: "devices", new_data: { id: "x", model: "A", device_identifier: "dev-1" } }));
    expect(ins).toEqual([
      { key: "device_identifier", before: null, after: REDACTED, secret: true },
      { key: "model", before: null, after: "A", secret: false },
    ]);
    const del = diffEntry(entry({ action: "delete", old_data: { name_ar: "موقع", created_at: "x" } }));
    expect(del).toEqual([{ key: "name_ar", before: "موقع", after: null, secret: false }]);
    const exp = diffEntry(entry({ action: "export_pdf", new_data: { file_number: 719000 } }));
    expect(exp).toEqual([{ key: "file_number", before: null, after: 719000, secret: false }]);
  });

  it("handles missing data and compares nested values", () => {
    expect(diffEntry(entry({ action: "update" }))).toEqual([]);
    const rows = diffEntry(entry({ old_data: { photo_paths: ["a"] }, new_data: { photo_paths: ["a", "b"] } }));
    expect(rows.map((r) => r.key)).toEqual(["photo_paths"]);
  });
});

describe("text", () => {
  it("formatValue", () => {
    expect(formatValue(ar, null)).toBe("—");
    expect(formatValue(ar, "")).toBe("—");
    expect(formatValue(ar, true)).toBe("نعم");
    expect(formatValue(en, false)).toBe("No");
    expect(formatValue(en, REDACTED)).toBe("•••• (hidden)");
    expect(formatValue(en, ["a", "b"])).toBe('["a","b"]');
    expect(formatValue(en, "x".repeat(200), 10)).toBe("xxxxxxxxxx…");
    expect(formatValue(en, 719000)).toBe("719000");
  });

  it("summarize", () => {
    const upd = entry({
      old_data: { role: "employee", phone: "1", job_title: "a", hire_date: "x", is_active: true, updated_at: "a" },
      new_data: { role: "hr", phone: "2", job_title: "b", hire_date: "y", is_active: false, updated_at: "b" },
    });
    expect(summarize(en, upd)).toBe("Changed: Hire date, Active, Job title, Phone +1 more");
    expect(summarize(ar, upd, 10)).toBe("تعديل: تاريخ التعيين، فعّال، المسمى الوظيفي، الهاتف، الدور");
    expect(summarize(en, entry({ old_data: { updated_at: "a" }, new_data: { updated_at: "b" } }))).toBe(
      "Changed, no visible difference",
    );
    expect(summarize(ar, entry({ action: "insert" }))).toBe("إضافة");
    expect(summarize(en, entry({ action: "delete" }))).toBe("Deleted");
    expect(summarize(en, entry({ action: "export_xlsx" }))).toBe("Downloaded employee file (Excel)");
    expect(summarize(en, entry({ action: "export_audit", new_data: { rows: 42 } }))).toBe("Exported the audit log (42 rows)");
    expect(summarize(en, entry({ action: "something_new" }))).toBe("something_new");
  });

  it("diffText for the export never contains a secret", () => {
    const e = entry({
      table_name: "devices",
      old_data: { model: "A", public_key: "OLD-KEY" },
      new_data: { model: "B", public_key: "NEW-KEY" },
    });
    const s = diffText(en, e);
    expect(s).toBe("Model: A → B; Public key: •••• (hidden) → •••• (hidden)");
    expect(s).not.toMatch(/KEY/);
    expect(diffText(en, entry({ action: "insert", new_data: { model: "A" } }))).toBe("Model: A");
  });

  it("labels fall back to the raw name", () => {
    expect(tableLabel(ar, "employees")).toBe("الموظفون");
    expect(tableLabel(en, "face_templates")).toBe("Face templates");
    expect(tableLabel(en, "new_table")).toBe("new_table");
    expect(actionLabel(ar, "delete")).toBe("حذف");
    expect(actionLabel(en, "export_audit")).toBe("Export log");
    expect(actionLabel(en, "truncate")).toBe("truncate");
    expect(fieldLabel(ar, "must_change_password")).toBe("يجب تغيير كلمة المرور");
    expect(fieldLabel(en, "weird_col")).toBe("weird_col");
  });

  it("every table and action filter has a label in both languages", async () => {
    const { TABLE_FILTERS, ACTION_FILTERS } = await import("./audit-log");
    for (const t of [ar, en]) {
      for (const k of TABLE_FILTERS) expect(t.tables[k]).toBeTruthy();
      for (const k of ACTION_FILTERS) expect(t.actions[k]).toBeTruthy();
    }
    expect(Object.keys(en.fields).sort()).toEqual(Object.keys(ar.fields).sort());
  });
});

describe("subjects and ids", () => {
  it("subjectEmployeeId", () => {
    expect(subjectEmployeeId(entry({}))).toBe(EMP);
    expect(subjectEmployeeId(entry({ table_name: "devices", record_id: "d", new_data: { employee_id: EMP } }))).toBe(EMP);
    expect(subjectEmployeeId(entry({ table_name: "consents", action: "delete", old_data: { employee_id: EMP } }))).toBe(EMP);
    expect(subjectEmployeeId(entry({ table_name: "sites", record_id: "s", new_data: { name_ar: "x" } }))).toBeNull();
  });

  it("recordName", () => {
    expect(recordName(entry({ table_name: "sites", new_data: { name_ar: "المقر", name_en: "HQ" } }), "en")).toBe("HQ");
    expect(recordName(entry({ old_data: { full_name_ar: "عبدالله" } }), "ar")).toBe("عبدالله");
    expect(recordName(entry({}), "ar")).toBeNull();
  });

  it("safeIds keeps unique uuids only (nothing that could break a filter)", () => {
    expect(safeIds([EMP, EMP, null, undefined, "x),or(id.gt.0", "8C3EB388-436C-4434-822A-251DA07CCBC2"])).toEqual([
      EMP,
      "8C3EB388-436C-4434-822A-251DA07CCBC2",
    ]);
  });
});
