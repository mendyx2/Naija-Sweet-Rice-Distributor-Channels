import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getCurrentSession, type CurrentUser } from "./auth";
import { normalizeEmail } from "./email-address";

/**
 * HQ staff access for /ops: each person signs in at /ops/login with their own
 * email and password (an HQ session; a customer code sign-in never opens HQ),
 * and every sign-in is emailed. They need an HQ role:
 *   OWNER: everything, including the HQ team and distributors' bank details
 *   STAFF: day-to-day operations
 * HQ_OWNER_EMAILS (comma-separated) are always owners, so HQ can't be locked out.
 */
export type HqRole = "OWNER" | "STAFF";

export function bootstrapOwners(): Set<string> {
  return new Set(
    (process.env.HQ_OWNER_EMAILS ?? "").split(",").map((e) => normalizeEmail(e)).filter((e): e is string => !!e),
  );
}

export async function getHqStaff(): Promise<{ user: CurrentUser; role: HqRole } | null> {
  const session = await getCurrentSession();
  if (!session || session.kind !== "HQ") return null;
  const user = session.user;
  if (user.email && bootstrapOwners().has(user.email) && !user.roles.includes("OWNER")) {
    await db.user.update({ where: { id: user.id }, data: { roles: [...new Set([...user.roles, "OWNER" as const])] } });
    return { user, role: "OWNER" };
  }
  if (user.roles.includes("OWNER")) return { user, role: "OWNER" };
  if (user.roles.includes("STAFF")) return { user, role: "STAFF" };
  return null;
}

export async function isOpsSession(): Promise<boolean> {
  return !!(await getHqStaff());
}

/** Call at the top of every /ops page AND every ops server action. Returns the audit actor id. */
export async function requireOps(opts: { ownerOnly?: boolean } = {}): Promise<string> {
  const staff = await getHqStaff();
  if (!staff) redirect("/ops/login");
  if (opts.ownerOnly && staff.role !== "OWNER") redirect("/ops/orders?owner=1");
  return `hq:${staff.user.id}`;
}
