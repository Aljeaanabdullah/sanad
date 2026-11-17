import type { ReactNode } from "react";
import { PrefsButtons } from "./prefs-buttons";
import { DiscSphere } from "./disc-sphere";
import { buttonClass, inputClass as fieldClass } from "./ui";
import type { Dictionary, Theme } from "@/lib/i18n";

/** Sign-in and change-password screens: the brand side (wide screens) and the form. */
export function AuthCard({
  t,
  theme,
  title,
  children,
}: {
  t: Dictionary;
  theme: Theme;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative hidden overflow-hidden bg-rail p-10 text-rail-ink lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-4xl font-bold text-rail-on-ink">{t.appName}</p>
          <p className="mt-1 text-rail-muted">{t.panelTitle}</p>
        </div>
        <DiscSphere className="pointer-events-none absolute -end-24 -bottom-24 w-[32rem] max-w-none" />
      </div>
      <div className="flex flex-col items-center gap-6 p-4 sm:p-8">
        <div className="flex w-full justify-end">
          <PrefsButtons t={t} theme={theme} />
        </div>
        <div className="flex w-full max-w-sm flex-1 flex-col justify-center pb-16">
          <p className="mb-6 text-3xl font-bold text-primary lg:hidden">{t.appName}</p>
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export const inputClass = fieldClass;
export const primaryButtonClass = `${buttonClass.primary} w-full`;
