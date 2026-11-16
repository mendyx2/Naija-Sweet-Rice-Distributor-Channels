import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getZones } from "@/lib/catalogue";
import { formatNgPhone } from "@/lib/phone";
import { OtpForm } from "../login/otp-form";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <h1 className="font-display text-4xl font-bold">Checkout</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <Checkout searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Checkout({ searchParams }: Pick<PageProps<"/checkout">, "searchParams">) {
  const sp = await searchParams;
  const zoneId = typeof sp.zone === "string" ? sp.zone : "";
  const coupon = typeof sp.coupon === "string" ? sp.coupon : "";
  const storeId = typeof sp.store === "string" ? sp.store.slice(0, 40) : "";
  const fulfillment = sp.fulfillment === "PICKUP" ? "PICKUP" : "DELIVERY";
  const [user, zones] = await Promise.all([getCurrentUser(), getZones()]);

  if (!user) {
    const next = `/checkout?${new URLSearchParams({ zone: zoneId, store: storeId, fulfillment, ...(coupon ? { coupon } : {}) })}`;
    return (
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="card p-6 sm:p-8 max-w-xl">
          <p className="text-sm font-semibold text-brand">Step 1 of 2</p>
          <h2 className="font-display text-2xl font-bold mt-1">Sign in with your email</h2>
          <p className="mt-2 text-muted">
            We&apos;ll email you a 6-digit code. Your account keeps your orders and purchase points.
          </p>
          <div className="mt-6"><OtpForm next={next} /></div>
        </section>
      </div>
    );
  }

  return (
    <CheckoutForm
      zones={zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind }))}
      initialZoneId={zones.some((z) => z.id === zoneId) ? zoneId : ""}
      initialCoupon={coupon}
      storeId={storeId}
      fulfillment={fulfillment}
      defaults={{ name: user.name ?? "", phone: user.phone ? formatNgPhone(user.phone) : "", email: user.email ?? "" }}
    />
  );
}
