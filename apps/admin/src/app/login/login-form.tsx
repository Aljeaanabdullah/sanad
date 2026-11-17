"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/app/actions/auth";
import { errorMessage, type Dictionary } from "@/lib/i18n";
import { inputClass, primaryButtonClass } from "@/components/auth-card";
import { Alert } from "@/components/ui";

export function LoginForm({ t }: { t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t.fileNumber}</span>
        <input
          name="fileNumber"
          inputMode="numeric"
          autoComplete="username"
          pattern="\d{6}"
          maxLength={6}
          defaultValue={state.fileNumber}
          key={state.fileNumber ?? ""}
          required
          dir="ltr"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          dir="ltr"
          className={inputClass}
        />
      </label>
      {state.error && (
        <Alert kind="error">{errorMessage(t, state.error)}</Alert>
      )}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? t.signingIn : t.signIn}
      </button>
    </form>
  );
}
