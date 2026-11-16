import { formatNgPhone } from "./phone";

/** How to show a person in staff screens: their sign-in email, else their phone, else "deleted account". */
export function contactLabel(u: { email: string | null; phone: string | null }): string {
  if (u.email) return u.email;
  if (u.phone?.startsWith("+")) return formatNgPhone(u.phone);
  return "deleted account";
}
