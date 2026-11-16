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

export async function notifyOrderPaid(o: Contact & { totalKobo: number }) {
  await toCustomer(o, `payment received for ${o.number}`,
    `We've received your payment of ${formatNaira(o.totalKobo)} for order ${o.number}. Follow your order at ${site.url}/orders/${o.number}`);
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
    `Enjoyed your free sample? Here's ₦1,000 off your first bag (orders over ₦20,000): ${couponCode}. Valid for 30 days.\n\nShop: ${site.url}/shop`);
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
