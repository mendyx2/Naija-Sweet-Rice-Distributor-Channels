"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { announceHqSignIn, requestPasswordLink, setPasswordFromLink, signInWithPassword } from "@/lib/password-auth";

type State = { ok: boolean; message: string } | null;

/** HQ sign-in: email + password. Every successful sign-in is emailed (see announceHqSignIn). */
export async function hqSignIn(_prev: State, fd: FormData): Promise<State> {
  const r = await signInWithPassword(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), "HQ");
  if (!r.ok) return r;
  await announceHqSignIn(r.user);
  const next = safeNext(String(fd.get("next") ?? ""), "/ops/orders");
  redirect(next.startsWith("/ops") ? next : "/ops/orders");
}

export async function hqRequestLink(_prev: State, fd: FormData): Promise<State> {
  await requestPasswordLink(String(fd.get("email") ?? ""), "HQ");
  return { ok: true, message: "If that email has HQ access, we've sent a link to set your password. It works once, for 60 minutes. Check spam too." };
}

export async function hqSetPassword(_prev: State, fd: FormData): Promise<State> {
  const r = await setPasswordFromLink(String(fd.get("token") ?? ""), "HQ", String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (!r.ok) return r;
  redirect("/ops/login?set=1");
}
