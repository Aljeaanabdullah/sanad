import { allKeys, hasKey, makeT } from '../i18n';
import { bearing, buildMapHtml, dangerBuildings, distanceM, safeBuilding, safeStatus, scriptJson, type ActiveEmergency } from '../emergencyMap';
import { emergencyRouteFor, openEmergencyFromNotification } from '../emergencyNotification';

// Demo site 1: building A (danger) and building B (safe), about 140 m apart.
const emergency: ActiveEmergency = {
  id: '74620462-adbd-40c7-9467-17f57c3c5581',
  hazard: 'fire',
  is_drill: false,
  started_at: '2026-11-17T06:00:00Z',
  message_ar: null,
  message_en: null,
  site: { name_ar: 'موقع تجريبي ١', name_en: 'Demo site 1', lat: 29.379, lng: 47.989 },
  buildings: [
    { kind: 'danger', name_ar: 'المبنى أ', name_en: 'Building A', lat: 29.3794, lng: 47.9886, radius: 30 },
    { kind: 'safe', name_ar: 'المبنى ب', name_en: 'Building B', lat: 29.3785, lng: 47.9896, radius: 30 },
  ],
  response: null,
};

describe('distance to the safe building', () => {
  it('matches the server (139.3 m between A and B)', () => {
    const [a, b] = emergency.buildings;
    expect(distanceM(a, b)).toBeCloseTo(139.3, 0);
  });

  it('says inside within the radius and the metres outside it', () => {
    const safe = safeBuilding(emergency);
    expect(safeStatus({ lat: 29.3785, lng: 47.9896 }, safe)).toEqual({ metres: 0, inside: true });
    expect(safeStatus({ lat: 29.3794, lng: 47.9886 }, safe)).toEqual({ metres: 139, inside: false });
    expect(safeStatus(null, safe)).toBeNull();
    expect(dangerBuildings(emergency).map((b) => b.name_en)).toEqual(['Building A']);
  });

  it('points the way (bearing): north is 0, east is 90', () => {
    expect(bearing({ lat: 29, lng: 48 }, { lat: 29.01, lng: 48 })).toBeCloseTo(0, 0);
    expect(bearing({ lat: 0, lng: 48 }, { lat: 0, lng: 48.01 })).toBeCloseTo(90, 0);
  });
});

describe('map page (WebView)', () => {
  it('draws the danger building red, the safe building green, and the employee', () => {
    const html = buildMapHtml(emergency, { lang: 'ar', dark: false, me: { lat: 29.379, lng: 47.989, accuracy: 12 } });
    const data = JSON.parse(html.match(/var D = (.*);\n/)![1]);
    expect(data.buildings).toEqual([
      { lat: 29.3794, lng: 47.9886, radius: 30, color: '#D32F2F', label: 'المبنى أ', safe: false },
      { lat: 29.3785, lng: 47.9896, radius: 30, color: '#2E7D32', label: 'المبنى ب', safe: true },
    ]);
    expect(data.me).toEqual({ lat: 29.379, lng: 47.989, accuracy: 12 });
    expect(html).toContain('window.setMe = function');
    expect(html).toContain('integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="');
    expect(html).not.toContain('invert(1)');
  });

  it('uses English names and darkens the tiles in dark mode', () => {
    const html = buildMapHtml(emergency, { lang: 'en', dark: true });
    expect(html).toContain('"label":"Building B"');
    expect(html).toContain('invert(1)');
    expect(html).toContain('"me":null');
  });

  it('cannot be broken out of by a building name', () => {
    const evil = { ...emergency, buildings: [{ ...emergency.buildings[1], name_en: '</script><script>alert(1)</script> ' }] };
    const html = buildMapHtml(evil, { lang: 'en', dark: false });
    expect(html.match(/<\/script>/g)).toHaveLength(2); // only the page's own two script tags
    expect(scriptJson('a b<')).toBe('"a\\u2028b\\u003c"');
  });
});

describe('opening the screen from a notification', () => {
  it('handles only emergency alerts', () => {
    expect(emergencyRouteFor({ type: 'emergency_alert', emergency_id: emergency.id })).toBe(`/emergency?id=${emergency.id}`);
    expect(emergencyRouteFor({ type: 'emergency_alert', emergency_id: 'x/../../evil' })).toBe('/emergency');
    expect(emergencyRouteFor({ type: 'request_decided' })).toBeNull();
    expect(emergencyRouteFor(null)).toBeNull();
    expect(emergencyRouteFor('emergency_alert')).toBeNull();
  });

  it('pushes the route and reports whether it handled the tap', () => {
    const push = jest.fn();
    expect(openEmergencyFromNotification({ type: 'emergency_alert' }, { push })).toBe(true);
    expect(push).toHaveBeenCalledWith('/emergency');
    expect(openEmergencyFromNotification({ type: 'late' }, { push })).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('emergency texts', () => {
  it('exist in Arabic and English for every hazard and step', () => {
    const { ar, en } = allKeys();
    const mine = ar.filter((k) => k.startsWith('emg_'));
    expect(mine.length).toBeGreaterThan(30);
    expect(mine.filter((k) => !en.includes(k))).toEqual([]);
    for (const h of ['fire', 'gas_leak', 'other']) {
      expect(hasKey(`emg_hazard_${h}`)).toBe(true);
      expect(hasKey(`emg_steps_${h}`)).toBe(true);
    }
    expect(makeT('ar')('emg_arrived')).toBe('وصلت');
    expect(makeT('ar')('emg_safe_elsewhere')).toBe('أنا بأمان');
    expect(makeT('ar')('emg_distance', { m: 42 })).toBe('أنت على بعد 42 متر من المبنى الآمن.');
  });
});
