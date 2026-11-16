// Push notifications, pure part (testable): where a notification opens, the permission card state,
// unread counts. The native part is src/lib/push.ts. Kinds match supabase/migrations/*_push_notifications.sql.

/** Every kind the server queues (emergency_alert is used by Phase 11). */
export const NOTIFICATION_KINDS = [
  'shift_reminder', 'late_warning', 'checkout_reminder', 'missing_checkout',
  'sup_not_in', 'sup_absent', 'sup_missing_checkout', 'sup_failed_verification',
  'request_decided', 'request_to_approve', 'leave_recorded', 'penalty_recorded', 'bonus_list',
  'late', 'emergency_alert',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

/** The screen a notification opens (in-app list and a tap on the phone notification). */
export function routeFor(kind: string, data: Record<string, unknown> | null | undefined): string {
  const d = data ?? {};
  switch (kind) {
    case 'shift_reminder':
    case 'late_warning':
    case 'checkout_reminder':
    case 'missing_checkout':
      return '/';
    case 'request_decided': {
      const r = id(d.request_id);
      return r ? `/request/${r}` : '/requests';
    }
    case 'request_to_approve':
      return '/approvals';
    case 'late':
      return '/reports';
    case 'leave_recorded':
    case 'penalty_recorded':
      return '/dashboard';
    case 'bonus_list': {
      const m = typeof d.month === 'string' && /^\d{4}-\d{2}$/.test(d.month) ? d.month : null;
      return m ? `/dashboard?month=${m}` : '/dashboard';
    }
    case 'sup_failed_verification': {
      const e = id(d.employee_id);
      return e ? `/record/${e}` : '/notifications';
    }
    case 'sup_not_in':
    case 'sup_absent':
    case 'sup_missing_checkout': {
      // One employee: open their month record; several: the list shows them all.
      const list = Array.isArray(d.employees) ? (d.employees as { id?: unknown }[]) : [];
      const e = list.length === 1 ? id(list[0]?.id) : null;
      return e ? `/record/${e}` : '/notifications';
    }
    default:
      return '/notifications';
  }
}

/** The FCM data payload of a tapped notification (all values are strings) -> kind, id and route. */
export function fromPushData(raw: Record<string, unknown> | null | undefined): { kind: string; id: string | null; route: string } | null {
  if (!raw) return null;
  let d = raw;
  // Some Android paths hand the payload over as one JSON string.
  if (typeof raw.dataString === 'string') {
    try {
      d = { ...JSON.parse(raw.dataString), ...raw };
    } catch {
      /* keep raw */
    }
  }
  const kind = typeof d.kind === 'string' ? d.kind : null;
  if (!kind) return null;
  return { kind, id: id(d.notification_id), route: routeFor(kind, d) };
}

export type PermissionInfo = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };
/** hidden = nothing to show; ask = explain, then the system prompt; settings = denied for good, open Settings. */
export type PromptState = 'hidden' | 'ask' | 'settings';
export const PROMPT_SNOOZE_DAYS = 7;

/**
 * The notifications card on Home (only shown after sign-in, never on first launch).
 * "Not now" hides it for 7 days.
 */
export function promptState(
  perm: PermissionInfo | null,
  opts: { isDevice: boolean; dismissedAt: number | null; now: number },
): PromptState {
  if (!opts.isDevice || !perm || perm.status === 'granted') return 'hidden';
  if (opts.dismissedAt != null && opts.now - opts.dismissedAt < PROMPT_SNOOZE_DAYS * 86400e3) return 'hidden';
  return perm.canAskAgain ? 'ask' : 'settings';
}

/** Unread notifications (badge on the Home bell). */
export function unreadCount(items: { readAt: Date | null }[]): number {
  return items.filter((x) => x.readAt == null).length;
}
