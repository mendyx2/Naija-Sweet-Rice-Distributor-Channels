import Link from "next/link";
import { Suspense } from "react";
import { RequestLinkForm, SetPasswordForm } from "@/components/password-forms";
import { partnerRequestLink, partnerSetPassword } from "../login/actions";

export default function PartnerPasswordPage({ searchParams }: PageProps<"/partner/password">) {
  return (
    <div className="max-w-sm mx-auto mt-6">
      <Suspense fallback={<div className="h-56" />}><Body searchParams={searchParams} /></Suspense>
      <p className="mt-6 text-center text-sm"><Link href="/partner/login" className="text-brand underline">Back to sign in</Link></p>
    </div>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/partner/password">, "searchParams">) {
  const token = (await searchParams).token;
  if (typeof token === "string" && token) {
    return (
      <>
        <h1 className="font-display text-2xl font-bold">Choose your password</h1>
        <div className="mt-6 card p-5"><SetPasswordForm action={partnerSetPassword} token={token} /></div>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Set or reset your password</h1>
      <p className="mt-1 text-sm text-muted">Forgot your password, or added to a store&apos;s team? We&apos;ll email a link to your account&apos;s address.</p>
      <div className="mt-6 card p-5"><RequestLinkForm action={partnerRequestLink} /></div>
    </>
  );
}
