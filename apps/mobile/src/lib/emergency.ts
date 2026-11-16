// Emergency server calls (PRD 8). The server decides everything: my_active_emergency returns only the
// signed-in employee's own active emergency; emergency_respond accepts a press only from a target and
// only while it is active, and measures the distance to the safe building itself.
import type { ActiveEmergency, MyPosition, ResponseStatus } from './emergencyMap';
import { supabase } from './supabase';

export class EmergencyError extends Error {
  constructor(public code: 'not_active' | 'not_target' | 'generic') {
    super(code);
  }
}

export async function myActiveEmergency(): Promise<ActiveEmergency | null> {
  const { data, error } = await supabase.rpc('my_active_emergency');
  if (error) throw error;
  return (data as ActiveEmergency | null) ?? null;
}

export type RespondResult = { status: ResponseStatus; distance_m: number | null; inside_safe: boolean | null };

/** Sends "arrived" / "safe elsewhere" with the location read at the moment of pressing (if any). */
export async function respondToEmergency(id: string, status: ResponseStatus, at: MyPosition | null): Promise<RespondResult> {
  const { data, error } = await supabase.rpc('emergency_respond', {
    p_emergency: id,
    p_status: status,
    p_lat: at?.lat ?? null,
    p_lng: at?.lng ?? null,
    p_accuracy: at?.accuracy != null ? Math.max(0, at.accuracy) : null,
  });
  if (error) {
    const msg = error.message ?? '';
    throw new EmergencyError(msg.includes('not_active') ? 'not_active' : msg.includes('not_target') ? 'not_target' : 'generic');
  }
  return data as RespondResult;
}
