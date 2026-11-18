import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { site } from "@/lib/site";
import { PasswordSignInForm } from "@/components/password-forms";
import { partnerSignIn } from "./actions";

export default function PartnerLoginPage({ searchParams }: PageProps<"/partner/login">) {
  return (
    <div className="max-w-sm mx-auto mt-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-promo">Distributor portal</p>
      <h1 className="font-display text-3xl font-bold mt-1">Sign in to your store</h1>
      <p className="text-muted text-sm mt-1">For {site.name} distributors and their staff.</p>
      <div className="mt-6 card p-5">
        <Suspense fallback={<div className="h-56" />}><Login searchParams={searchParams} /></Suspense>
      </div>
      <div className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm">
        <p className="font-semibold">New distributor?</p>
        <p className="mt-1 text-muted">Open your own online store: register, set your prices, and HQ approves it.</p>
        <Link href="/partner/join" className="btn-cta mt-3 w-full">Become a distributor</Link>
      </div>
    </div>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/partner/login">, "searchParams">) {
  const s = await getCurrentSession();
  if (s?.kind === "PARTNER") redirect("/partner");
  const sp = await searchParams;
  return (
    <>
      {sp.set === "1" && <p role="status" className="mb-4 rounded-xl bg-brand-soft p-3 text-sm">Password saved. Sign in with it now.</p>}
      <PasswordSignInForm action={partnerSignIn} next={typeof sp.next === "string" ? sp.next : "/partner"} forgotHref="/partner/password" />
    </>
  );
}
