import 'package:flutter/material.dart';

import '../l10n.dart';
import '../requests/requests_service.dart';
import '../theme.dart';
import 'requests_screens.dart' show leaveTypeLabel;

/// Sanad (PRD 7.1, 18.2): a leave request from the phone. Same approval path as other requests;
/// after the final approval the server records it in the leaves table.
class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({super.key, required this.strings, required this.isArabic, required this.service, this.today});
  final Strings strings;
  final bool isArabic;
  final RequestsService service;
  final DateTime? today; // for tests

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  String _type = leaveTypes.first;
  DateTime? _from;
  DateTime? _to;
  final _reason = TextEditingController();
  String? _error;
  bool _sending = false;

  DateTime get _today {
    final t = widget.today ?? DateTime.now();
    return DateTime(t.year, t.month, t.day);
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool from) async {
    final first = _today.subtract(const Duration(days: 7));
    final last = _today.add(const Duration(days: 180));
    final initial = (from ? _from : (_to ?? _from)) ?? _today;
    final d = await showDatePicker(
      context: context,
      firstDate: from ? first : (_from ?? first),
      lastDate: last,
      initialDate: initial.isBefore(first) ? first : initial,
    );
    if (d == null) return;
    setState(() {
      if (from) {
        _from = d;
        if (_to != null && _to!.isBefore(d)) _to = d;
      } else {
        _to = d;
      }
      _error = null;
    });
  }

  Future<void> _send() async {
    final s = widget.strings;
    if (_from == null || _to == null) {
      setState(() => _error = s.get('leave_pick_dates'));
      return;
    }
    // The reason is optional for the employee; the server needs a short text, so the type is used.
    final reason = _reason.text.trim().length >= 3 ? _reason.text.trim() : _type;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.service.submitLeave(leaveType: _type, from: _from!, to: _to!, reason: reason);
      if (!mounted) return;
      setState(() => _sending = false);
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          key: const Key('leaveSent'),
          icon: const Icon(Icons.check_circle, color: SanadColors.ok, size: 48),
          title: Text(s.get('leave_sent_title')),
          content: Text(s.get('leave_sent_body')),
          actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: Text(s.get('ok')))],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on RequestError catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = s.get('req_error_${e.code}');
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = s.get('error_generic');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final loc = MaterialLocalizations.of(context);
    final colors = Theme.of(context).colorScheme;
    final days = _from != null && _to != null ? _to!.difference(_from!).inDays + 1 : null;

    Widget dateField(String label, DateTime? value, bool from, Key key) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            OutlinedButton(
              key: key,
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14)),
              onPressed: _sending ? null : () => _pick(from),
              child: Row(children: [
                Expanded(child: Text(value == null ? s.get('leave_choose_date') : loc.formatMediumDate(value))),
                const Icon(Icons.calendar_month),
              ]),
            ),
            const SizedBox(height: 16),
          ],
        );

    return Scaffold(
      appBar: AppBar(title: Text(s.get('leave_request'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(s.get('leave_type'), style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            key: const Key('leaveType'),
            initialValue: _type,
            decoration: const InputDecoration(border: OutlineInputBorder(), prefixIcon: Icon(Icons.flight_takeoff)),
            items: [for (final t in leaveTypes) DropdownMenuItem(value: t, child: Text(leaveTypeLabel(s, t)))],
            onChanged: _sending ? null : (v) => setState(() => _type = v ?? _type),
          ),
          const SizedBox(height: 16),
          dateField(s.get('leave_start'), _from, true, const Key('leaveFrom')),
          dateField(s.get('leave_end'), _to, false, const Key('leaveTo')),
          if (days != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(s.get('leave_days_count').replaceAll('{n}', '$days'), key: const Key('leaveDays'), style: TextStyle(color: colors.outline)),
            ),
          Text(s.get('leave_reason'), style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          TextField(
            key: const Key('leaveReason'),
            controller: _reason,
            maxLength: 300,
            maxLines: 2,
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
          Text(s.get('leave_path_note'), style: TextStyle(color: colors.outline, fontSize: 12)),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, key: const Key('leaveError'), style: TextStyle(color: colors.error)),
            ),
          const SizedBox(height: 24),
          SizedBox(
            height: 56,
            child: FilledButton.icon(
              key: const Key('leaveSend'),
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFC62828), foregroundColor: Colors.white),
              icon: _sending
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.send),
              label: Text(s.get('leave_send'), style: const TextStyle(fontSize: 18)),
              onPressed: _sending ? null : _send,
            ),
          ),
        ],
      ),
    );
  }
}
