import 'package:supabase_flutter/supabase_flutter.dart';

/// One leave (or absence / late record) overlapping the bonus period.
class LeaveItem {
  const LeaveItem({required this.type, required this.from, this.to, this.note, required this.daysInPeriod});
  final String type; // Arabic type as stored, e.g. "إجازة دورية"
  final DateTime from;
  final DateTime? to;
  final String? note;
  final int daysInPeriod;
}

class PenaltyItem {
  const PenaltyItem({required this.type, required this.date, this.reason});
  final String type; // إنذار | لفت نظر | خصم | إيقاف
  final DateTime date;
  final String? reason;
}

/// Everything the employee dashboard shows for one bonus period (PRD 17-18).
/// Built only from one employee's own rows (server RPC `employee_dashboard`).
class Dashboard {
  const Dashboard({
    required this.employeeId,
    required this.fileNumber,
    required this.nameAr,
    required this.nameEn,
    this.departmentAr,
    this.departmentEn,
    this.jobTitle,
    this.employmentStatus,
    required this.month,
    required this.from,
    required this.to,
    required this.periodComplete,
    required this.shifts,
    required this.present,
    required this.late,
    required this.lateMinutes,
    required this.absent,
    required this.absentUnexcused,
    required this.missingCheckout,
    required this.lateDates,
    required this.leaveDays,
    required this.leaves,
    required this.penalties,
    this.listEligibility,
    this.listReason,
    this.listStatus,
    this.estimateEligibility,
    required this.estimateReason,
    required this.estimateReasons,
    required this.pendingManager,
    required this.notes,
    required this.listMonths,
    required this.viewerIsSelf,
  });

  final String employeeId;
  final int fileNumber;
  final String nameAr;
  final String nameEn;
  final String? departmentAr;
  final String? departmentEn;
  final String? jobTitle;
  final String? employmentStatus;

  final String month; // YYYY-MM (bonus list month)
  final DateTime from; // 21st of the previous month
  final DateTime to; // 20th of the month
  final bool periodComplete;

  final int shifts;
  final int present;
  final int late; // late arrivals from punches
  final int lateMinutes;
  final int absent;
  final int absentUnexcused;
  final int missingCheckout;
  final List<DateTime> lateDates; // punches + late records (what the rule counts)

  final int leaveDays; // leave days inside the period (types starting with إجازة)
  final List<LeaveItem> leaves;
  final List<PenaltyItem> penalties;

  // Official list row (written by the agents), if any.
  final String? listEligibility;
  final String? listReason;
  final String? listStatus; // مسودة | مقفل

  // Estimate from the same rules, shown until the official row exists.
  final String? estimateEligibility; // null when the manager must decide first
  final String estimateReason;
  final List<String> estimateReasons;
  final bool pendingManager;
  final List<String> notes;

  final List<String> listMonths;
  final bool viewerIsSelf;

  bool get hasOfficial => listEligibility != null && listEligibility!.isNotEmpty;
  bool get isLocked => listStatus == 'مقفل';

  /// The result to show: the official list when it exists, else the estimate.
  String? get eligibility => hasOfficial ? listEligibility : estimateEligibility;
  String get reason => hasOfficial ? (listReason ?? '') : estimateReason;

  /// true = eligible, false = not eligible, null = waiting for the manager.
  bool? get eligible => eligibility == null ? null : eligibility == 'مستحق';

  factory Dashboard.fromJson(Map<String, dynamic> j) {
    DateTime d(Object? v) => DateTime.parse(v as String);
    int n(Object? v) => (v as num? ?? 0).toInt();
    final e = j['employee'] as Map<String, dynamic>;
    final p = j['period'] as Map<String, dynamic>;
    final a = j['attendance'] as Map<String, dynamic>;
    final list = j['list'] as Map<String, dynamic>?;
    final est = j['estimate'] as Map<String, dynamic>;
    return Dashboard(
      employeeId: e['id'] as String,
      fileNumber: n(e['file_number']),
      nameAr: e['name_ar'] as String? ?? '',
      nameEn: e['name_en'] as String? ?? '',
      departmentAr: e['department_ar'] as String?,
      departmentEn: e['department_en'] as String?,
      jobTitle: e['job_title'] as String?,
      employmentStatus: e['employment_status'] as String?,
      month: j['month'] as String,
      from: d(p['from']),
      to: d(p['to']),
      periodComplete: p['complete'] == true,
      shifts: n(a['shifts']),
      present: n(a['present']),
      late: n(a['late']),
      lateMinutes: n(a['late_minutes']),
      absent: n(a['absent']),
      absentUnexcused: n(a['absent_unexcused']),
      missingCheckout: n(a['missing_checkout']),
      lateDates: [for (final x in (a['late_dates'] as List? ?? const [])) d(x)],
      leaveDays: n(j['leave_days']),
      leaves: [
        for (final l in (j['leaves'] as List? ?? const []))
          LeaveItem(
            type: l['type'] as String,
            from: d(l['from']),
            to: l['to'] == null ? null : d(l['to']),
            note: l['note'] as String?,
            daysInPeriod: n(l['days_in_period']),
          ),
      ],
      penalties: [
        for (final x in (j['penalties'] as List? ?? const []))
          PenaltyItem(type: x['type'] as String, date: d(x['date']), reason: x['reason'] as String?),
      ],
      listEligibility: list?['eligibility'] as String?,
      listReason: list?['reason'] as String?,
      listStatus: list?['status'] as String?,
      estimateEligibility: est['eligibility'] as String?,
      estimateReason: est['reason'] as String? ?? '',
      estimateReasons: [for (final r in (est['reasons'] as List? ?? const [])) r as String],
      pendingManager: est['pending_manager'] == true,
      notes: [for (final r in (est['notes'] as List? ?? const [])) r as String],
      listMonths: [for (final m in (j['list_months'] as List? ?? const [])) m as String],
      viewerIsSelf: j['viewer_is_self'] == true,
    );
  }
}

/// A refusal from the server: `not_allowed`, `not_found` or `generic`.
class DashboardError implements Exception {
  const DashboardError(this.code);
  final String code;
  @override
  String toString() => 'DashboardError($code)';
}

abstract class DashboardService {
  /// [employeeId] null = the signed-in employee. Staff may pass any employee (view only).
  /// [month] null = the current bonus period.
  Future<Dashboard> load({String? employeeId, String? month});
}

class SupabaseDashboardService implements DashboardService {
  SupabaseDashboardService(this._client);
  final SupabaseClient _client;

  @override
  Future<Dashboard> load({String? employeeId, String? month}) async {
    try {
      final r = await _client.rpc('employee_dashboard', params: {'p_employee': employeeId, 'p_month': month});
      return Dashboard.fromJson(Map<String, dynamic>.from(r as Map));
    } on PostgrestException catch (e) {
      if (e.code == '42501') throw const DashboardError('not_allowed');
      if (e.code == 'P0002') throw const DashboardError('not_found');
      throw const DashboardError('generic');
    } catch (e) {
      if (e is DashboardError) rethrow;
      throw const DashboardError('generic');
    }
  }
}

/// "YYYY-MM" shifted by [delta] months.
String shiftMonth(String month, int delta) {
  final y = int.parse(month.substring(0, 4));
  final m = int.parse(month.substring(5, 7));
  final t = y * 12 + (m - 1) + delta;
  return '${(t ~/ 12).toString().padLeft(4, '0')}-${(t % 12 + 1).toString().padLeft(2, '0')}';
}
