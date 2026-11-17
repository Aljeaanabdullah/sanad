import Link from "next/link";
import { getPrefs } from "@/lib/prefs";
import { orgT } from "@/lib/i18n-org";
import { ActionForm } from "@/components/action-form";
import { Card, Icon } from "@/components/ui";
import { createWorkPattern } from "../../actions";
import { NEW_PATTERN, PatternFields } from "../pattern-fields";

export default async function NewWorkPatternPage() {
  const { lang } = await getPrefs();
  const o = orgT(lang);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link href="/organisation/work-patterns" className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-primary">
        <Icon name="back" /> {o.back}
      </Link>
      <Card>
        <h2 className="mb-4 text-lg font-bold">{o.newPattern}</h2>
        <ActionForm action={createWorkPattern} submitLabel={o.save} errors={o.errors} testId="new-pattern">
          <PatternFields o={o} defaults={NEW_PATTERN} />
        </ActionForm>
      </Card>
    </div>
  );
}
