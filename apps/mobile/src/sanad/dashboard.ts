// Sanad phase S1 (PRD 17-18): the employee dashboard as returned by the RPC `employee_dashboard`,
// and "Ask Sanad": answers built ONLY from that one employee's dashboard data (no AI, no other employees).
// Same rules and texts as the web panel (apps/admin/src/lib/sanad-dashboard.ts); keep the two in sync.

export type DashboardData = {
  employee: {
    id: string;
    file_number: number;
    name_ar: string;
    name_en: string;
    department_ar: string | null;
    department_en: string | null;
    job_title: string | null;
    hire_date: string | null;
    employment_status: string | null;
  };
  month: string;
  period: { from: string; to: string; today: string; complete: boolean };
  attendance: {
    shifts: number;
    present: number;
    late: number;
    late_minutes: number;
    absent: number;
    absent_unexcused: number;
    missing_checkout: number;
    late_dates: string[];
    late_total: number;
  };
  leaves: { type: string; from: string; to: string | null; note: string | null; days_in_period: number }[];
  leave_days: number;
  penalties: { type: string; date: string; reason: string | null }[];
  list: { eligibility: string | null; reason: string | null; status: string; leave_days: number | null; late_count: number | null } | null;
  estimate: { eligibility: string | null; pending_manager: boolean; reasons: string[]; reason: string; notes: string[] };
  list_months: string[];
  viewer_is_self: boolean;
};

