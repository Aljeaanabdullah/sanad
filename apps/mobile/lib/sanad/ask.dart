import 'dashboard_service.dart';

/// "Ask Sanad" (PRD 18.1): answers an employee's question from THEIR OWN dashboard data only.
///
/// No AI and no server call: the question is only matched against a few topics
/// (bonus, penalty/deduction, late, absence, leave). Any instruction written inside the
/// question is never executed; it is just text that may or may not match a topic.
/// The answer can only contain data from [d], which the server already limited to one employee.
class AskAnswer {
  const AskAnswer(this.topic, this.text);
  final String topic; // bonus | penalty | late | absence | leave | unknown
  final String text;
}

String _normalize(String q) {
  var s = q.toLowerCase();
  s = s.replaceAll(RegExp('[ً-ْـ]'), ''); // harakat + tatweel
  s = s.replaceAll(RegExp('[أإآ]'), 'ا').replaceAll('ة', 'ه').replaceAll('ى', 'ي');
  return s;
}

const _topics = <String, List<String>>{
  'penalty': ['خصم', 'عقوب', 'انذار', 'لفت نظر', 'ايقاف', 'جزاء', 'deduct', 'penalt', 'warning', 'suspen'],
  'late': ['تاخير', 'تاخر', 'متاخر', 'late'],
  'absence': ['غياب', 'غايب', 'غائب', 'absen', 'absent'],
  'leave': ['اجاز', 'leave', 'vacation'],
  'bonus': ['مكافا', 'مكافئ', 'بونص', 'استحق', 'مستحق', 'bonus', 'eligib', 'reward'],
};

/// Finds the topic of [question]; "why no bonus" wins over the others when both appear.
String topicOf(String question) {
  final q = _normalize(question);
  final hits = [for (final e in _topics.entries) if (e.value.any(q.contains)) e.key];
  if (hits.isEmpty) return 'unknown';
  if (hits.contains('bonus') && !hits.contains('penalty')) return 'bonus';
  return hits.first;
}

String _dm(DateTime d) => '${d.day}/${d.month}';

const _typesEn = {
  'إجازة دورية': 'annual leave',
  'إجازة مرضية': 'sick leave',
  'إجازة طارئة': 'emergency leave',
  'إجازة بدون راتب': 'unpaid leave',
  'غياب': 'absence',
  'تأخير': 'late arrival',
  'إنذار': 'warning',
  'لفت نظر': 'notice',
  'خصم': 'deduction',
  'إيقاف': 'suspension',
};

