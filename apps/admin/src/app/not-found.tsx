import Link from "next/link";
import { getPrefs } from "@/lib/prefs";
import { buttonClass } from "@/components/ui";

export default async function NotFound() {
  const { t } = await getPrefs();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">{t.notFoundTitle}</h1>
      <p className="text-muted">{t.notFoundHint}</p>
      <Link href="/" className={buttonClass.primary}>
        {t.backHome}
      </Link>
    </main>
  );
}
