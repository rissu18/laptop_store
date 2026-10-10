"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "@/server/auth/auth-actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, { error: null });
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        E-post
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="h-11 rounded-md border border-border-strong bg-surface px-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Parool
        <input type="password" name="password" autoComplete="current-password" required className="h-11 rounded-md border border-border-strong bg-surface px-3 font-normal" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Kontrollin…" : "Logi sisse"}
      </Button>
    </form>
  );
}
