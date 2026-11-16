// Opening the emergency screen from a push notification (Phase 11 <-> Phase 9).
// Phase 9's notification tap handler calls openEmergencyFromNotification(response.notification.request.content.data, router)
// first; it returns true when it handled the tap (data.type === 'emergency_alert').
// The payload comes from private.emergency_notify: { type: 'emergency_alert', emergency_id, hazard, ... }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The route for an emergency notification's data, or null when it is not one. */
export function emergencyRouteFor(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'emergency_alert') return null;
  const id = typeof d.emergency_id === 'string' && UUID.test(d.emergency_id) ? d.emergency_id : null;
  return id ? `/emergency?id=${id}` : '/emergency';
}

/** Opens the emergency screen for an emergency notification. Returns false for any other notification. */
export function openEmergencyFromNotification(data: unknown, router: { push: (href: never) => void }): boolean {
  const route = emergencyRouteFor(data);
  if (!route) return false;
  router.push(route as never);
  return true;
}
