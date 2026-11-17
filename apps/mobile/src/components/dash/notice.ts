// One in-app notification (RPC `my_notifications`) -> icon, tone, title and body text.
// Pure so it can be tested. The first kinds (request_decided, late, leave_recorded, penalty_recorded,
// bonus_list) are worded here from their data; the Phase 9 kinds use the text the server stored in both
// languages (the same text the push notification showed). Where a tap goes: routeFor (lib/notify).
import type { Notice } from '../../lib/api';
import { NOTIFICATION_KINDS, routeFor } from '../../lib/notify';
import { typeLabel } from '../../lib/calendarView';
import { mediumDate, monthYear, parseYmd } from '../../lib/dates';
import type { T } from '../../lib/i18n';
import type { IconName } from '../ui';

export type NoticeView = {
  icon: IconName;
  tone: 'ok' | 'danger' | 'warn' | 'accent' | 'primary' | 'muted';
  title: string;
  body: string;
  /** Where tapping the notice goes (null = not tappable). */
  href: string | null;
};

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

export function noticeView(n: Notice, t: T): NoticeView {
  const lang = t.lang;
  const day = (v: unknown) => {
    const s = str(v);
    return s ? mediumDate(parseYmd(s.slice(0, 10)), lang) : '';
  };
  const range = (from: unknown, to: unknown) => (str(to) && str(to) !== str(from) ? `${day(from)} – ${day(to)}` : day(from));
  const d = n.data;
  switch (n.kind) {
    case 'request_decided': {
      const approved = d.decision === 'approved';
      const finalStep = d.stage === 'hr' || d.status === 'approved' || d.status === 'rejected';
      const what = d.request_type === 'leave' ? typeLabel(t, t.isAr, str(d.leave_type)) || t('type_leave') : t(`type_${String(d.request_type)}`);
      const title = !approved ? t('notice_rejected') : finalStep ? t('notice_approved') : t('notice_supervisor_ok');
      return {
        icon: approved ? 'checkmark-circle' : 'close-circle',
        tone: approved ? 'ok' : 'danger',
        title: `${title}: ${what}`,
        body: [range(d.date, d.to), str(d.note)].filter(Boolean).join('\n'),
        href: routeFor(n.kind, d),
      };
    }
    case 'late':
      return {
        icon: 'time-outline',
        tone: 'warn',
        title: t('notice_late'),
        body: `${day(d.date)} · ${t('notice_minutes', { n: Number(d.minutes ?? 0) })}`,
        href: '/reports',
      };
    case 'leave_recorded':
      return {
        icon: 'airplane-outline',
        tone: 'primary',
        title: `${t('notice_leave_recorded')}: ${typeLabel(t, t.isAr, str(d.type))}`,
        body: range(d.from, d.to),
        href: '/dashboard',
      };
    case 'penalty_recorded':
      return {
        icon: 'alert-circle-outline',
        tone: 'danger',
        title: `${t('notice_penalty')}: ${typeLabel(t, t.isAr, str(d.type))}`,
        body: [day(d.date), str(d.reason)].filter(Boolean).join(' · '),
        href: '/dashboard',
      };
    case 'bonus_list': {
      const m = str(d.month);
      const valid = !!m && /^\d{4}-\d{2}$/.test(m);
      const month = valid ? monthYear(new Date(Number(m!.slice(0, 4)), Number(m!.slice(5, 7)) - 1, 1), lang) : (m ?? '');
      const ok = d.eligibility === 'مستحق';
      const reason = str(d.reason);
      return {
        icon: 'trophy-outline',
        tone: ok ? 'ok' : 'accent',
        title: `${t('notice_bonus')} ${month}`.trim(),
        body: ok ? t('dash_eligible') : `${t('dash_not_eligible')}${reason ? `: ${reason}` : ''}`,
        href: valid ? `/dashboard?month=${m}` : '/dashboard',
      };
    }
    default: {
      const look = LOOK[n.kind];
      const title = (lang === 'en' ? n.title?.en : n.title?.ar) || n.title?.ar || t('notifications');
      const body = (lang === 'en' ? n.body?.en : n.body?.ar) || n.body?.ar || '';
      const known = (NOTIFICATION_KINDS as readonly string[]).includes(n.kind);
      const href = known ? routeFor(n.kind, d) : null;
      return {
        icon: look?.icon ?? 'notifications-outline',
        tone: look?.tone ?? 'muted',
        title,
        body,
        // The list itself is not a destination.
        href: href === '/notifications' ? null : href,
      };
    }
  }
}

const LOOK: Record<string, { icon: IconName; tone: NoticeView['tone'] }> = {
  shift_reminder: { icon: 'alarm-outline', tone: 'primary' },
  late_warning: { icon: 'time-outline', tone: 'warn' },
  checkout_reminder: { icon: 'log-out-outline', tone: 'primary' },
  missing_checkout: { icon: 'alert-circle-outline', tone: 'danger' },
  sup_not_in: { icon: 'people-outline', tone: 'warn' },
  sup_absent: { icon: 'person-remove-outline', tone: 'danger' },
  sup_missing_checkout: { icon: 'exit-outline', tone: 'warn' },
  sup_failed_verification: { icon: 'shield-outline', tone: 'danger' },
  request_to_approve: { icon: 'document-text-outline', tone: 'primary' },
  emergency_alert: { icon: 'warning-outline', tone: 'danger' },
};
