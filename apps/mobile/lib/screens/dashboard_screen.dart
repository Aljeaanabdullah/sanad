import 'package:flutter/material.dart';

import '../l10n.dart';
import '../sanad/ask.dart';
import '../sanad/dashboard_service.dart';
import '../theme.dart';

String _dm(DateTime d) => '${d.day}/${d.month}';

Color _bonusColor(BuildContext context, bool? eligible) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  if (eligible == null) return Theme.of(context).colorScheme.outline;
  if (eligible) return dark ? SanadColors.okDark : SanadColors.ok;
  return Theme.of(context).colorScheme.error;
}

String bonusLabel(Strings s, Dashboard d) => switch (d.eligible) {
      null => s.get('dash_pending'),
      true => s.get('dash_eligible'),
      false => s.get('dash_not_eligible'),
    };

/// Only a locked list is official. A draft is "under manager review"; an estimate before
/// the period ends is "estimate up to today".
String bonusSource(Strings s, Dashboard d) => d.hasOfficial
    ? s.get(d.isLocked ? 'dash_locked' : 'dash_draft')
    : s.get(d.periodComplete ? 'dash_estimate' : 'dash_estimate_today');

/// Small stat tile used on the home screen and the dashboard.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        decoration: BoxDecoration(
          color: colors.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color ?? colors.onSurface)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: colors.outline)),
          ],
        ),
      ),
    );
  }
}

/// Period numbers + bonus status, on the home screen. Tapping opens the full dashboard.
class DashboardSummaryCard extends StatefulWidget {
  const DashboardSummaryCard({super.key, required this.strings, required this.service, required this.onOpen});
  final Strings strings;
  final DashboardService service;
  final VoidCallback onOpen;

  @override
  State<DashboardSummaryCard> createState() => DashboardSummaryCardState();
}

