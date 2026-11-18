import Link from "next/link";
import { Suspense } from "react";

export default function NoAccess({ searchParams }: PageProps<"/partner/no-access">) {
  return (
    <div className="mx-auto max-w-md card p-8 text-center">
      <Suspense fallback={null}><Message searchParams={searchParams} /></Suspense>
      <Link href="/" className="btn-outline mt-6">Back to the home page</Link>
    </div>
  );
}

async function Message({ searchParams }: Pick<PageProps<"/partner/no-access">, "searchParams">) {
  const sp = await searchParams;
  const suspended = sp.suspended === "1";
  const rejected = sp.rejected === "1";
  return (
    <>
      <h1 className="font-display text-2xl font-bold">
        {suspended ? "Your store is paused" : rejected ? "Your store application wasn't approved" : "This account isn't linked to a store"}
      </h1>
      <p className="mt-2 text-muted">
        {suspended || rejected
          ? "Please contact Naija Sweet Rice HQ."
          : "The partner portal is for Naija Sweet Rice distributors. Are you a distributor? Open your store below; HQ reviews new stores before they go live."}
      </p>
      {!suspended && !rejected && <Link href="/partner/join" className="btn-cta mt-6">Open a store</Link>}
    </>
  );
}
