// In-memory stand-in for the service-role client used by send-push: only rpc() is needed.
export const state = {};

export function setup(s = {}) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, { secretOk: true, batches: [], reports: [], calls: [] }, s);
}

export function createClient() {
  return {
    rpc: async (name, args) => {
      state.calls.push({ name, args });
      if (name === 'push_secret_ok') return { data: state.secretOk };
      if (name === 'push_claim') return { data: state.batches.shift() ?? [] };
      if (name === 'push_report') {
        state.reports.push(args);
        return { data: args.p_results.length };
      }
      return { data: null };
    },
  };
}
