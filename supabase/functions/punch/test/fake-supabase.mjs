// A tiny in-memory stand-in for the service-role Supabase client used by the punch and device-key functions.
export const state = { reset() {} };

export function setup(s) {
  Object.assign(state, {
    user: { id: 'u1' },
    employee: { id: 'e1', is_active: true },
    device: { id: 'd1', device_identifier: 'dev-1', platform: 'android', public_key: null, key_attested: false },
    settings: { require_device_signature: false, allow_face_descriptor: true, allow_unattested_ios: true },
    // nonce -> { purpose, expired, used }
    challenges: {},
    updates: [],
    consents: 1,
    recent: [],
    slot: { punch_type: 'check_in', shift_date: '2026-11-16', shift_start: '2026-11-16T05:00:00Z', reason: null },
    near: [{ site_id: 's1', name_ar: 'المقر', name_en: 'HQ', distance_m: 20, radius_m: 150, by_mission: false }],
    faceDistance: 0.3,
    inserted: [],
    rpcCalls: [],
    uploads: [],
  }, s);
}

function query(table) {
  const q = {
    _head: false,
    select(_cols, opts) { if (opts?.head) q._head = true; return q; },
    eq() { return q; },
    order() { return q; },
    limit() {
      if (table === 'attendance_punches') return Promise.resolve({ data: state.recent });
      return q;
    },
    maybeSingle() {
      if (table === 'employees') return Promise.resolve({ data: state.employee });
      if (table === 'devices') return Promise.resolve({ data: state.device });
      if (table === 'punch_security_settings') return Promise.resolve({ data: state.settings });
      if (table === 'attendance_days') return Promise.resolve({ data: { arrival: 'on_time', late_minutes: 0 } });
      return Promise.resolve({ data: null });
    },
    then(res) {
      if (table === 'consents' && q._head) return Promise.resolve({ count: state.consents }).then(res);
      return Promise.resolve({ data: [] }).then(res);
    },
    update(row) {
      const u = { eq: () => u, is: () => u, select: () => {
        if (table !== 'devices' || !state.device || state.device.public_key) return Promise.resolve({ data: [] });
        state.updates.push(row);
        Object.assign(state.device, row);
        return Promise.resolve({ data: [{ id: state.device.id }] });
      } };
      return u;
    },
    insert(row) {
      state.inserted.push(row);
      return { select: () => ({ single: () => Promise.resolve({ data: { id: 'p1' } }) }) };
    },
  };
  return q;
}

export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t) => query(t),
    rpc: async (name, args) => {
      state.rpcCalls.push(name);
      if (name === 'punch_slot') return { data: [state.slot] };
      if (name === 'sites_near') return { data: state.near };
      if (name === 'face_distance') return { data: state.faceDistance };
      if (name === 'consume_device_challenge') {
        const c = state.challenges[args.p_nonce];
        if (!c || c.used || c.purpose !== args.p_purpose) return { data: 'unknown' };
        c.used = true;
        return { data: c.expired ? 'expired' : 'ok' };
      }
      return { data: null };
    },
    storage: { from: () => ({ upload: async (path) => { state.uploads.push(path); return { error: null }; } }) },
  };
}
