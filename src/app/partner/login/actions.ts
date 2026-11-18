"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { requestPasswordLink, setPasswordFromLink, signInWithPassword } from "@/lib/password-auth";

type State = { ok: boolean; message: string } | null;

/** Distributor sign-in: email + password, separate from HQ and from customers. */
export async function partnerSignIn(_prev: State, fd: FormData): Promise<State> {
  const r = await signInWithPassword(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), "PARTNER");
  if (!r.ok) return r;
  const next = safeNext(String(fd.get("next") ?? ""), "/partner");
  redirect(next.startsWith("/partner") ? next : "/partner");
}

export async function partnerRequestLink(_prev: State, fd: FormData): Promise<State> {
  await requestPasswordLink(String(fd.get("email") ?? ""), "PARTNER");
  return { ok: true, message: "If that email belongs to a distributor account, we've sent a link to set your password. It works once, for 60 minutes. Check spam too." };
}

export async function partnerSetPassword(_prev: State, fd: FormData): Promise<State> {
  const r = await setPasswordFromLink(String(fd.get("token") ?? ""), "PARTNER", String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (!r.ok) return r;
  redirect("/partner/login?set=1");
}

export async function partnerSignOut() {
  await destroySession();
  redirect("/partner/login");
}
