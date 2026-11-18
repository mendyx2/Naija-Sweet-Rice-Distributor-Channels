import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getHqStaff } from "@/lib/ops-auth";
import { site } from "@/lib/site";
import { PasswordSignInForm } from "@/components/password-forms";
import { hqSignIn } from "./actions";

export default function OpsLoginPage({ searchParams }: PageProps<"/ops/login">) {
  return (
    <div className="max-w-sm mx-auto mt-10">
      <h1 className="font-display text-2xl font-bold">HQ sign in</h1>
      <p className="text-muted text-sm mt-1">For {site.name} HQ staff only. Every sign-in is emailed to you and to HQ.</p>
      <div className="mt-6 card p-5">
        <Suspense fallback={<div className="h-56" />}><Login searchParams={searchParams} /></Suspense>
      </div>
      <p className="mt-6 text-center text-xs text-muted">Distributors sign in at <a href="/partner/login" className="underline">the distributor portal</a>.</p>
    </div>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/ops/login">, "searchParams">) {
  if (await getHqStaff()) redirect("/ops/orders");
  const sp = await searchParams;
  return (
    <>
      {sp.set === "1" && <p role="status" className="mb-4 rounded-xl bg-brand-soft p-3 text-sm">Password saved. Sign in with it now.</p>}
      <PasswordSignInForm action={hqSignIn} next={typeof sp.next === "string" ? sp.next : "/ops/orders"} forgotHref="/ops/password" />
    </>
  );
}