export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function shiftMonth(m: string, by: number) {
  const [, y, mo] = MONTH_RE.exec(m)!;
  const t = Number(y) * 12 + (Number(mo) - 1) + by;
  return `${String(Math.floor(t / 12)).padStart(4, "0")}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function hasOfficial(d: DashboardData) {
  return !!d.list?.eligibility;
}
/** The result to show: the official list row when it exists, else the estimate. */
export function bonusOf(d: DashboardData): { eligible: boolean | null; reason: string; source: "locked" | "draft" | "estimate" } {
  if (hasOfficial(d)) {
    return {
      eligible: d.list!.eligibility === "مستحق",
      reason: d.list!.reason ?? "",
      source: d.list!.status === "مقفل" ? "locked" : "draft",
    };
  }
  return {
    eligible: d.estimate.eligibility == null ? null : d.estimate.eligibility === "مستحق",
    reason: d.estimate.reason,
    source: "estimate",
  };
}

function normalize(q: string) {
  return q
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

const TOPICS: [string, string[]][] = [
  ["penalty", ["خصم", "عقوب", "انذار", "لفت نظر", "ايقاف", "جزاء", "deduct", "penalt", "warning", "suspen"]],
  ["late", ["تاخير", "تاخر", "متاخر", "late"]],
  ["absence", ["غياب", "غايب", "غائب", "غبت", "غاب", "absen", "absent", "missed"]],
  ["leave", ["اجاز", "leave", "vacation"]],
  ["bonus", ["مكافا", "مكافئ", "بونص", "استحق", "مستحق", "bonus", "eligib", "reward"]],
];

/** Same letter folding the topic matcher uses (no diacritics, one alef, ه for ة, ي for ى). */
export function normalizeQuestion(question: string) {
  return normalize(question);
}

/** Every topic the question touches (a question can touch more than one). */
export function topicsIn(question: string): string[] {
  const q = normalize(question);
  return TOPICS.filter(([, words]) => words.some((w) => q.includes(w))).map(([k]) => k);
}

export function topicOf(question: string) {
  const hits = topicsIn(question);
  if (hits.length === 0) return "unknown";
  if (hits.includes("bonus") && !hits.includes("penalty")) return "bonus";
  return hits[0];
}

const TYPES_EN: Record<string, string> = {
  "إجازة دورية": "annual leave",
  "إجازة مرضية": "sick leave",
  "إجازة طارئة": "emergency leave",
  "إجازة بدون راتب": "unpaid leave",
  غياب: "absence",
  تأخير: "late arrival",
  إنذار: "warning",
  "لفت نظر": "notice",
  خصم: "deduction",
  إيقاف: "suspension",
};

const dm = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};

export function answerQuestion(d: DashboardData, question: string, arabic: boolean): { topic: string; text: string } {
  const topic = topicOf(question);
  const t = (a: string, e: string) => (arabic ? a : e);
  const type = (v: string) => (arabic ? v : (TYPES_EN[v] ?? v));
  const period = t(`فترة ${dm(d.period.from)} إلى ${dm(d.period.to)}`, `period ${dm(d.period.from)} to ${dm(d.period.to)}`);
  const e = d.employee;
  const who = d.viewer_is_self ? "" : t(`(${e.name_ar} · ${e.file_number}) `, `(${e.name_en} · ${e.file_number}) `);
  const b = bonusOf(d);
  const lateDates = d.attendance.late_dates;

  const bonus = () => {
    const official =
      b.source === "locked"
        ? t("حسب الكشف المعتمد", "according to the locked list")
        : b.source === "draft"
          ? t("حسب مسودة الكشف، وهي قيد مراجعة المدير وقد تتغير قبل الاعتماد", "according to the draft list, which the manager is still reviewing and may change")
          : d.period.complete
            ? t("تقديرياً حسب بياناتك (الكشف لم يصدر بعد)", "estimated from your data (the list is not out yet)")
            : t("تقديرياً حتى اليوم، والفترة ما خلصت وقد تتغير النتيجة", "estimated up to today; the period is not over and this may change");
    if (b.eligible == null) return t(`${who}${period}: ${official}، ${b.reason}.`, `${who}${period}: ${official}, ${b.reason}.`);
    if (b.eligible)
      return t(
        `${who}أنت مستحق للمكافأة في ${period}، ${official}: لا إجازة فوق 10 أيام، ولا تأخير مرتين، ولا عقوبة.`,
        `${who}You are eligible for the bonus in the ${period}, ${official}: no leave over 10 days, no 2 late arrivals, no penalty.`,
      );
    return t(
      `${who}أنت غير مستحق للمكافأة في ${period}، ${official}. السبب: ${b.reason}.`,
      `${who}You are not eligible for the bonus in the ${period}, ${official}. Reason: ${b.reason}.`,
    );
  };
  const penalty = () => {
    if (d.penalties.length === 0)
      return t(
        `${who}ما عليك أي عقوبة في ${period}. وإذا تقصد خصماً من الراتب، فالرواتب خارج سند حالياً؛ راجع الموارد البشرية.`,
        `${who}You have no penalty in the ${period}. If you mean a salary deduction, payroll is not in Sanad yet; please ask HR.`,
      );
    const items = d.penalties
      .map((p) => `${type(p.type)} ${t("بتاريخ", "on")} ${dm(p.date)}${p.reason ? ` (${p.reason})` : ""}`)
      .join(t("، ", ", "));
    return t(
      `${who}عليك ${d.penalties.length} عقوبة في ${period}: ${items}. وأي عقوبة في الفترة تمنع المكافأة.`,
      `${who}You have ${d.penalties.length} penalt${d.penalties.length === 1 ? "y" : "ies"} in the ${period}: ${items}. Any penalty in the period blocks the bonus.`,
    );
  };
  const late = () => {
    if (lateDates.length === 0) return t(`${who}ما سُجّل عليك أي تأخير في ${period}.`, `${who}No late arrival is recorded for you in the ${period}.`);
    const dates = lateDates.map(dm).join(t("، ", ", "));
    const mins = d.attendance.late_minutes > 0 ? t(` (مجموع ${d.attendance.late_minutes} دقيقة)`, ` (${d.attendance.late_minutes} minutes in total)`) : "";
    const rule =
      lateDates.length >= 2
        ? t("وتأخير مرتين أو أكثر يمنع المكافأة.", "Two or more late arrivals block the bonus.")
        : t("ومرة واحدة لا تمنع المكافأة.", "One late arrival does not block the bonus.");
    return t(
      `${who}تأخرت ${lateDates.length} مرة في ${period}: ${dates}${mins}. ${rule}`,
      `${who}You were late ${lateDates.length} time(s) in the ${period}: ${dates}${mins}. ${rule}`,
    );
  };
  const absence = () => {
    const a = d.attendance;
    if (a.absent === 0) return t(`${who}ما عليك غياب في ${period}.`, `${who}You have no absence in the ${period}.`);
    const unexcused =
      a.absent_unexcused > 0
        ? t(
            `، منها ${a.absent_unexcused} بدون إجازة مسجلة (يراجعها المدير قبل قفل الكشف)`,
            `, ${a.absent_unexcused} of them without a recorded leave (the manager reviews them before locking the list)`,
          )
        : t("، وكلها مغطاة بإجازات مسجلة", ", all covered by recorded leaves");
    return t(`${who}عليك ${a.absent} يوم غياب في ${period}${unexcused}.`, `${who}You have ${a.absent} absent day(s) in the ${period}${unexcused}.`);
  };
  const leave = () => {
    const real = d.leaves.filter((l) => l.type.startsWith("إجازة"));
    if (real.length === 0) return t(`${who}ما عندك إجازات مسجلة في ${period}.`, `${who}You have no recorded leave in the ${period}.`);
    const items = real
      .map((l) => `${type(l.type)} ${dm(l.from)}${l.to ? `–${dm(l.to)}` : ""} (${l.days_in_period} ${t("يوم في الفترة", "days in period")})`)
      .join(t("، ", ", "));
    const rule =
      d.leave_days > 10
        ? t("والمجموع أكثر من 10 أيام، وهذا يمنع المكافأة.", "The total is over 10 days, which blocks the bonus.")
        : t("والمجموع لا يزيد عن 10 أيام، فلا يمنع المكافأة.", "The total is not over 10 days, so it does not block the bonus.");
    return t(
      `${who}مجموع إجازاتك ${d.leave_days} يوم في ${period}: ${items}. ${rule}`,
      `${who}Your leave in the ${period} is ${d.leave_days} day(s): ${items}. ${rule}`,
    );
  };

  const text =
    topic === "bonus"
      ? bonus()
      : topic === "penalty"
        ? penalty()
        : topic === "late"
          ? late()
          : topic === "absence"
            ? absence()
            : topic === "leave"
              ? leave()
              : t(
                  `ما فهمت سؤالك. جرّب مثلاً: «ليش ما أخذت مكافأة؟» أو «ليش علي خصم؟» أو «كم مرة تأخرت؟». وللأسئلة الثانية تواصل مع الموارد البشرية.\n\n${bonus()}`,
                  `I did not understand. Try for example: "Why didn't I get a bonus?", "Why do I have a deduction?" or "How many times was I late?". For other questions please contact HR.\n\n${bonus()}`,
                );
  return { topic, text };
}
