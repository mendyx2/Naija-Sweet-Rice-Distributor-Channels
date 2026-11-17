# Going live: step-by-step

This guide takes the store from this code to a live website, then through the first setup in `/ops`. Allow about half a day. Where a step needs a developer, it says so.

---

## 1. Accounts you need

| What | Used for | Cost |
|---|---|---|
| **GitHub** (you have this) | Holds the code | Free |
| **Vercel** | Runs the website | Free Hobby plan is fine for testing; for launch either Pro or a free external scheduler (see §6) |
| **Neon** (or any PostgreSQL host) | The database | Free tier to start |
| **Domain name** (e.g. `naijasweetrice.ng`) | The web address | Yearly fee from a registrar |
| **Telegram** + a bot from @BotFather | Free staff alerts | Free |
| **Resend** | Email: sign-in codes, customer order messages and staff alerts. You verify your domain in Resend so emails come from it | Free tier (3,000 emails a month) |
| **Google Cloud** (optional) | The stock depletion sheet | Free |

---

## 2. Database (Neon)

1. Create a Neon project in a region close to Nigeria (e.g. Europe).
2. Copy the connection string it shows for **Prisma**. It starts with `postgresql://`.
3. Keep it for the `DATABASE_URL` setting below.

Neon may offer both a "pooled" and a "direct" connection string. The direct one is simplest at launch volumes. If you want the pooled one, ask a developer to follow Neon's Prisma guide.

---

## 3. Website (Vercel)

