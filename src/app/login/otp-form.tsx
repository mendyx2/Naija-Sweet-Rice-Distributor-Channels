"use client";

import { useActionState, useEffect, useRef } from "react";
import { requestCode, verifyCode, type OtpState } from "./actions";

/** Two-step sign-in: email → 6-digit code by email. Used on /login, /ops/login and inside checkout. */
export function OtpForm({ next }: { next: string }) {
  const [sendState, send, sending] = useActionState<OtpState, FormData>(requestCode, { step: "email" });
  const [verifyState, verify, verifying] = useActionState<OtpState | null, FormData>(verifyCode, null);
  const codeRef = useRef<HTMLInputElement>(null);

  const onCodeStep = sendState.step === "code" && verifyState?.step !== "email";
  const email = sendState.step === "code" ? sendState.email : "";

  useEffect(() => {
    if (onCodeStep) codeRef.current?.focus();
  }, [onCodeStep]);

  if (!onCodeStep) {
    const error = sendState.error ?? (verifyState?.step === "email" ? verifyState.error : undefined);
    return (
      <form action={send} className="space-y-4" noValidate>
        <label className="block">
          <span className="text-sm font-semibold">Email address</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="you@example.com"
            defaultValue={sendState.step === "email" ? sendState.email : ""}
            aria-invalid={!!error}
            aria-describedby={error ? "email-error" : "email-help"}
            className="field mt-1"
          />
          <span id="email-help" className="mt-1 block text-xs text-muted">We&apos;ll email you a 6-digit code. No password needed.</span>
        </label>
        {error && <p id="email-error" role="alert" className="text-sm text-danger">{error}</p>}
        <button disabled={sending} className="btn-cta w-full">{sending ? "Sending code…" : "Send code"}</button>
      </form>
    );
  }

  const error = verifyState?.step === "code" ? verifyState.error : undefined;
  return (
    <div className="space-y-4">
      <form action={verify} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm">
          Enter the 6-digit code sent to <strong className="break-all">{email}</strong>. It can take a minute; check your spam folder too.
        </p>
        {sendState.step === "code" && sendState.devCode && (
          <p className="rounded-lg bg-promo-soft px-3 py-2 text-xs">
            Development mode (no email provider): your code is <strong className="tracking-widest">{sendState.devCode}</strong>
          </p>
        )}
        <input
          ref={codeRef}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          aria-label="6-digit code"
          aria-invalid={!!error}
          className="field text-center text-2xl tracking-[0.5em] font-semibold"
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button disabled={verifying} className="btn-cta w-full">{verifying ? "Checking…" : "Verify & continue"}</button>
      </form>
      <form action={send} className="flex justify-between text-sm">
        <input type="hidden" name="email" value={email} />
        <button type="button" onClick={() => location.reload()} className="text-muted underline">Change email</button>
        <button disabled={sending} className="font-semibold text-brand underline">{sending ? "Sending…" : "Resend code"}</button>
      </form>
    </div>
  );
}
