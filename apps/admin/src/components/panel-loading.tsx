// The shape of a screen, at rest, while its data loads.
// Used by loading.tsx on screens that never redirect or 404: a streamed fallback fixes the status at 200.
export function PanelLoading() {
  return (
    <div className="flex max-w-6xl flex-col gap-5" role="status" aria-busy="true">
      <span className="sr-only">جاري التحميل… Loading…</span>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="skeleton h-24 rounded-2xl!" />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-40" />
            <div className="skeleton hidden h-4 w-28 sm:block" />
            <div className="skeleton ms-auto h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