AskAnswer answerQuestion(Dashboard d, String question, {required bool arabic}) {
  final topic = topicOf(question);
  final ar = arabic;
  String t(String a, String e) => ar ? a : e;
  String type(String v) => ar ? v : (_typesEn[v] ?? v);
  final period = t('فترة ${_dm(d.from)} إلى ${_dm(d.to)}', 'period ${_dm(d.from)} to ${_dm(d.to)}');
  final who = d.viewerIsSelf ? '' : t('(${d.nameAr} · ${d.fileNumber}) ', '(${d.nameEn} · ${d.fileNumber}) ');

  String bonus() {
    final official = d.hasOfficial
        ? t(d.isLocked ? 'حسب الكشف المعتمد' : 'حسب مسودة الكشف (لم يُقفل بعد)',
            d.isLocked ? 'according to the locked list' : 'according to the draft list (not locked yet)')
        : t('تقديرياً حسب بياناتك حتى الآن (الكشف لم يصدر بعد)',
            'estimated from your data so far (the list is not out yet)');
    if (d.eligible == null) {
      return t('$who$period: $official، ${d.reason}.', '$who$period: $official, ${d.reason}.');
    }
    if (d.eligible!) {
      return t('$whoأنت مستحق للمكافأة في $period، $official: لا إجازة فوق 10 أيام، ولا تأخير مرتين، ولا عقوبة.',
          '${who}You are eligible for the bonus in the $period, $official: no leave over 10 days, no 2 late arrivals, no penalty.');
    }
    return t('$whoأنت غير مستحق للمكافأة في $period، $official. السبب: ${d.reason}.',
        '${who}You are not eligible for the bonus in the $period, $official. Reason: ${d.reason}.');
  }

  String penalty() {
    if (d.penalties.isEmpty) {
      return t('$whoما عليك أي عقوبة في $period. وإذا تقصد خصماً من الراتب، فالرواتب خارج سند حالياً؛ راجع الموارد البشرية.',
          '${who}You have no penalty in the $period. If you mean a salary deduction, payroll is not in Sanad yet; please ask HR.');
    }
    final items = [
      for (final p in d.penalties)
        '${type(p.type)} ${t('بتاريخ', 'on')} ${_dm(p.date)}${p.reason == null || p.reason!.isEmpty ? '' : ' (${p.reason})'}'
    ].join(t('، ', ', '));
    return t('$whoعليك ${d.penalties.length} عقوبة في $period: $items. وأي عقوبة في الفترة تمنع المكافأة.',
        '${who}You have ${d.penalties.length} penalt${d.penalties.length == 1 ? 'y' : 'ies'} in the $period: $items. Any penalty in the period blocks the bonus.');
  }

  String late() {
    if (d.lateDates.isEmpty) {
      return t('$whoما سُجّل عليك أي تأخير في $period.', '${who}No late arrival is recorded for you in the $period.');
    }
    final dates = d.lateDates.map(_dm).join(t('، ', ', '));
    final mins = d.lateMinutes > 0 ? t(' (مجموع ${d.lateMinutes} دقيقة)', ' (${d.lateMinutes} minutes in total)') : '';
    final rule = d.lateDates.length >= 2
        ? t('وتأخير مرتين أو أكثر يمنع المكافأة.', 'Two or more late arrivals block the bonus.')
        : t('ومرة واحدة لا تمنع المكافأة.', 'One late arrival does not block the bonus.');
    return t('$whoتأخرت ${d.lateDates.length} مرة في $period: $dates$mins. $rule',
        '${who}You were late ${d.lateDates.length} time(s) in the $period: $dates$mins. $rule');
  }

  String absence() {
    if (d.absent == 0) {
      return t('$whoما عليك غياب في $period.', '${who}You have no absence in the $period.');
    }
    final unexcused = d.absentUnexcused > 0
        ? t('، منها ${d.absentUnexcused} بدون إجازة مسجلة (يراجعها المدير قبل قفل الكشف)',
            ', ${d.absentUnexcused} of them without a recorded leave (the manager reviews them before locking the list)')
        : t('، وكلها مغطاة بإجازات مسجلة', ', all covered by recorded leaves');
    return t('$whoعليك ${d.absent} يوم غياب في $period$unexcused.', '${who}You have ${d.absent} absent day(s) in the $period$unexcused.');
  }

  String leave() {
    final real = d.leaves.where((l) => l.type.startsWith('إجازة')).toList();
    if (real.isEmpty) {
      return t('$whoما عندك إجازات مسجلة في $period.', '${who}You have no recorded leave in the $period.');
    }
    final items = [
      for (final l in real)
        '${type(l.type)} ${_dm(l.from)}${l.to == null ? '' : '–${_dm(l.to!)}'} (${l.daysInPeriod} ${t('يوم في الفترة', 'days in period')})'
    ].join(t('، ', ', '));
    final rule = d.leaveDays > 10
        ? t('والمجموع أكثر من 10 أيام، وهذا يمنع المكافأة.', 'The total is over 10 days, which blocks the bonus.')
        : t('والمجموع لا يزيد عن 10 أيام، فلا يمنع المكافأة.', 'The total is not over 10 days, so it does not block the bonus.');
    return t('$whoمجموع إجازاتك ${d.leaveDays} يوم في $period: $items. $rule',
        '${who}Your leave in the $period is ${d.leaveDays} day(s): $items. $rule');
  }

  final text = switch (topic) {
    'bonus' => bonus(),
    'penalty' => penalty(),
    'late' => late(),
    'absence' => absence(),
    'leave' => leave(),
    _ => t('ما فهمت سؤالك. جرّب مثلاً: «ليش ما أخذت مكافأة؟» أو «ليش علي خصم؟» أو «كم مرة تأخرت؟». '
            'وللأسئلة الثانية تواصل مع الموارد البشرية.\n\n${bonus()}',
        'I did not understand. Try for example: "Why didn\'t I get a bonus?", "Why do I have a deduction?" or "How many times was I late?". '
            'For other questions please contact HR.\n\n${bonus()}'),
  };
  return AskAnswer(topic, text);
}
