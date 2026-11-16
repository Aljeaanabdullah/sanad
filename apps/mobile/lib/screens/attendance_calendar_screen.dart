import 'package:flutter/material.dart';

import '../l10n.dart';
import '../requests/requests_service.dart';
import '../theme.dart';

const _late = Color(0xFFE6A100);
const _absent = Color(0xFFC62828);

/// Colour of the dot under a day, or null for no dot (holiday, day off, future, before hire).
Color? dayDot(DayRecord d) => switch (d.arrival) {
      'on_time' => SanadColors.ok,
      'late' => _late,
      'absent' => _absent,
      _ => null,
    };

/// Sanad (PRD 18.2): month calendar of attendance with a coloured dot per day and the month totals.
/// The week starts on Saturday, as in Kuwait.
class AttendanceCalendarScreen extends StatefulWidget {
  const AttendanceCalendarScreen({
    super.key,
    required this.strings,
    required this.isArabic,
    required this.service,
    required this.employeeId,
    this.month,
    this.onOpenDashboard,
  });
  final Strings strings;
  final bool isArabic;
  final RequestsService service;
  final String employeeId;
  final DateTime? month; // for tests
  final VoidCallback? onOpenDashboard;

  @override
  State<AttendanceCalendarScreen> createState() => _AttendanceCalendarScreenState();
}

class _AttendanceCalendarScreenState extends State<AttendanceCalendarScreen> {
  late DateTime _month;
  late final DateTime _thisMonth;
  Map<int, DayRecord>? _days;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    final m = widget.month ?? DateTime.now();
    _thisMonth = DateTime(m.year, m.month);
    _month = _thisMonth;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _days = null;
      _failed = false;
    });
    final to = DateTime(_month.year, _month.month + 1, 0);
    try {
      final list = await widget.service.history(widget.employeeId, _month, to);
      if (!mounted) return;
      final map = <int, DayRecord>{};
      for (final d in list) {
        // A day with several shifts: keep the worst state (absent > late > on time).
        final old = map[d.day.day];
        int rank(DayRecord x) => switch (x.arrival) { 'absent' => 3, 'late' => 2, 'on_time' => 1, _ => 0 };
        if (old == null || rank(d) > rank(old)) map[d.day.day] = d;
      }
      setState(() => _days = map);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _go(int delta) {
    _month = DateTime(_month.year, _month.month + delta);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final colors = Theme.of(context).colorScheme;
    final monthTitle = MaterialLocalizations.of(context).formatMonthYear(_month);
    final days = _days;
    final count = DateTime(_month.year, _month.month + 1, 0).day;
    final lead = (DateTime(_month.year, _month.month, 1).weekday - DateTime.saturday) % 7;
    final totals = (
      present: days?.values.where((d) => d.arrival == 'on_time' || d.arrival == 'late').length ?? 0,
      late: days?.values.where((d) => d.arrival == 'late').length ?? 0,
      absent: days?.values.where((d) => d.arrival == 'absent').length ?? 0,
    );
    final weekdays = [for (var i = 0; i < 7; i++) s.get('wd_$i')];
    final today = DateTime.now();

    Widget legend(Color c, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label),
        ]);

    Widget total(IconData icon, Color c, int n, String label, Key key) => Expanded(
          child: Container(
            key: key,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(color: colors.surfaceContainerHighest, borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icon, color: c, size: 20),
                const SizedBox(width: 6),
                Text(s.get('n_days').replaceAll('{n}', '$n'), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ]),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(color: colors.outline)),
            ]),
          ),
        );

    return Scaffold(
      appBar: AppBar(title: Text(s.get('attendance_details'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  IconButton(key: const Key('calPrev'), icon: const Icon(Icons.chevron_right), onPressed: () => _go(-1)),
                  Expanded(
                    child: Text(monthTitle, key: const Key('calMonth'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    key: const Key('calNext'),
                    icon: const Icon(Icons.chevron_left),
                    onPressed: _month == _thisMonth ? null : () => _go(1),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(children: [
                  Row(children: [
                    for (final w in weekdays)
                      Expanded(child: Center(child: Text(w, style: TextStyle(fontSize: 12, color: colors.outline)))),
                  ]),
                  const SizedBox(height: 6),
                  if (days == null)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: _failed ? Text(s.get('error_generic')) : const CircularProgressIndicator(),
                    )
                  else
                    GridView.count(
                      crossAxisCount: 7,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      childAspectRatio: 0.95,
                      children: [
                        for (var i = 0; i < lead; i++) const SizedBox.shrink(),
                        for (var d = 1; d <= count; d++)
                          Builder(builder: (_) {
                            final rec = days[d];
                            final dot = rec == null ? null : dayDot(rec);
                            final isToday = _month.year == today.year && _month.month == today.month && d == today.day;
                            return Column(
                              key: Key('day$d'),
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  width: 34,
                                  height: 34,
                                  alignment: Alignment.center,
                                  decoration: isToday ? const BoxDecoration(color: SanadColors.navy, shape: BoxShape.circle) : null,
                                  child: Text('$d',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        color: isToday ? Colors.white : (rec?.kind == 'holiday' ? _absent : null),
                                      )),
                                ),
                                const SizedBox(height: 2),
                                Container(
                                  key: dot == null ? null : Key('dot$d'),
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(color: dot ?? Colors.transparent, shape: BoxShape.circle),
                                ),
                              ],
                            );
                          }),
                      ],
                    ),
                ]),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(alignment: WrapAlignment.center, spacing: 18, children: [
              legend(SanadColors.ok, s.get('dash_present')),
              legend(_absent, s.get('dash_absent')),
              legend(_late, s.get('dash_late')),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              total(Icons.check_circle, SanadColors.ok, totals.present, s.get('dash_present'), const Key('totPresent')),
              const SizedBox(width: 8),
              total(Icons.cancel, _absent, totals.absent, s.get('dash_absent'), const Key('totAbsent')),
              const SizedBox(width: 8),
              total(Icons.alarm, _late, totals.late, s.get('dash_late'), const Key('totLate')),
            ]),
            if (widget.onOpenDashboard != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                key: const Key('calOpenDashboard'),
                icon: const Icon(Icons.dashboard),
                label: Text(s.get('dash_title')),
                onPressed: widget.onOpenDashboard,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
