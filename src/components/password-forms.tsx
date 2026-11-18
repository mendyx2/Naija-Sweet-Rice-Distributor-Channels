"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";

type State = { ok: boolean; message: string } | null;

/** Submits without React's automatic form reset, so a typo doesn't clear the email. */
const keepFields = (run: (fd: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => run(fd));
};

/** Email + password sign-in (HQ or distributor). The action redirects on success. */
export function PasswordSignInForm({ action, next, forgotHref }: {
  action: (prev: State, fd: FormData) => Promise<State>;
  next: string;
  forgotHref: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form onSubmit={keepFields(run)} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-sm font-semibold">Email address</span>
        <input name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} className="field" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </label>
      {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm"><Link href={forgotHref} className="text-brand underline">Forgot your password, or first time here?</Link></p>
    </form>
  );
}

/** "Email me a link" to set or reset a password. */
export function RequestLinkForm({ action }: { action: (prev: State, fd: FormData) => Promise<State> }) {
  const [state, run, pending] = useActionState(action, null);
  if (state?.ok) return <p role="status" className="rounded-xl bg-brand-soft p-4 text-sm">{state.message}</p>;
  return (
    <form onSubmit={keepFields(run)} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Email address</span>
        <input name="email" type="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} className="field" />
      </label>
      {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Sending…" : "Email me a link"}</button>
    </form>
  );
}

/** Choose a new password from an emailed link. The action redirects to sign-in on success. */
export function SetPasswordForm({ action, token }: { action: (prev: State, fd: FormData) => Promise<State>; token: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form onSubmit={keepFields(run)} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-sm font-semibold">New password</span>
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" />
        <span className="mt-1 block text-xs text-muted">At least 10 characters, with a letter and a number.</span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Type it again</span>
        <input name="confirm" type="password" required autoComplete="new-password" className="field" />
      </label>
      {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
