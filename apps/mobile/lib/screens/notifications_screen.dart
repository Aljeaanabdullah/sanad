import 'package:flutter/material.dart';

import '../l10n.dart';
import '../sanad/notifications_service.dart';
import '../theme.dart';
import 'requests_screens.dart' show leaveTypeLabel;

/// Icon, colour, title and body of one notification.
({IconData icon, Color color, String title, String body}) noticeView(Strings s, NoticeItem n, MaterialLocalizations loc) {
  String day(Object? iso) => iso == null ? '' : loc.formatMediumDate(DateTime.parse(iso as String));
  final d = n.data;
  switch (n.kind) {
    case 'request_decided':
      final approved = d['decision'] == 'approved';
      final finalStep = d['stage'] == 'hr' || d['status'] == 'approved' || d['status'] == 'rejected';
      final what = d['request_type'] == 'leave' ? leaveTypeLabel(s, d['leave_type'] as String?) : s.get('type_${d['request_type']}');
      final range = d['to'] == null ? day(d['date']) : '${day(d['date'])} – ${day(d['to'])}';
      final title = !approved
          ? s.get('notice_rejected')
          : (finalStep ? s.get('notice_approved') : s.get('notice_supervisor_ok'));
      return (
        icon: approved ? Icons.check_circle : Icons.cancel,
        color: approved ? SanadColors.ok : const Color(0xFFC62828),
        title: '$title: $what',
        body: [range, if (d['note'] != null) d['note'] as String].join('\n'),
      );
    case 'late':
      return (
        icon: Icons.warning_amber_rounded,
        color: const Color(0xFFE6A100),
        title: s.get('notice_late'),
        body: '${day(d['date'])} · ${s.get('notice_minutes').replaceAll('{n}', '${d['minutes'] ?? 0}')}',
      );
    case 'leave_recorded':
      return (
        icon: Icons.beach_access,
        color: SanadColors.gold,
        title: '${s.get('notice_leave_recorded')}: ${leaveTypeLabel(s, d['type'] as String?)}',
        body: d['to'] == null ? day(d['from']) : '${day(d['from'])} – ${day(d['to'])}',
      );
    case 'penalty_recorded':
      return (
        icon: Icons.info,
        color: const Color(0xFF1565C0),
        title: '${s.get('notice_penalty')}: ${d['type'] ?? ''}',
        body: [day(d['date']), if (d['reason'] != null) d['reason'] as String].join(' · '),
      );
    case 'bonus_list':
      final ok = d['eligibility'] == 'مستحق';
      return (
        icon: Icons.emoji_events,
        color: SanadColors.gold,
        title: '${s.get('notice_bonus')} ${d['month'] ?? ''}',
        body: ok ? s.get('dash_eligible') : '${s.get('dash_not_eligible')}${d['reason'] == null ? '' : ': ${d['reason']}'}',
      );
    default:
      return (icon: Icons.notifications, color: SanadColors.gold, title: n.kind, body: '');
  }
}

String ago(Strings s, DateTime at, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(at);
  if (diff.inMinutes < 60) return s.get('ago_minutes').replaceAll('{n}', '${diff.inMinutes.clamp(1, 59)}');
  if (diff.inHours < 24) return s.get('ago_hours').replaceAll('{n}', '${diff.inHours}');
  return s.get('ago_days').replaceAll('{n}', '${diff.inDays}');
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.strings, required this.service});
  final Strings strings;
  final NotificationsService service;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<NoticeItem>? _items;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await widget.service.mine();
      if (mounted) setState(() => _items = items);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final loc = MaterialLocalizations.of(context);
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(s.get('notifications'))),
      body: items == null
          ? Center(child: _failed ? Text(s.get('error_generic')) : const CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (items.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(s.get('notifications_none'), textAlign: TextAlign.center)),
                  for (final n in items)
                    Builder(builder: (context) {
                      final v = noticeView(s, n, loc);
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(backgroundColor: v.color.withValues(alpha: 0.15), child: Icon(v.icon, color: v.color)),
                          title: Text(v.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text('${v.body}\n${ago(s, n.at)}'),
                          isThreeLine: true,
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}
