import { Suspense } from "react";
import Link from "next/link";
import { RequestLinkForm, SetPasswordForm } from "@/components/password-forms";
import { hqRequestLink, hqSetPassword } from "../login/actions";

export default function OpsPasswordPage({ searchParams }: PageProps<"/ops/password">) {
  return (
    <div className="max-w-sm mx-auto mt-10">
      <Suspense fallback={<div className="h-56" />}><Body searchParams={searchParams} /></Suspense>
      <p className="mt-6 text-center text-sm"><Link href="/ops/login" className="text-brand underline">Back to HQ sign in</Link></p>
    </div>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/ops/password">, "searchParams">) {
  const token = (await searchParams).token;
  if (typeof token === "string" && token) {
    return (
      <>
        <h1 className="font-display text-2xl font-bold">Choose your HQ password</h1>
        <div className="mt-6 card p-5"><SetPasswordForm action={hqSetPassword} token={token} /></div>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Set or reset your HQ password</h1>
      <p className="mt-1 text-sm text-muted">First time signing in, or forgot your password? We&apos;ll email a link to the address on your HQ account.</p>
      <div className="mt-6 card p-5"><RequestLinkForm action={hqRequestLink} /></div>
    </>
  );
}
