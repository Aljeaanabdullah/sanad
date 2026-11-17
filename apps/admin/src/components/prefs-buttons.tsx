import { setLanguage, setTheme } from "@/app/actions/prefs";
import type { Dictionary, Lang, Theme } from "@/lib/i18n";

export const chromeButtonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full sm:min-h-9 sm:min-w-0 border border-line-strong bg-surface px-3 py-1 text-sm whitespace-nowrap hover:border-primary hover:bg-primary-soft";

/** Language and light/dark switches. Plain forms, so they work without client JavaScript. */
export function PrefsButtons({ t, theme }: { t: Dictionary; theme: Theme }) {
  const otherLang: Lang = t.language === "English" ? "en" : "ar";
  const otherTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <div className="flex items-center gap-2">
      <form action={setLanguage}>
        <input type="hidden" name="lang" value={otherLang} />
        <button type="submit" lang={otherLang} className={chromeButtonClass}>
          {t.language}
        </button>
      </form>
      <form action={setTheme}>
        <input type="hidden" name="theme" value={otherTheme} />
        <button type="submit" className={chromeButtonClass}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4 shrink-0">
            {otherTheme === "light" ? (
              <>
                <circle cx="10" cy="10" r="3.4" />
                <path d="M10 2.6v1.6M10 15.8v1.6M2.6 10h1.6M15.8 10h1.6M4.8 4.8l1.1 1.1M14.1 14.1l1.1 1.1M4.8 15.2l1.1-1.1M14.1 5.9l1.1-1.1" />
              </>
            ) : (
              <path d="M16.4 11.6A6.6 6.6 0 0 1 8.4 3.6a6.6 6.6 0 1 0 8 8Z" />
            )}
          </svg>
          <span className="sr-only sm:not-sr-only">{otherTheme === "light" ? t.themeLight : t.themeDark}</span>
        </button>
      </form>
    </div>
  );
}
