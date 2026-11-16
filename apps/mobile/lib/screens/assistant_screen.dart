import 'package:flutter/material.dart';

import '../l10n.dart';
import '../sanad/ask.dart';
import '../sanad/dashboard_service.dart';
import '../theme.dart';

class _Msg {
  const _Msg(this.text, {required this.mine});
  final String text;
  final bool mine;
}

/// "Sanad assistant" (PRD 18.1-18.2): the question box as a chat.
/// Answers come only from the signed-in employee's own dashboard (see sanad/ask.dart). No AI.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key, required this.strings, required this.isArabic, required this.service, required this.firstName, this.onLeaveRequest});
  final Strings strings;
  final bool isArabic;
  final DashboardService service;
  final String firstName;
  final VoidCallback? onLeaveRequest;

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  Dashboard? _d;
  bool _failed = false;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  late final List<_Msg> _msgs = [_Msg(widget.strings.get('assistant_hello').replaceAll('{name}', widget.firstName), mine: false)];

  @override
  void initState() {
    super.initState();
    widget.service.load().then((d) {
      if (mounted) setState(() => _d = d);
    }).catchError((_) {
      if (mounted) setState(() => _failed = true);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send([String? preset]) {
    final s = widget.strings;
    final q = (preset ?? _input.text).trim();
    if (q.isEmpty) return;
    _input.clear();
    final d = _d;
    final reply = d == null
        ? s.get(_failed ? 'dash_error_generic' : 'assistant_loading')
        : answerQuestion(d, q, arabic: widget.isArabic).text;
    setState(() {
      _msgs.add(_Msg(q, mine: true));
      _msgs.add(_Msg(reply, mine: false));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final colors = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.smart_toy, color: SanadColors.goldLight),
          const SizedBox(width: 8),
          Text(s.get('assistant_title')),
        ]),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              key: const Key('assistantList'),
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: _msgs.length,
              itemBuilder: (_, i) {
                final m = _msgs[i];
                return Align(
                  alignment: m.mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
                  child: Container(
                    key: m.mine ? null : Key('assistantReply$i'),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: m.mine ? SanadColors.navy : (dark ? SanadColors.navySoft : const Color(0xFFE9EEF6)),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(m.text, style: TextStyle(color: m.mine ? Colors.white : colors.onSurface, height: 1.5)),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Wrap(spacing: 8, runSpacing: 4, children: [
              for (final k in ['dash_q_bonus', 'dash_q_deduction', 'dash_q_late', 'assistant_q_leave'])
                ActionChip(key: Key('chip_$k'), label: Text(s.get(k)), onPressed: () => _send(s.get(k))),
              if (widget.onLeaveRequest != null)
                ActionChip(
                  key: const Key('chip_leave_request'),
                  avatar: const Icon(Icons.flight_takeoff, size: 18),
                  label: Text(s.get('leave_request')),
                  onPressed: widget.onLeaveRequest,
                ),
            ]),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    key: const Key('assistantInput'),
                    controller: _input,
                    maxLength: 200,
                    decoration: InputDecoration(
                      hintText: s.get('assistant_hint'),
                      counterText: '',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(28)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  key: const Key('assistantSend'),
                  style: IconButton.styleFrom(backgroundColor: SanadColors.navy, foregroundColor: SanadColors.goldLight),
                  icon: const Icon(Icons.send),
                  onPressed: _send,
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
