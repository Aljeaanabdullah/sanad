import { isCurrent, menuGroups, navAction } from '../nav';

const keys = (role: Parameters<typeof menuGroups>[0]) => menuGroups(role).flat().map((i) => i.key);

it('lists every section, with approvals and lookup for staff only', () => {
  expect(keys('employee')).toEqual(['home', 'requests', 'reports', 'dashboard', 'ideal-employee', 'ideas', 'notifications', 'emergency', 'assistant', 'settings']);
  for (const role of ['supervisor', 'hr', 'admin'] as const) {
    expect(keys(role)).toEqual(expect.arrayContaining(['approvals', 'lookup']));
  }
  const hrefs = Object.fromEntries(menuGroups('admin').flat().map((i) => [i.key, i.href]));
  expect(hrefs['ideal-employee']).toBe('/ideal-employee');
  expect(hrefs.ideas).toBe('/ideas');
  expect(hrefs.settings).toBe('/more');
});

it('marks the current item; Home only on "/"', () => {
  expect(isCurrent('/', '/')).toBe(true);
  expect(isCurrent('/', '/requests')).toBe(false);
  expect(isCurrent('/ideas', '/ideas')).toBe(true);
  expect(isCurrent('/ideas', '/ideas/12')).toBe(true);
  expect(isCurrent('/requests', '/request/9')).toBe(false);
});

it('keeps the history short', () => {
  expect(navAction('/', '/')).toEqual({ kind: 'none' });
  expect(navAction('/requests', '/requests')).toEqual({ kind: 'none' });
  expect(navAction('/', '/reports')).toEqual({ kind: 'home' });
  expect(navAction('/', '/dashboard')).toEqual({ kind: 'home' });
  // Section to section replaces; anything from Home or to a non-section is pushed.
  expect(navAction('/reports', '/requests')).toEqual({ kind: 'replace', href: '/reports' });
  expect(navAction('/requests', '/')).toEqual({ kind: 'push', href: '/requests' });
  expect(navAction('/ideas', '/more')).toEqual({ kind: 'push', href: '/ideas' });
  expect(navAction('/more', '/dashboard')).toEqual({ kind: 'push', href: '/more' });
});
