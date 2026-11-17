/**
 * Checks the site's settings when the server starts. Missing required settings
 * stop the server with a clear message; missing optional ones are listed so
 * nobody wonders why, say, Telegram alerts aren't arriving.
 */
export function checkEnv(env: Record<string, string | undefined> = process.env): { missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];
  const need = (k: string, why: string) => { if (!env[k]) missing.push(`${k}: ${why}`); };
  const want = (keys: string[], what: string) => { if (keys.some((k) => !env[k])) warnings.push(`${what} is off (set ${keys.join(", ")})`); };

  need("DATABASE_URL", "the database connection (pooled is fine)");
  need("DATABASE_URL_UNPOOLED", "the direct (unpooled) database connection, used to update the database on each deploy");
  need("NEXT_PUBLIC_SITE_URL", "the public web address, e.g. https://naijasweetrice.ng");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET: 32+ random characters for signing logins");
  need("HQ_OWNER_EMAILS", "email address(es) of the HQ owner(s), so someone can sign in to /ops");
  need("RESEND_API_KEY", "email for sign-in codes and customer messages (Resend)");
  need("EMAIL_FROM", "the sender address for emails, on a domain verified in Resend");
  need("CRON_SECRET", "protects the housekeeping job (payment holds, reminders, points)");
  if (env.NEXT_PUBLIC_SITE_URL && !env.NEXT_PUBLIC_SITE_URL.startsWith("https://")) missing.push("NEXT_PUBLIC_SITE_URL: must start with https:// in production");

  want(["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"], "Telegram staff alerts");
  want(["GOOGLE_SHEETS_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY"], "Google stock sheet");
  want(["NEXT_PUBLIC_STORE_PHONE", "NEXT_PUBLIC_STORE_STREET"], "Store contact details in the footer");
  return { missing, warnings };
}
