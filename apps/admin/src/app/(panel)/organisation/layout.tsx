import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { orgT } from "@/lib/i18n-org";
import { NavLink } from "@/components/nav-link";

const tabBase = "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap";
const tabClass = `${tabBase} border-transparent text-muted hover:border-line-strong hover:text-foreground`;
const activeTabClass = `${tabBase} border-primary font-medium text-primary`;

export default async function OrganisationLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const { lang } = await getPrefs();
  const o = orgT(lang);
  const tabs = [
    ["/organisation/departments", o.tabs.departments],
    ["/organisation/sites", o.tabs.sites],
    ["/organisation/work-patterns", o.tabs.workPatterns],
    ["/organisation/holidays", o.tabs.holidays],
    ["/organisation/punch-security", o.tabs.punchSecurity],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{o.title}</h1>
      <nav aria-label={o.title} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map(([href, label]) => (
          <NavLink key={href} href={href} className={tabClass} activeClassName={activeTabClass}>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
