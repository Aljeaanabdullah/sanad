"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the live board from the server every `seconds` (router.refresh keeps the filters
 * and the scroll position). Paused while the tab is hidden; refreshes at once when it comes back.
 */
export function AutoRefresh({ seconds, label, busyLabel }: { seconds: number; label: string; busyLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const id = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-primary-soft disabled:opacity-60"
      data-testid="live-refresh"
    >
      {pending ? busyLabel : label}
    </button>
  );
}
