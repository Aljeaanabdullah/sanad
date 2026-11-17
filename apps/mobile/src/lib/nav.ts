// App navigation (PRD 18.2, owner decision 2026-11-17): a side menu opened from the header's
// three-line button, and one round Sanad button at the bottom centre that opens the assistant.
// The kit (Header, Screen) reads this context; it is null outside the signed-in app.
import { createContext, useContext } from 'react';
import type { IconName } from '../components/ui';
import type { Role } from './auth';

export type NavCtx = {
  openMenu: () => void;
  /** True while the Sanad button floats over the current screen (screens leave room for it). */
  sanadButton: boolean;
};

export const NavContext = createContext<NavCtx | null>(null);
export const useNav = () => useContext(NavContext);

export type MenuItem = {
  key: string;
  href: string;
  /** strings.json key */
  label: string;
  icon: IconName;
  iconOn: IconName;
};

/** Menu groups in order; a thin line separates groups. Approvals and lookup are for staff only. */
export function menuGroups(role: Role): MenuItem[][] {
  const groups: MenuItem[][] = [
    [
      { key: 'home', href: '/', label: 'menu_home', icon: 'home-outline', iconOn: 'home' },
      { key: 'requests', href: '/requests', label: 'menu_requests', icon: 'document-text-outline', iconOn: 'document-text' },
      { key: 'reports', href: '/reports', label: 'menu_reports', icon: 'calendar-outline', iconOn: 'calendar' },
      { key: 'dashboard', href: '/dashboard', label: 'menu_dashboard', icon: 'stats-chart-outline', iconOn: 'stats-chart' },
    ],
    // Services (they were the home screen's quick services until 2026-11-17).
    [
      { key: 'leave', href: '/leave', label: 'menu_leave', icon: 'airplane-outline', iconOn: 'airplane' },
      { key: 'assistant', href: '/assistant', label: 'menu_assistant', icon: 'chatbubbles-outline', iconOn: 'chatbubbles' },
    ],
    [
      { key: 'ideal-employee', href: '/ideal-employee', label: 'menu_ideal_employee', icon: 'ribbon-outline', iconOn: 'ribbon' },
      { key: 'ideas', href: '/ideas', label: 'menu_ideas', icon: 'bulb-outline', iconOn: 'bulb' },
      { key: 'notifications', href: '/notifications', label: 'menu_notifications', icon: 'notifications-outline', iconOn: 'notifications' },
      { key: 'emergency', href: '/emergency', label: 'menu_emergency', icon: 'warning-outline', iconOn: 'warning' },
    ],
  ];
  if (role !== 'employee') {
    groups.push([
      { key: 'approvals', href: '/approvals', label: 'menu_approvals', icon: 'checkmark-done-outline', iconOn: 'checkmark-done' },
      { key: 'lookup', href: '/lookup', label: 'menu_lookup', icon: 'people-outline', iconOn: 'people' },
    ]);
  }
  groups.push([{ key: 'settings', href: '/more', label: 'menu_settings', icon: 'person-circle-outline', iconOn: 'person-circle' }]);
  return groups;
}

/** The four section roots: they show the menu button (not Back) and the Sanad button floats over them. */
export const ROOT_PATHS = ['/', '/requests', '/reports', '/more'];

/** Is this menu item the current screen? Home matches only "/". */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type NavAction = { kind: 'none' } | { kind: 'home' } | { kind: 'replace'; href: string } | { kind: 'push'; href: string };

/**
 * How the menu moves to `href` from `pathname` so the history stays short: Home pops back to Home,
 * one section replaces another section, anything else is pushed (system Back returns).
 */
export function navAction(href: string, pathname: string): NavAction {
  if (isCurrent(href, pathname) && (href === pathname || href === '/')) return { kind: 'none' };
  if (href === '/') return { kind: 'home' };
  const fromSection = ROOT_PATHS.includes(pathname) && pathname !== '/';
  if (fromSection && ROOT_PATHS.includes(href)) return { kind: 'replace', href };
  return { kind: 'push', href };
}
