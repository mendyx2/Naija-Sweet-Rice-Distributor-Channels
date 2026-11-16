import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./auth";

/**
 * The signed-in distributor member, or a redirect. `ownerOnly` limits a page/action to owners.
 * A store waiting for HQ approval can use the portal to get ready (prices, fees, staff, alerts);
 * customers can't see it until HQ approves it.
 */
export async function requirePartner(opts: { ownerOnly?: boolean; next?: string } = {}) {
  const user = await requireUser(opts.next ?? "/partner");
  const member = await db.distributorMember.findUnique({ where: { userId: user.id }, include: { distributor: true } });
  if (!member) redirect("/partner/no-access");
  const status = member.distributor.status;
  if (status === "SUSPENDED") redirect("/partner/no-access?suspended=1");
  if (status === "REJECTED") redirect("/partner/no-access?rejected=1");
  if (opts.ownerOnly && member.role !== "OWNER") redirect("/partner");
  return { user, member, distributor: member.distributor, actor: `partner:${member.distributor.slug}:${user.id}` };
}
