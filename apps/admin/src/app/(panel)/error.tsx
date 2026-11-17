"use client";

import { useEffect, useSyncExternalStore } from "react";
import { dictionaries, type Lang } from "@/lib/i18n";
import { buttonClass } from "@/components/ui";

const noop = () => () => {};

// A panel screen failed to load. Says so plainly and offers the one useful action.
export default function PanelError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const lang = useSyncExternalStore<Lang>(
    noop,
    () => (document.documentElement.lang === "en" ? "en" : "ar"),
    () => "ar",
  );
  const t = dictionaries[lang];
  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-5">
      <h1 className="text-xl font-bold text-danger">{t.errorTitle}</h1>
      <p className="text-sm">{t.errorHint}</p>
      <button type="button" onClick={() => retry()} className={buttonClass.secondary}>
        {t.retry}
      </button>
    </div>
  );
}
