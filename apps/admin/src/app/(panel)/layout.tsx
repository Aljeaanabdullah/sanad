import type { ReactNode } from "react";
import { requireStaff, type StaffRole } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { signOut } from "@/app/actions/auth";
import { chromeButtonClass, PrefsButtons } from "@/components/prefs-buttons";
import { NavLink } from "@/components/nav-link";
import type { Dictionary } from "@/lib/i18n";

type NavKey = keyof Dictionary["nav"];

// Menu per role (docs/PRD.md section 2). The ideas box and the ideal employee are for HR and the admin.
const menu: Record<StaffRole, NavKey[]> = {
  supervisor: ["dashboard", "liveBoard", "approvals", "records", "reports", "emergencies"],
  hr: ["dashboard", "liveBoard", "approvals", "records", "reports", "faceEnrollment", "ideas", "idealEmployee"],
  // The admin approves in two cases (PRD 7.2): no department supervisor, and HR employees' requests.
  admin: ["dashboard", "liveBoard", "approvals", "records", "reports", "employees", "faceEnrollment", "organisation", "emergencies", "ideas", "idealEmployee", "auditLog"],
};

// Screens built so far. The rest show "Soon".
const routes: Partial<Record<NavKey, string>> = {
  dashboard: "/",
  organisation: "/organisation",
  employees: "/employees",
  faceEnrollment: "/face-enrollment",
  approvals: "/approvals",
  records: "/records",
  liveBoard: "/live",
  reports: "/reports",
  auditLog: "/audit-log",
  emergencies: "/emergencies",
  // Pages of phases S8 and S9 (HR and the admin only).
  ideas: "/ideas",
  idealEmployee: "/ideal-employee",
};

const itemClass = "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap md:py-2 md:text-[0.9375rem]";
const linkClass = `${itemClass} text-rail-ink hover:bg-rail-hover hover:text-rail-on-ink`;
// The current screen carries one lit disc.
const activeClass = `${itemClass} bg-rail-on font-medium text-rail-on-ink before:size-1.5 before:shrink-0 before:rounded-full before:bg-rail-dot`;

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const me = await requireStaff();
  const { t, theme, lang } = await getPrefs();
  const name = lang === "ar" ? me.nameAr : me.nameEn;

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex items-center bg-rail text-rail-ink md:h-dvh md:w-60 md:shrink-0 md:flex-col md:items-stretch md:overflow-y-auto dark:md:border-e dark:md:border-line [&_:focus-visible]:outline-rail-dot">
        <div className="shrink-0 py-2 ps-4 pe-2 md:px-6 md:pt-6 md:pb-5">
          <p className="text-xl font-bold text-rail-on-ink md:text-[1.75rem] md:leading-9">{t.appName}</p>
          <p className="hidden text-xs text-rail-muted md:block">{t.panelTitle}</p>
        </div>
        <nav aria-label={t.panelTitle} className="min-w-0 flex-1">
          <ul className="flex gap-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:flex-col md:gap-0.5 md:overflow-visible md:py-0 md:pb-4 ltr:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)] rtl:[mask-image:linear-gradient(to_left,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)] md:[mask-image:none]!">
            {menu[me.role].map((key) => {
              const href = routes[key];
              return (
                <li key={key} className="shrink-0">
                  {href ? (
                    <NavLink href={href} exact={href === "/"} className={linkClass} activeClassName={activeClass}>
                      {t.nav[key]}
                    </NavLink>
                  ) : (
                    <span aria-disabled className={`${itemClass} justify-between text-rail-muted`}>
                      {t.nav[key]}
                      <span className="rounded-full bg-rail-on px-1.5 text-xs">{t.comingSoon}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 md:px-8 md:py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-muted">
              {t.roles[me.role]} · <span dir="ltr">{me.fileNumber}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PrefsButtons t={t} theme={theme} />
            <form action={signOut}>
              <button type="submit" className={`${chromeButtonClass} hover:border-danger! hover:bg-danger-soft! hover:text-danger`}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4 shrink-0 sm:hidden rtl:-scale-x-100">
                  <path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
                </svg>
                <span className="sr-only sm:not-sr-only">{t.signOut}</span>
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