class DashboardSummaryCardState extends State<DashboardSummaryCard> {
  Dashboard? _d;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final d = await widget.service.load();
      if (mounted) {
        setState(() {
          _d = d;
          _failed = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final d = _d;
    return Card(
      key: const Key('dashboardCard'),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: widget.onOpen,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: d == null
              ? (_failed
                  ? ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.dashboard), title: Text(s.get('dash_title')), subtitle: Text(s.get('dash_error_generic')))
                  : const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator())))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(children: [
                      const Icon(Icons.dashboard, color: SanadColors.gold),
                      const SizedBox(width: 8),
                      Expanded(child: Text(s.get('dash_title'), style: Theme.of(context).textTheme.titleMedium)),
                      Text('${_dm(d.from)} – ${_dm(d.to)}', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                    ]),
                    const SizedBox(height: 12),
                    Row(children: [
                      StatTile(label: s.get('dash_present'), value: '${d.present}'),
                      const SizedBox(width: 6),
                      StatTile(label: s.get('dash_absent'), value: '${d.absent}'),
                      const SizedBox(width: 6),
                      StatTile(label: s.get('dash_late'), value: '${d.lateDates.length}'),
                      const SizedBox(width: 6),
                      StatTile(label: s.get('dash_leave_days'), value: '${d.leaveDays}'),
                    ]),
                    const SizedBox(height: 12),
                    Row(children: [
                      Text('${s.get('dash_bonus')}: ', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(bonusLabel(s, d),
                          key: const Key('dashBonusStatus'),
                          style: TextStyle(fontWeight: FontWeight.bold, color: _bonusColor(context, d.eligible))),
                      const SizedBox(width: 6),
                      Text('(${bonusSource(s, d)})', style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12)),
                      const Spacer(),
                      const Icon(Icons.chevron_left),
                    ]),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Full dashboard for one employee and one bonus period (PRD 18).
/// [employeeId] null = me; otherwise a staff member viewing someone (read only).
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.strings,
    required this.isArabic,
    required this.service,
    this.employeeId,
    this.title,
  });

  final Strings strings;
  final bool isArabic;
  final DashboardService service;
  final String? employeeId;
  final String? title;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Dashboard? _d;
  String? _month;
  String? _currentMonth;
  String? _error;
  bool _loading = true;
  final _question = TextEditingController();
  AskAnswer? _answer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _question.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final d = await widget.service.load(employeeId: widget.employeeId, month: _month);
      if (!mounted) return;
      setState(() {
        _d = d;
        _month = d.month;
        _currentMonth ??= d.month;
        _error = null;
        _loading = false;
        _answer = null;
      });
    } on DashboardError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.code;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'generic';
          _loading = false;
        });
      }
    }
  }

  void _go(int delta) {
    if (_month == null) return;
    _month = shiftMonth(_month!, delta);
    _load();
  }

  void _ask([String? preset]) {
    final d = _d;
    if (d == null) return;
    final q = preset ?? _question.text.trim();
    if (q.isEmpty) return;
    if (preset != null) _question.text = preset;
    setState(() => _answer = answerQuestion(d, q, arabic: widget.isArabic));
  }

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final colors = Theme.of(context).colorScheme;
    final d = _d;
    final viewOnly = widget.employeeId != null;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? s.get('dash_title'))),
      body: _error != null && d == null
          ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(s.get('dash_error_$_error'), key: const Key('dashError'))))
          : d == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      if (viewOnly)
                        Container(
                          key: const Key('viewOnlyBanner'),
                          padding: const EdgeInsets.all(10),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(color: colors.secondaryContainer, borderRadius: BorderRadius.circular(12)),
                          child: Row(children: [
                            Icon(Icons.visibility, color: colors.onSecondaryContainer),
                            const SizedBox(width: 8),
                            Expanded(child: Text(s.get('dash_view_only'), style: TextStyle(color: colors.onSecondaryContainer))),
                          ]),
                        ),
                      Text(widget.isArabic ? d.nameAr : d.nameEn, style: Theme.of(context).textTheme.titleLarge),
                      Text(
                        [
                          '${d.fileNumber}',
                          if ((widget.isArabic ? d.departmentAr : d.departmentEn) != null) widget.isArabic ? d.departmentAr! : d.departmentEn!,
                          if (d.jobTitle != null) d.jobTitle!,
                        ].join(' · '),
                        style: TextStyle(color: colors.outline),
                      ),
                      const SizedBox(height: 12),
                      // Month (bonus period) switcher.
                      Row(children: [
                        IconButton(key: const Key('dashPrev'), icon: const Icon(Icons.chevron_right), onPressed: _loading ? null : () => _go(-1)),
                        Expanded(
                          child: Column(children: [
                            Text('${s.get('dash_list_of')} ${d.month}', style: const TextStyle(fontWeight: FontWeight.bold)),
                            Text('${s.get('dash_period')}: ${_dm(d.from)} – ${_dm(d.to)}', style: TextStyle(color: colors.outline, fontSize: 12)),
                          ]),
                        ),
                        IconButton(
                          key: const Key('dashNext'),
                          icon: const Icon(Icons.chevron_left),
                          onPressed: _loading || d.month == _currentMonth ? null : () => _go(1),
                        ),
                      ]),
                      if (_loading) const LinearProgressIndicator(),
                      const SizedBox(height: 8),
                      Row(children: [
                        StatTile(label: s.get('dash_present'), value: '${d.present}'),
                        const SizedBox(width: 6),
                        StatTile(label: s.get('dash_absent'), value: '${d.absent}', color: d.absentUnexcused > 0 ? colors.error : null),
                        const SizedBox(width: 6),
                        StatTile(label: s.get('dash_late'), value: '${d.lateDates.length}', color: d.lateDates.length >= 2 ? colors.error : null),
                        const SizedBox(width: 6),
                        StatTile(label: s.get('dash_leave_days'), value: '${d.leaveDays}', color: d.leaveDays > 10 ? colors.error : null),
                      ]),
                      const SizedBox(height: 6),
                      Text(
                        '${s.get('dash_unexcused')}: ${d.absentUnexcused} · ${s.get('dash_missing_checkout')}: ${d.missingCheckout}'
                        '${d.lateMinutes > 0 ? ' · ${s.get('dash_late_minutes')}: ${d.lateMinutes}' : ''}',
                        style: TextStyle(color: colors.outline, fontSize: 12),
                      ),
                      // Bonus status.
                      Card(
                        key: const Key('bonusCard'),
                        margin: const EdgeInsets.only(top: 16),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            Row(children: [
                              const Icon(Icons.workspace_premium, color: SanadColors.gold),
                              const SizedBox(width: 8),
                              Text(s.get('dash_bonus'), style: Theme.of(context).textTheme.titleMedium),
                              const Spacer(),
                              Chip(label: Text(bonusSource(s, d)), visualDensity: VisualDensity.compact),
                            ]),
                            const SizedBox(height: 8),
                            Text(bonusLabel(s, d),
                                key: const Key('bonusStatus'),
                                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: _bonusColor(context, d.eligible))),
                            const SizedBox(height: 4),
                            Text(d.reason, key: const Key('bonusReason')),
                            if (!d.isLocked) ...[
                              const SizedBox(height: 8),
                              Text(s.get('dash_estimate_note'), style: TextStyle(color: colors.outline, fontSize: 12)),
                            ],
                            for (final n in d.notes) ...[
                              const SizedBox(height: 8),
                              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Icon(Icons.info_outline, size: 18, color: colors.outline),
                                const SizedBox(width: 6),
                                Expanded(child: Text(n, style: TextStyle(color: colors.outline, fontSize: 13))),
                              ]),
                            ],
                          ]),
                        ),
                      ),
                      _section(s.get('dash_leaves'), [
                        if (d.leaves.isEmpty) Text(s.get('dash_none'), style: TextStyle(color: colors.outline)),
                        for (final l in d.leaves)
                          ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(l.type.startsWith('إجازة') ? Icons.beach_access : Icons.event_busy, color: SanadColors.gold),
                            title: Text(l.type),
                            subtitle: l.note == null || l.note!.isEmpty ? null : Text(l.note!, maxLines: 2, overflow: TextOverflow.ellipsis),
                            trailing: Text('${_dm(l.from)}${l.to == null || l.to == l.from ? '' : ' – ${_dm(l.to!)}'}'),
                          ),
                      ]),
                      _section(s.get('dash_penalties'), [
                        if (d.penalties.isEmpty) Text(s.get('dash_none'), style: TextStyle(color: colors.outline)),
                        for (final p in d.penalties)
                          ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.gavel, color: colors.error),
                            title: Text(p.type),
                            subtitle: p.reason == null ? null : Text(p.reason!),
                            trailing: Text(_dm(p.date)),
                          ),
                      ]),
                      _section(s.get('dash_ask'), [
                        Wrap(spacing: 8, runSpacing: 4, children: [
                          for (final k in ['dash_q_bonus', 'dash_q_deduction', 'dash_q_late'])
                            ActionChip(key: Key(k), label: Text(s.get(k)), onPressed: () => _ask(s.get(k))),
                        ]),
                        const SizedBox(height: 8),
                        TextField(
                          key: const Key('askField'),
                          controller: _question,
                          maxLength: 200,
                          decoration: InputDecoration(
                            hintText: s.get('dash_ask_hint'),
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(key: const Key('askSend'), icon: const Icon(Icons.send), onPressed: _ask),
                          ),
                          onSubmitted: (_) => _ask(),
                        ),
                        if (_answer != null)
                          Container(
                            key: const Key('askAnswer'),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: colors.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: SanadColors.gold),
                            ),
                            child: Text(_answer!.text),
                          ),
                      ]),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
    );
  }
}
