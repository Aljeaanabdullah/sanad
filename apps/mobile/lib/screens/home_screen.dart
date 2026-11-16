import 'package:flutter/material.dart';

import '../auth/auth_service.dart';
import '../enroll/enroll_service.dart';
import '../face/face_capture.dart';
import '../l10n.dart';
import '../punch/phone_checks.dart';
import '../punch/punch_service.dart';
import '../requests/requests_service.dart';
import '../sanad/dashboard_service.dart';
import '../sanad/notifications_service.dart';
import '../settings.dart';
import '../theme.dart';
import 'approvals_screen.dart';
import 'assistant_screen.dart';
import 'attendance_calendar_screen.dart';
import 'dashboard_screen.dart';
import 'enroll_search_screen.dart';
import 'leave_request_screen.dart';
import 'month_record_screen.dart';
import 'notifications_screen.dart';
import 'punch_screen.dart';
import 'requests_screens.dart';

const sanadRed = Color(0xFFC62828);

/// The signed-in app (PRD 18.2): bottom bar with Home, Requests, Reports and More.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.strings,
    required this.settings,
    required this.profile,
    required this.onSignOut,
    required this.enroll,
    required this.analyserFactory,
    required this.punch,
    required this.checks,
    required this.requests,
    this.dashboard,
    this.notifications,
  });

  final Strings strings;
  final AppSettings settings;
  final Profile profile;
  final VoidCallback onSignOut;
  final EnrollService enroll;
  final Future<FaceAnalyser> Function() analyserFactory;
  final PunchService punch;
  final PhoneChecks checks;
  final RequestsService requests;
  final DashboardService? dashboard;
  final NotificationsService? notifications;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  List<PunchEntry>? _today;
  ShiftInfo? _shift;
  Dashboard? _dash;
  int _newNotices = 0;

  bool get _isEnglish => widget.settings.locale.languageCode == 'en';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    ShiftInfo? shift;
    try {
      shift = await widget.punch.currentShift();
    } catch (_) {
      shift = null;
    }
    List<PunchEntry> list;
    try {
      list = await widget.punch.today();
    } catch (_) {
      list = const [];
    }
    if (mounted) {
      setState(() {
        _today = list;
        _shift = shift;
      });
    }
    final dash = widget.dashboard;
    if (dash != null) {
      try {
        final d = await dash.load();
        if (mounted) setState(() => _dash = d);
      } catch (_) {}
    }
    final notices = widget.notifications;
    if (notices != null) {
      try {
        final items = await notices.mine();
        final since = DateTime.now().subtract(const Duration(days: 3));
        if (mounted) setState(() => _newNotices = items.where((n) => n.at.isAfter(since)).length);
      } catch (_) {}
    }
  }

  /// The server decides in/out; the buttons show its best guess from the current shift.
  bool get _nextIsOut => _shift != null && _shift!.checkedIn && !_shift!.checkedOut;

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    await _load();
  }

  Future<void> _punch() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PunchScreen(
        strings: widget.strings,
        isArabic: !_isEnglish,
        checks: widget.checks,
        service: widget.punch,
        analyserFactory: widget.analyserFactory,
      ),
    ));
    await _load();
  }

  void _openDashboard() {
    final d = widget.dashboard;
    if (d != null) _open(DashboardScreen(strings: widget.strings, isArabic: !_isEnglish, service: d));
  }

  Future<void> _openLeave() => _open(LeaveRequestScreen(strings: widget.strings, isArabic: !_isEnglish, service: widget.requests));

  void _openAssistant() {
    final d = widget.dashboard;
    if (d == null) return;
    final name = (_isEnglish ? widget.profile.nameEn : widget.profile.nameAr).split(' ').first;
    _open(AssistantScreen(strings: widget.strings, isArabic: !_isEnglish, service: d, firstName: name, onLeaveRequest: _openLeave));
  }

  void _openNotifications() {
    final n = widget.notifications;
    if (n != null) _open(NotificationsScreen(strings: widget.strings, service: n));
  }

  // ---------------------------------------------------------------- Home tab
  Widget _header(Strings s) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 12, 20, 56),
      decoration: const BoxDecoration(
        color: SanadColors.navy,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Row(children: [
        const _Mark(size: 46),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.appName, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
            Text(s.get('app_tagline'), style: const TextStyle(color: Color(0xFFA9B6CC), fontSize: 13)),
          ]),
        ),
        if (widget.notifications != null)
          IconButton(
            key: const Key('openNotifications'),
            onPressed: _openNotifications,
            icon: Badge(
              isLabelVisible: _newNotices > 0,
              label: Text('$_newNotices'),
              child: const Icon(Icons.notifications_none, color: SanadColors.goldLight, size: 30),
            ),
          ),
      ]),
    );
  }

  Widget _employeeCard(Strings s) {
    final name = _isEnglish ? widget.profile.nameEn : widget.profile.nameAr;
    final comma = _isEnglish ? ',' : '،';
    final initials = name.trim().split(RegExp(r'\s+')).take(2).map((w) => w.isEmpty ? '' : w.characters.first).join();
    final job = _dash?.jobTitle;
    final dept = _isEnglish ? _dash?.departmentEn : _dash?.departmentAr;
    return Card(
      margin: EdgeInsets.zero,
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: SanadColors.navySoft,
            child: Text(initials, style: const TextStyle(color: SanadColors.goldLight, fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${s.welcome}$comma $name', key: const Key('welcome'), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              if (job != null || dept != null)
                Text([?job, ?dept].join(' · '), style: TextStyle(color: Theme.of(context).colorScheme.outline)),
              Text('${s.get('file_no_label')}: ${widget.profile.fileNumber}', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _todayCard(Strings s, ColorScheme colors) {
    String hm(DateTime d) => TimeOfDay.fromDateTime(d).format(context);
    final shift = _shift;
    final inPunch = (_today ?? const <PunchEntry>[]).where((p) => p.accepted && p.type == 'check_in').toList()
      ..sort((a, b) => a.at.compareTo(b.at));
    final String status;
    final Color statusColor;
    if (shift == null) {
      (status, statusColor) = (s.get('shift_none'), colors.outline);
    } else if (shift.checkedOut) {
      (status, statusColor) = (s.get('shift_status_out'), colors.primary);
    } else if (shift.arrival == 'late') {
      (status, statusColor) = (s.shiftLate(shift.lateMinutes), colors.error);
    } else if (shift.arrival == 'on_time') {
      (status, statusColor) = (s.get('shift_status_on_time'), SanadColors.ok);
    } else if (DateTime.now().isBefore(shift.checkinOpens)) {
      (status, statusColor) = (s.shiftOpens(hm(shift.checkinOpens)), colors.outline);
    } else {
      (status, statusColor) = (s.get('shift_status_pending'), colors.outline);
    }
    final left = shift != null && shift.checkedIn && !shift.checkedOut ? shift.end.difference(DateTime.now()) : null;
    final leftText = left == null || left.isNegative
        ? null
        : '${left.inHours}:${(left.inMinutes % 60).toString().padLeft(2, '0')}';
    final checkedIn = inPunch.isNotEmpty || (shift?.checkedIn ?? false);
    return Card(
      key: const Key('shiftCard'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          Expanded(
            flex: 3,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(checkedIn ? Icons.check_circle : Icons.schedule, color: checkedIn ? SanadColors.ok : colors.outline),
                const SizedBox(width: 6),
                Text(checkedIn ? s.get('today_present') : s.get('today_title'),
                    style: TextStyle(fontWeight: FontWeight.bold, color: checkedIn ? SanadColors.ok : null)),
              ]),
              const SizedBox(height: 4),
              Text(MaterialLocalizations.of(context).formatFullDate(DateTime.now()), style: TextStyle(color: colors.outline, fontSize: 12)),
              const SizedBox(height: 6),
              if (inPunch.isNotEmpty)
                Text(hm(inPunch.first.at), key: const Key('checkInTime'), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              if (shift != null) Text('${s.get('shift_title')} — ${s.shiftTime(hm(shift.start), hm(shift.end))}', style: const TextStyle(fontSize: 12)),
              Text(status, style: TextStyle(color: statusColor)),
            ]),
          ),
          if (leftText != null) ...[
            Container(width: 1, height: 70, color: colors.outlineVariant, margin: const EdgeInsets.symmetric(horizontal: 12)),
            Column(children: [
              const Icon(Icons.alarm, color: Color(0xFF1565C0)),
              Text(s.get('time_left'), style: TextStyle(color: colors.outline, fontSize: 12)),
              Text(leftText, key: const Key('timeLeft'), textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            ]),
          ],
        ]),
      ),
    );
  }

  Widget _punchButtons(Strings s) {
    final ready = _today != null;
    final known = _shift != null;
    Widget button({required bool isOut}) {
      final primary = isOut == _nextIsOut;
      return Expanded(
        child: SizedBox(
          height: 64,
          child: FilledButton.icon(
            key: Key(primary ? 'punchButton' : 'punchOtherButton'),
            style: FilledButton.styleFrom(
              backgroundColor: isOut ? sanadRed : SanadColors.navy,
              foregroundColor: Colors.white,
              disabledBackgroundColor: (isOut ? sanadRed : SanadColors.navy).withValues(alpha: 0.35),
              disabledForegroundColor: Colors.white70,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            icon: Icon(isOut ? Icons.logout : Icons.fingerprint, size: 28),
            label: Text(isOut ? s.get('punch_out_button') : s.get('punch_in_button'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            // The other button is off only when the server's shift says which one comes next.
            onPressed: !ready || (known && !primary) ? null : _punch,
          ),
        ),
      );
    }

    return Row(children: [button(isOut: false), const SizedBox(width: 12), button(isOut: true)]);
  }

  Widget _summary(Strings s, ColorScheme colors) {
    final d = _dash;
    Widget tile(IconData icon, Color c, String label, String value, {Key? key, Key? valueKey}) => Expanded(
          child: Container(
            key: key,
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
            decoration: BoxDecoration(color: colors.surfaceContainerLowest, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.outlineVariant)),
            child: Column(children: [
              Icon(icon, color: c, size: 28),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 4),
              Text(value, key: valueKey, textAlign: TextAlign.center, style: TextStyle(color: c, fontWeight: FontWeight.bold, fontSize: 15)),
            ]),
          ),
        );
    final days = s.get('n_days');
    return InkWell(
      key: const Key('dashboardCard'),
      onTap: _openDashboard,
      borderRadius: BorderRadius.circular(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(s.get('period_summary'), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold))),
          if (d != null) Text('${d.from.day}/${d.from.month} – ${d.to.day}/${d.to.month}', style: TextStyle(color: colors.outline, fontSize: 12)),
        ]),
        const SizedBox(height: 10),
        if (d == null)
          const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()))
        else
          Row(children: [
            tile(Icons.close, sanadRed, s.get('dash_absent'), days.replaceAll('{n}', '${d.absent}')),
            const SizedBox(width: 6),
            tile(Icons.warning_amber_rounded, const Color(0xFFE6A100), s.get('lates'), days.replaceAll('{n}', '${d.lateDates.length}')),
            const SizedBox(width: 6),
            tile(Icons.check_circle, SanadColors.ok, s.get('dash_present'), days.replaceAll('{n}', '${d.present}')),
            const SizedBox(width: 6),
            tile(
              Icons.emoji_events,
              SanadColors.gold,
              s.get('dash_bonus'),
              bonusLabel(s, d),
              valueKey: const Key('dashBonusStatus'),
            ),
          ]),
      ]),
    );
  }

  Widget _homeTab(Strings s) {
    final colors = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Stack(clipBehavior: Clip.none, children: [
            _header(s),
            Positioned(left: 16, right: 16, bottom: -44, child: _employeeCard(s)),
          ]),
          const SizedBox(height: 60),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_today != null) _todayCard(s, colors),
              const SizedBox(height: 16),
              _punchButtons(s),
              if (_today != null && _today!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(s.punchToday, style: Theme.of(context).textTheme.titleSmall),
                for (final p in _today!)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(p.accepted ? Icons.check_circle : Icons.cancel, color: p.accepted ? SanadColors.ok : colors.error),
                    title: Text(p.type == 'check_in' ? s.punchIn : s.punchOut),
                    subtitle: p.accepted ? null : Text(s.punchReason(p.reason ?? 'generic')),
                    trailing: Text(TimeOfDay.fromDateTime(p.at).format(context)),
                  ),
              ] else if (_today != null) ...[
                const SizedBox(height: 8),
                Text(s.punchNone, style: TextStyle(color: colors.outline)),
              ],
              if (widget.dashboard != null) ...[
                const SizedBox(height: 20),
                _summary(s, colors),
                const SizedBox(height: 16),
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    key: const Key('openAssistant'),
                    leading: const CircleAvatar(backgroundColor: SanadColors.navy, child: Icon(Icons.smart_toy, color: SanadColors.goldLight)),
                    title: Text(s.get('assistant_title'), style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(s.get('dash_q_bonus')),
                    trailing: const Icon(Icons.chevron_left),
                    onTap: _openAssistant,
                  ),
                ),
              ],
              const SizedBox(height: 24),
            ]),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- More tab
  Widget _moreTab(Strings s) {
    final role = widget.profile.role;
    final isEnglish = _isEnglish;
    Widget item(Key key, IconData icon, String label, VoidCallback onTap) => Card(
          child: ListTile(key: key, leading: Icon(icon, color: SanadColors.gold), title: Text(label), trailing: const Icon(Icons.chevron_left), onTap: onTap),
        );
    return Scaffold(
      appBar: AppBar(title: Text(s.get('more'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          item(const Key('openRecord'), Icons.calendar_month, s.get('my_record'), () => _open(MonthRecordScreen(
                strings: s,
                isArabic: !isEnglish,
                service: widget.requests,
                employeeId: widget.profile.id,
                title: s.get('my_record'),
              ))),
          if (widget.dashboard != null) ...[
            item(const Key('moreDashboard'), Icons.dashboard, s.get('dash_title'), _openDashboard),
            item(const Key('moreAssistant'), Icons.smart_toy, s.get('assistant_title'), _openAssistant),
          ],
          if (widget.notifications != null) item(const Key('moreNotifications'), Icons.notifications, s.get('notifications'), _openNotifications),
          if (role != 'employee') ...[
            item(const Key('openApprovals'), Icons.fact_check, s.get('approvals'),
                () => _open(ApprovalsScreen(strings: s, isArabic: !isEnglish, service: widget.requests))),
            item(const Key('openLookup'), Icons.person_search, s.get('employee_record'), () => _open(EmployeeLookupScreen(
                  strings: s,
                  isArabic: !isEnglish,
                  service: widget.requests,
                  dashboard: widget.dashboard,
                  // PRD 4.4: punch photos for supervisors and the system admin only.
                  withPhotos: role == 'supervisor' || role == 'admin',
                ))),
          ],
          if (role == 'hr')
            item(const Key('openEnroll'), Icons.face_retouching_natural, s.enrollTitle, () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => EnrollSearchScreen(strings: s, isArabic: !isEnglish, service: widget.enroll, analyserFactory: widget.analyserFactory),
                ))),
          const Divider(height: 40),
          Text(s.settings, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'ar', label: Text('العربية')),
              ButtonSegment(value: 'en', label: Text('English')),
            ],
            selected: {widget.settings.locale.languageCode},
            onSelectionChanged: (v) => widget.settings.update(locale: Locale(v.first)),
          ),
          const SizedBox(height: 12),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment(value: ThemeMode.light, label: Text(s.light), icon: const Icon(Icons.light_mode)),
              ButtonSegment(value: ThemeMode.dark, label: Text(s.dark), icon: const Icon(Icons.dark_mode)),
            ],
            selected: {widget.settings.themeMode},
            onSelectionChanged: (v) => widget.settings.update(themeMode: v.first),
          ),
          const SizedBox(height: 32),
          OutlinedButton.icon(onPressed: widget.onSignOut, icon: const Icon(Icons.logout), label: Text(s.signOut)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final pages = [
      Scaffold(body: _homeTab(s)),
      MyRequestsScreen(strings: s, isArabic: !_isEnglish, service: widget.requests, onLeaveRequest: _openLeave),
      AttendanceCalendarScreen(
        strings: s,
        isArabic: !_isEnglish,
        service: widget.requests,
        employeeId: widget.profile.id,
        onOpenDashboard: widget.dashboard == null ? null : _openDashboard,
      ),
      _moreTab(s),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        key: const Key('bottomNav'),
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 0) _load();
        },
        destinations: [
          NavigationDestination(key: const Key('tabHome'), icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: s.get('tab_home')),
          NavigationDestination(key: const Key('tabRequests'), icon: const Icon(Icons.assignment_outlined), selectedIcon: const Icon(Icons.assignment), label: s.get('tab_requests')),
          NavigationDestination(key: const Key('tabReports'), icon: const Icon(Icons.insert_chart_outlined), selectedIcon: const Icon(Icons.insert_chart), label: s.get('tab_reports')),
          NavigationDestination(key: const Key('tabMore'), icon: const Icon(Icons.more_horiz), label: s.get('more')),
        ],
      ),
    );
  }
}

/// Sanad mark: a gold diamond with "س".
class _Mark extends StatelessWidget {
  const _Mark({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: 0.785398,
        child: Container(
          width: size * 0.78,
          height: size * 0.78,
          decoration: BoxDecoration(border: Border.all(color: SanadColors.gold, width: 2), borderRadius: BorderRadius.circular(size * 0.2)),
          alignment: Alignment.center,
          child: Transform.rotate(
            angle: -0.785398,
            child: Text('س', style: TextStyle(color: SanadColors.gold, fontSize: size * 0.42, fontWeight: FontWeight.w900)),
          ),
        ),
      );
}
