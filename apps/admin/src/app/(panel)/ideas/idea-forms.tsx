"use client";

import { startTransition, useActionState, useState } from "react";
import { Alert, buttonClass, inputClass } from "@/components/ui";
import type { IdeaActionState } from "./actions";

type Action = (prev: IdeaActionState, formData: FormData) => Promise<IdeaActionState>;
type Errors = Record<string, string>;

/** Review of a new idea: publish, or do not publish with a reason (sent to the author). */
export function ReviewForm({ action, labels, errors }: {
  action: Action;
  labels: { reason: string; publish: string; doNotPublish: string; done: string };
  errors: Errors;
}) {
  const [state, formAction, pending] = useActionState<IdeaActionState, FormData>(action, {});
  if (state.ok) return <Alert kind="success">{labels.done}</Alert>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget);
        fd.set("decision", submitter?.value ?? "");
        startTransition(() => formAction(fd));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.reason}</span>
        <textarea name="reason" maxLength={500} rows={2} className={inputClass} />
      </label>
      {state.error && <Alert kind="error">{errors[state.error] ?? errors.generic}</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button type="submit" value="publish" disabled={pending} className={buttonClass.primary}>{labels.publish}</button>
        <button type="submit" value="reject" disabled={pending} className={buttonClass.danger}>{labels.doNotPublish}</button>
      </div>
    </form>
  );
}

/** Management reply: next status + reason (required for rejected). */
export function StatusForm({ action, options, labels, errors }: {
  action: Action;
  options: { value: string; label: string; needsReason: boolean }[];
  labels: { status: string; reason: string; save: string; done: string };
  errors: Errors;
}) {
  const [state, formAction, pending] = useActionState<IdeaActionState, FormData>(action, {});
  const [status, setStatus] = useState(options[0]?.value ?? "");
  const required = options.find((o) => o.value === status)?.needsReason ?? false;
  if (state.ok) return <Alert kind="success">{labels.done}</Alert>;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.status}</span>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.reason}</span>
          <textarea name="reason" maxLength={500} rows={2} required={required} minLength={required ? 3 : undefined} className={inputClass} />
        </label>
      </div>
      {state.error && <Alert kind="error">{errors[state.error] ?? errors.generic}</Alert>}
      <div>
        <button type="submit" disabled={pending} className={status === "rejected" ? buttonClass.danger : buttonClass.primary}>{labels.save}</button>
      </div>
    </form>
  );
}

/** System admin only: reveal an anonymous author, after a reason and an explicit confirmation. */
export function RevealForm({ action, labels, errors, lang }: {
  action: Action;
  labels: { reveal: string; title: string; warning: string; reason: string; confirm: string; doIt: string; cancel: string; revealed: string };
  errors: Errors;
  lang: "ar" | "en";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<IdeaActionState, FormData>(action, {});
  if (state.ok && state.author) {
    return (
      <Alert kind="success">
        {labels.revealed} {lang === "ar" ? state.author.full_name_ar : state.author.full_name_en} · <span dir="ltr">{state.author.file_number}</span>
      </Alert>
    );
  }
  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>{labels.reveal}</button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!window.confirm(labels.warning)) return;
        startTransition(() => formAction(fd));
      }}
    >
      <p className="font-bold text-danger">{labels.title}</p>
      <p className="text-sm">{labels.warning}</p>
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.reason}</span>
        <textarea name="reason" required minLength={10} maxLength={500} rows={2} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required className="size-4" />
        <span>{labels.confirm}</span>
      </label>
      {state.error && <Alert kind="error">{errors[state.error] ?? errors.generic}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass.danger}>{labels.doIt}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass.secondary}>{labels.cancel}</button>
      </div>
    </form>
  );
}
