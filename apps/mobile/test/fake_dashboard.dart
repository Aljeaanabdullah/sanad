import 'package:jahez/sanad/dashboard_service.dart';

/// Shaped like the server RPC `employee_dashboard` output.
Map<String, dynamic> dashJson({
  String id = 'e1',
  int file = 712000,
  String month = '2026-10',
  List<String> lateDates = const ['2026-09-23', '2026-09-29', '2026-10-05'],
  int leaveDays = 0,
  List<Map<String, dynamic>> leaves = const [],
  List<Map<String, dynamic>> penalties = const [],
  Map<String, dynamic>? list,
  String? eligibility = 'غير مستحق',
  String reason = 'تأخير 3 مرات (2026-09-23، 2026-09-29، 2026-10-05)',
  bool pending = false,
  bool self = true,
  int absent = 0,
  int unexcused = 0,
}) =>
    {
      'employee': {
        'id': id,
        'file_number': file,
        'name_ar': 'موظف تجريبي',
        'name_en': 'Demo Employee',
        'department_ar': 'العمليات',
        'department_en': 'Operations',
        'job_title': 'فني',
        'employment_status': 'على رأس العمل',
      },
      'month': month,
      'period': {'from': '2026-09-21', 'to': '2026-10-20', 'today': '2026-11-16', 'complete': true},
      'attendance': {
        'shifts': 20,
        'present': 20 - absent,
        'late': lateDates.length,
        'late_minutes': 25,
        'absent': absent,
        'absent_unexcused': unexcused,
        'missing_checkout': 1,
        'late_dates': lateDates,
        'late_total': lateDates.length,
      },
      'leaves': leaves,
      'leave_days': leaveDays,
      'penalties': penalties,
      'list': list,
      'estimate': {
        'eligibility': eligibility,
        'pending_manager': pending,
        'reasons': [if (eligibility == 'غير مستحق') reason],
        'reason': reason,
        'notes': [if (unexcused > 0) 'غياب $unexcused يوم بدون إجازة مسجلة، والمدير يراجعه قبل قفل الكشف'],
      },
      'list_months': ['2026-09'],
      'viewer_is_self': self,
    };

class FakeDashboard implements DashboardService {
  FakeDashboard(this.byEmployee, {this.denyOthers = false});
  final Map<String?, Map<String, dynamic>> byEmployee; // null key = me
  final bool denyOthers;
  final calls = <(String?, String?)>[];

  @override
  Future<Dashboard> load({String? employeeId, String? month}) async {
    calls.add((employeeId, month));
    if (employeeId != null && denyOthers) throw const DashboardError('not_allowed');
    final j = byEmployee[employeeId];
    if (j == null) throw const DashboardError('not_found');
    return Dashboard.fromJson({...j, if (month != null) 'month': month});
  }
}
