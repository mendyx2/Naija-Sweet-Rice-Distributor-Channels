/** Email addresses: stored lower-case, checked loosely (the code we send is the real check). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  return /^[^\s@"<>(),;:\\[\]]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) ? e : null;
}

/** "ade.okafor@gmail.com" → "ad•••@gmail.com" for messages and logs. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}
