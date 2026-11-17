"use client";

import { startTransition, useActionState } from "react";
import { Alert, buttonClass, Field, inputClass } from "@/components/ui";

type State = { error?: string; ok?: boolean };

/** Public reason (pre-filled from the nomination), optional citation, an explicit confirmation, then approve. */
export function ApproveForm({
  action,
  defaultReason,
  labels,
  errors,
  limits,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  defaultReason: string;
  labels: { publicReason: string; publicReasonHint: string; citation: string; citationHint: string; confirm: string; approve: string; approved: string };
  errors: Record<string, string>;
  limits: { reason: number; citation: number };
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  if (state.ok) return <Alert kind="success">{labels.approved}</Alert>;
  return (
    <form
      data-testid="ideal-approve-form"
      className="flex flex-col gap-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <Field label={labels.publicReason} hint={labels.publicReasonHint}>
        <textarea name="reason" defaultValue={defaultReason} required minLength={10} maxLength={limits.reason} rows={3} className={inputClass} />
      </Field>
      <Field label={labels.citation} hint={labels.citationHint}>
        <input name="citation" maxLength={limits.citation} className={inputClass} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4 accent-primary" />
        <span>{labels.confirm}</span>
      </label>
      {state.error && <Alert kind="error">{errors[state.error] ?? errors.generic}</Alert>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {labels.approve}
        </button>
      </div>
    </form>
  );
}
