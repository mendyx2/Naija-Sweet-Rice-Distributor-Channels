import "server-only";
import { sendEmail } from "./email";
import { site } from "./site";
import { formatNaira } from "./money";
import { STATUS_MESSAGE } from "./status-text";
import { notifyDistributor } from "./staff-alerts";
import type { OrderStatus } from "@prisma/client";

/**
 * Customer notifications, by email for the soft launch (SMS can be added
 * alongside later). Sent to the email on the order. Never throws.
 */
type Contact = { number: string; contactEmail: string | null };

async function toCustomer(o: Contact, subject: string, text: string) {
  if (!o.contactEmail) return;
  await sendEmail(o.contactEmail, `${site.name}: ${subject}`, `${text}\n\n${site.name}\n${site.url}`).catch(() => {});
}

type ReceiptOrder = Contact & {
  customerName: string;
  type: "STANDARD" | "SAMPLE" | "REPLACEMENT";
  fulfillment: "DELIVERY" | "PICKUP";
  subtotalKobo: number;
  discountKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  paidAt: Date;
  reference: string | null;
  items: { sizeKg: number; qty: number; unitPriceKobo: number }[];
  distributor: { name: string; isHq: boolean; address: string | null; phone: string | null };
};

/** Lagos date and time, e.g. "17 Nov 2026, 2:35 pm". */
const lagos = (d: Date) => d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

/** The customer's receipt, emailed once the store confirms payment. */
export function receiptText(o: ReceiptOrder): string {
  const store = o.distributor.isHq ? `${site.name} HQ` : o.distributor.name;
  const pad = (left: string, right: string) => `${left}${" ".repeat(Math.max(2, 34 - left.length - right.length))}${right}`;
  const lines = [
    `RECEIPT · ${site.name}`,
    "",
    `Order:      ${o.number}`,
    `Paid:       ${lagos(o.paidAt)}`,
    `Customer:   ${o.customerName}`,
    `Sold by:    ${store}${o.distributor.address ? `, ${o.distributor.address}` : ""}`,
    ...(o.reference ? [`Payment ref: ${o.reference}`] : []),
    "",
    ...o.items.map((i) => pad(`${i.qty} × ${i.sizeKg}kg bag`, formatNaira(i.unitPriceKobo * i.qty))),
    pad("Subtotal", formatNaira(o.subtotalKobo)),
    ...(o.discountKobo > 0 ? [pad("Discount", `-${formatNaira(o.discountKobo)}`)] : []),
    pad(o.fulfillment === "PICKUP" ? "Pickup" : "Delivery", o.deliveryFeeKobo ? formatNaira(o.deliveryFeeKobo) : "Free"),
    pad("TOTAL PAID", formatNaira(o.totalKobo)),
    "",
    o.fulfillment === "PICKUP"
      ? `Collect from ${store}${o.distributor.address ? ` at ${o.distributor.address}` : ""}. We'll email you when it's ready.`
      : "We'll email you when your order is on its way.",
    `Follow your order: ${site.url}/orders/${o.number}`,
    ...(o.distributor.phone ? [`Questions? Call ${store} on ${o.distributor.phone}.`] : []),
    "",
    "Damaged bag? Request a free replacement within 48 hours of delivery from your order page.",
  ];
  return lines.join("\n");
}

export async function notifyOrderPaid(o: ReceiptOrder) {
  await toCustomer(o, `receipt for order ${o.number}`, receiptText(o));
}

export async function notifyStatus(o: Contact, status: OrderStatus, extra?: string) {
  const text = STATUS_MESSAGE[status];
  if (!text) return;
  await toCustomer(o, `order ${o.number} update`, `Your order ${o.number} ${text}${extra ? ` ${extra}` : ""}\n\n${site.url}/orders/${o.number}`);
}

type PayTo = { distributorName?: string; bankName?: string | null; accountNumber?: string | null; accountName?: string | null };

/** Customer (email): how to pay. Distributor (Telegram/email): a new order is waiting for payment. */
export async function notifyNewTransferOrder(o: Contact & { totalKobo: number; payTo: PayTo }, distributorId: string, hours: number) {
  const p = o.payTo;
  await toCustomer(o, `how to pay for order ${o.number}`, [
    `Thanks for your order ${o.number}.`,
    `Please transfer ${formatNaira(o.totalKobo)} within ${hours} hours to:`,
    `  Bank: ${p.bankName}\n  Account number: ${p.accountNumber}\n  Account name: ${p.accountName}`,
    `Use ${o.number} as the narration, then tap "I've made the transfer" on your order page: ${site.url}/orders/${o.number}`,
  ].join("\n\n"));
  await notifyDistributor(distributorId, `New order ${o.number}`, `New order ${o.number} for ${formatNaira(o.totalKobo)}, awaiting the customer's transfer. ${site.url}/partner`);
}

export async function notifyCustomerSaysPaid(o: { number: string; totalKobo: number }, distributorId: string) {
  await notifyDistributor(distributorId, `Check payment for ${o.number}`, `Customer says they've paid ${formatNaira(o.totalKobo)} for ${o.number}. Check your bank and confirm: ${site.url}/partner`);
}

export async function notifyPaymentNotReceived(o: Contact & { totalKobo: number }) {
  await toCustomer(o, `transfer not received yet for ${o.number}`,
    `We haven't received your transfer of ${formatNaira(o.totalKobo)} for ${o.number} yet. Please check the account details on your order page: ${site.url}/orders/${o.number}`);
}

export async function notifyPaymentReminder(o: Contact & { totalKobo: number }) {
  await toCustomer(o, `order ${o.number} is held for 1 more hour`,
    `Reminder: your order ${o.number} is held for 1 more hour. Transfer ${formatNaira(o.totalKobo)} and tap "I've made the transfer": ${site.url}/orders/${o.number}`);
}

/** Free-sample follow-up coupon, sent a few days after the sample was delivered. */
export async function notifySampleFollowUp(o: Contact, couponCode: string) {
  await toCustomer(o, "₦1,000 off your first bag",
    `Enjoyed your free sample? Here's ₦1,000 off your first bag (orders over ₦20,000): ${couponCode}. Valid for 30 days.\n\nShop: ${site.url}/stores`);
}

/** Replacement claim decided by HQ. */
export async function notifyClaimDecision(o: Contact, approved: boolean, note: string) {
  await toCustomer(o, approved ? `replacement approved for ${o.number}` : `about your replacement request for ${o.number}`,
    approved ? `Your replacement request for order ${o.number} was approved. ${note}` : `We couldn't approve your replacement request for order ${o.number}. ${note}`);
}

/** HQ alerts go to Telegram/email (see staff-alerts.ts). */
export { alertHq } from "./staff-alerts";

/** A message to a signed-up person (seller/affiliate decisions, team invitations). Skips people without an email. */
export async function notifyPerson(email: string | null | undefined, subject: string, text: string) {
  if (!email) return;
  await sendEmail(email, `${site.name}: ${subject}`, `${text}\n\n${site.name}\n${site.url}`).catch(() => {});
}
