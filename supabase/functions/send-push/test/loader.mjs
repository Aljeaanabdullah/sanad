// Node test loader for send-push: maps the Deno-style imports to local fakes.
export async function resolve(specifier, context, next) {
  if (specifier === 'npm:@supabase/supabase-js@2') return { url: new URL('./fake-supabase.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('jsr:')) return { url: new URL('./empty.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