1. In Vercel: **Add New → Project → import** the GitHub repository.
2. Before the first deploy, open **Settings → Environment Variables** and add the settings in §4.
3. Deploy. Every deploy automatically:
   - updates the database structure;
   - adds anything missing to the starting data (bag sizes, delivery areas, HQ's own store); it never overwrites prices, stock or anything staff entered;
   - builds the site.
4. **Domains:** add your domain and follow Vercel's DNS instructions. Then set `NEXT_PUBLIC_SITE_URL` to `https://yourdomain` and redeploy.

If a required setting is missing, the site refuses to start and the Vercel log lists exactly which one.

---

## 4. Settings (environment variables)

Never put these in chat, email or the code. Enter them only in Vercel's settings.

**Required**

| Setting | What to put |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain` (no trailing slash) |
| `SESSION_SECRET` | 48+ random characters (a developer can run `openssl rand -base64 48`) |
| `HQ_OWNER_EMAILS` | Your email address(es), comma-separated, e.g. `you@naijasweetrice.ng`. These always have full HQ access |
| `CRON_SECRET` | Another random string; protects the housekeeping job |
| `RESEND_API_KEY` | From your Resend dashboard (API Keys) |
| `EMAIL_FROM` | The sender, on your verified domain, e.g. `Naija Sweet Rice <hello@naijasweetrice.ng>` |

**Store details** (shown in the footer and to Google; use exactly what's on your Google Business Profile)

`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_STORE_PHONE`, `NEXT_PUBLIC_STORE_WHATSAPP` (digits only, e.g. `2348031234567`), `NEXT_PUBLIC_STORE_STREET`, `NEXT_PUBLIC_STORE_AREA`, `NEXT_PUBLIC_STORE_LAT`, `NEXT_PUBLIC_STORE_LNG`

**Optional features**

| Feature | Settings |
|---|---|
| Telegram staff alerts | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (random string) |
| HQ alert emails | `OPS_ALERT_EMAIL` (where HQ alerts go; uses the Resend settings above) |
| Google stock sheet | `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Analytics (after cookie consent) | `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` |
| Rate limits shared across servers | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

---

## 5. First sign-in and setup in `/ops`

Go to `https://yourdomain/ops` and sign in with an email address from `HQ_OWNER_EMAILS`. Then:

1. **HQ team:** add the other HQ staff by phone (owner or staff).
2. **Distributors → Naija Sweet Rice HQ:** enter HQ's bank account (customers of HQ pay into it, and distributors pay restock invoices into it).
3. **Prices & stock**, per bag size:
   - HQ retail price and HQ stock;
   - **distributor price** (what distributors pay HQ);
   - **distributor range** (lowest–highest retail price distributors may set);
   - **HQ fee per bag** (charged on distributor online sales).
4. **HQ delivery fees:** confirm the fee per area (the starting values are placeholders).
5. **Distributors.** New distributors open their own store at `https://yourdomain/partner/join` (link in the site footer). They enter their business, bank account, areas and delivery fee. You get a Telegram/email alert. Open the store in **Distributors**, check it and press **Approve store** (owners only), then record the opening stock they bought from you with **Dispatch from HQ**. They confirm receipt and the store is live.
   No distributor is pre-loaded, Gova Max Ltd included: send them the link to `/partner/join`.
6. **Alerts:** on the Distributors page, connect HQ's Telegram (§7). Ask each distributor to connect theirs under **Alerts** in the partner portal.
7. **Promotions**, if you want one at launch.

---

## 6. Housekeeping job

The job at `/api/cron/release-reservations` does several things:
- cancels transfers not paid within 3 hours and sends 2-hour reminders;
- alerts HQ about payments not confirmed in time;
- confirms points after the return window and expires old points;
- sends sample follow-up coupons;
- fills the Google sheet.

`vercel.json` runs it **once a day** (06:00 Lagos time), which Vercel's free Hobby plan accepts. That's enough for testing. For a real launch it should run every 10–30 minutes, so unpaid orders are released on time. Either:
- **Vercel Pro:** change the schedule in `vercel.json` to `*/10 * * * *` and redeploy. Vercel sends `CRON_SECRET` automatically. Or
- **Stay on Hobby (free):** keep the daily schedule and add a free external scheduler such as cron-job.org:
  - URL: `https://yourdomain/api/cron/release-reservations`
  - every 30 minutes (every 10 also works, but keeps a free Neon database awake most of the time)
  - add the header `Authorization: Bearer <your CRON_SECRET>`

While testing you can also run it by hand from a terminal (it replies with what it did):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain/api/cron/release-reservations
```

---

## 7. Telegram, email and Google sheet

**Telegram**
1. In Telegram, message **@BotFather** → `/newbot` and choose a name (e.g. "Naija Sweet Rice Alerts").
2. Copy the token into `TELEGRAM_BOT_TOKEN`, set a random `TELEGRAM_WEBHOOK_SECRET`, and redeploy.
3. In `/ops/distributors`, press **Connect bot to site** (once), then **Connect my Telegram** or **Add to a staff group**.
4. Press **Send test alert**.

**Email (Resend): required, because sign-in codes go by email**
1. Create an account and verify your domain (add the DNS records it shows, including the SPF and DKIM ones; this keeps codes out of spam).
2. Set `RESEND_API_KEY`, `EMAIL_FROM` and `OPS_ALERT_EMAIL`, then redeploy. The site won't start without the first two.
3. Sign in to `/ops` yourself to check a code arrives within a minute.
4. Watch the volume: Resend's free plan allows about 100 emails a day (3,000 a month). Each order sends 2–5 emails and each sign-in 1. Move to the paid plan when the soft launch gets busier.

**Google stock sheet** (a developer can do this in 10 minutes)
1. In Google Cloud, create a project, enable the **Google Sheets API**, and create a **service account** with a JSON key.
2. Create a Google Sheet and **share** it with the service account's email as **Editor**.
3. Set `GOOGLE_SHEETS_ID` (from the sheet's address), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_KEY` (the key's `private_key` value).
4. Within 10 minutes the sheet gets two tabs, **Stock movements** and **Current stock**.

---

## 8. Keeping it healthy

- **Uptime:** add `https://yourdomain/api/health` to a free monitor such as UptimeRobot. It answers "ok" only when the site and database are working.
- **Backups:** turn on Neon's point-in-time restore (how far back depends on your Neon plan).
- **Updates:** changes pushed to the main branch on GitHub deploy automatically.

---

## 9. Final test before announcing

Do one real order end to end, with a 1kg bag or a small order:

1. On your phone, choose an area served by a distributor, order, and check the **email** with the bank details (look in spam too, and mark it "not spam").
2. Transfer the money and tap **I've made the transfer**. The distributor's **Telegram** should get the alert.
3. The distributor taps **Payment received**, then marks it out for delivery and delivered. Check the customer gets the email updates.
4. Check `/ops/reports`, the distributor's **My numbers**, and (if set up) the Google sheet.
5. Try a replacement request on that order and approve it.

## Security review before launch (13 Nov 2026)

Checked: every server action and API route checks who is signed in; distributors can only touch their own orders, stock, restocks, codes and staff; bank details and the HQ team are owner-only; claim photos are visible only to the customer and HQ; Telegram webhook and housekeeping secrets are compared in constant time; uploads are re-encoded with size and pixel limits; sign-in codes appear on screen only in development without an email key; the test-only rate-limit bypass is off in production.

Fixed in this review:
- Rate limits used the visitor-supplied first `X-Forwarded-For` entry, so they could be dodged. Now they use the IP set by the host.
- The "go back to where you were" link after sign-in could be tricked into leaving the site (`/\t/evil.com`). It now only allows same-site paths. Unit tests cover this.
- Distributor, account, order and checkout pages are now sent with `Cache-Control: private, no-store`, like /ops already was.

Known and accepted: `npm audit` reports a denial-of-service issue in `deepmerge-ts`, used only by the Prisma command-line tool to read its own config. Visitors can't reach it. The fix needs a major Prisma upgrade (6 → 7), which should be planned separately.

## Accessibility and speed check (16 Nov 2026)

A production build was scanned with axe (WCAG 2.1 AA) on a phone-sized screen: 14 public pages, the customer account, all /ops screens and the partner portal.

Fixed:
- The announcement bar was outside the page's landmark areas.
- The points progress bar had no label.
- The report chart's bars were labelled in a way screen readers ignore.
- The green "Active"/"Live"/"Delivered" badges had too little contrast.
- The network map hid its clickable areas from screen readers.

After the fixes, no issues remain on any scanned page. Public pages load in about 0.6s locally and nothing scrolls sideways on a phone. Public pages are cached by the CDN, and signed-in pages are never cached.

## Soft launch without SMS (16 Nov 2026)

There is no SMS for the soft launch. Everything that used SMS now uses email:
- **Sign-in** (customers, distributors, HQ) is by email address with a 6-digit code. The phone number is still asked for at checkout, because riders need it, and order tracking uses it. It is saved to the account after the first order.
- **Customer messages** (payment details, payment received, status changes, replacement decisions, the sample follow-up coupon) go to the order's email.
- **Team invitations** for HQ and distributor staff go by email.
- **The bank-account-change alert** goes to the distributor by Telegram, and by email to the alert address and every owner.

To add SMS later: add an SMS provider (e.g. Termii) as a second way to send the same sign-in code and customer messages (`src/lib/otp.ts`, `src/lib/notify.ts`). Phone sign-in would then need the account's phone number confirmed once by code.
