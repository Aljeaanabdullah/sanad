// Emergency screen helpers (PRD 8.4, 8.6) with no native imports, so they are unit tested directly:
// distance to the safe building and the HTML of the map shown in a WebView (Leaflet + OpenStreetMap).
// To switch to Google Maps later, only buildMapHtml changes (CLAUDE.md: one map interface).

export type Hazard = 'fire' | 'gas_leak' | 'other';
export type ResponseStatus = 'arrived' | 'safe_elsewhere';

export type EmergencyBuilding = {
  kind: 'danger' | 'safe';
  name_ar: string;
  name_en: string;
  lat: number;
  lng: number;
  radius: number;
};

export type ActiveEmergency = {
  id: string;
  hazard: Hazard;
  is_drill: boolean;
  started_at: string;
  message_ar: string | null;
  message_en: string | null;
  site: { name_ar: string; name_en: string; lat: number; lng: number };
  buildings: EmergencyBuilding[];
  response: { status: ResponseStatus; responded_at: string; distance_m: number | null } | null;
};

export type Point = { lat: number; lng: number };
export type MyPosition = Point & { accuracy?: number | null };

/** Great-circle distance in metres (same formula as the server). */
export function distanceM(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const safeBuilding = (e: Pick<ActiveEmergency, 'buildings'>) => e.buildings.find((b) => b.kind === 'safe') ?? null;
export const dangerBuildings = (e: Pick<ActiveEmergency, 'buildings'>) => e.buildings.filter((b) => b.kind === 'danger');

/** Where the employee stands relative to the safe building, for the line under the map. */
export function safeStatus(me: MyPosition | null, safe: EmergencyBuilding | null): { metres: number; inside: boolean } | null {
  if (!me || !safe) return null;
  const metres = Math.round(distanceM(me, safe));
  return { metres, inside: metres <= safe.radius };
}

/** Compass bearing (0 = north, clockwise) from a to b; used for the "go this way" arrow. */
export function bearing(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const RED = '#D32F2F';
const GREEN = '#2E7D32';
const BLUE = '#1565C0';

/** JSON that is safe inside a <script> tag (no "</script>", no line separators). */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/[\u2028\u2029]/g, (ch) => (ch === '\u2028' ? '\\u2028' : '\\u2029'));
}

/**
 * A full HTML page with the emergency map. Danger buildings are red circles, the safe building
 * a green circle, the employee a blue dot with a dashed line to the safe building.
 * The page exposes window.setMe(lat, lng, accuracy) so the screen can move the dot without reloading.
 */
export function buildMapHtml(e: Pick<ActiveEmergency, 'buildings' | 'site'>, opts: { lang: 'ar' | 'en'; dark: boolean; me?: MyPosition | null }): string {
  const name = (b: EmergencyBuilding) => (opts.lang === 'ar' ? b.name_ar : b.name_en);
  const data = {
    buildings: e.buildings.map((b) => ({ lat: b.lat, lng: b.lng, radius: b.radius, color: b.kind === 'safe' ? GREEN : RED, label: name(b), safe: b.kind === 'safe' })),
    site: { lat: e.site.lat, lng: e.site.lng },
    me: opts.me ? { lat: opts.me.lat, lng: opts.me.lng, accuracy: opts.me.accuracy ?? null } : null,
    blue: BLUE,
  };
  const bg = opts.dark ? '#0B1628' : '#F6F1E6';
  // Dark mode: darken the OpenStreetMap tiles (the coloured circles are drawn above, unchanged).
  const tileFilter = opts.dark ? 'filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9);' : '';
  return `<!doctype html>
<html dir="ltr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
html, body, #map { margin: 0; height: 100%; background: ${bg}; }
.leaflet-tile-pane { ${tileFilter} }
.lbl { font: 600 13px system-ui, sans-serif; padding: 2px 6px; }
</style>
</head><body>
<div id="map"></div>
<script>
(function () {
  var D = ${scriptJson(data)};
  function post(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); }
  if (!window.L) { post('map_error'); return; }
  var map = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  var bounds = [];
  var safe = null;
  D.buildings.forEach(function (b) {
    L.circle([b.lat, b.lng], { radius: b.radius, color: b.color, weight: 3, fillColor: b.color, fillOpacity: 0.35 })
      .addTo(map)
      .bindTooltip(b.label, { permanent: true, direction: 'top', className: 'lbl' });
    bounds.push([b.lat, b.lng]);
    if (b.safe) safe = b;
  });
  if (!bounds.length) bounds.push([D.site.lat, D.site.lng]);
  var meDot = null, meRing = null, line = null;
  window.setMe = function (lat, lng, accuracy) {
    var p = [lat, lng];
    if (!meDot) {
      meRing = L.circle(p, { radius: accuracy || 0, color: D.blue, weight: 1, fillOpacity: 0.1 }).addTo(map);
      meDot = L.circleMarker(p, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: D.blue, fillOpacity: 1 }).addTo(map);
    } else {
      meDot.setLatLng(p);
      meRing.setLatLng(p);
    }
    meRing.setRadius(accuracy || 0);
    if (safe) {
      if (line) line.setLatLngs([p, [safe.lat, safe.lng]]);
      else line = L.polyline([p, [safe.lat, safe.lng]], { color: '${GREEN}', weight: 4, dashArray: '8 8' }).addTo(map);
    }
  };
  if (D.me) { window.setMe(D.me.lat, D.me.lng, D.me.accuracy); bounds.push([D.me.lat, D.me.lng]); }
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
  post('map_ready');
})();
</script>
</body></html>`;
}
