# GitHub Pages Deployment

GitHub Pages hosts the public static website. Checkout submission and uploads are handled by Supabase Edge Functions.

## What Works On GitHub Pages

- Home page.
- Configurator.
- Checkout submission through Supabase.
- Admin dashboard through Supabase Auth and RLS.

The GitHub Pages build publishes the static admin page at `/hotcheeks/`. Supabase Auth and the `public.admin_users` allowlist protect the data.

## What Supabase Handles

- Checkout order submission and payment/design file upload.
- Telegram admin notifications, when Edge Function secrets are configured.
- Customer email notifications, when Resend secrets are configured.
- Private storage for payment/design files.
- Admin CRUD through Supabase RLS.

The Node `server.js` is no longer required for the GitHub Pages + Supabase setup.

## Checkout API

`commerce.checkoutApiUrl` in `site-config.js` should point to the Supabase function:

```js
checkoutApiUrl: "https://jllzhecqlxzegnrqhxnc.supabase.co/functions/v1/checkout-order",
```

In Supabase Edge Function secrets, allow your GitHub Pages origin:

```text
CHECKOUT_ALLOWED_ORIGINS=https://your-github-username.github.io
TURNSTILE_REQUIRED=true
TURNSTILE_SECRET_KEY=your-turnstile-secret-key
TURNSTILE_EXPECTED_ACTION=checkout
```

In `site-config.js`, set the public Cloudflare Turnstile site key:

```js
turnstile: {
    siteKey: "your-turnstile-site-key",
    action: "checkout"
}
```

## Local Static Build

```powershell
npm.cmd run build:pages
```

This creates `dist/`.

The build copies only approved public files and assets. It intentionally excludes:

- `.env`
- `TELEGRAM.txt`
- `server.js`
- `database/supabase-setup.sql`
- `PopOutPick-payment.html`
- `docs/`
- `tools/`
- `data/`
- `logs/`
- private design/source files

## GitHub Setup

1. Push this repository to GitHub.
2. In GitHub, go to repository **Settings**.
3. Go to **Pages**.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push to `main` or run the workflow manually.

The workflow is:

```text
.github/workflows/pages.yml
```

## Subdomain Setup

If using a custom subdomain for GitHub Pages, use a `CNAME` DNS record.

Example:

```text
Type: CNAME
Subdomain: www
Destination: your-github-username.github.io
```

Then add the custom domain in GitHub Pages settings.

Do not use an `A` record for GitHub Pages unless GitHub specifically gives you the IP records you want to use.

## Backend Webhook URLs

If you later add separate notification Edge Functions, Supabase webhooks should point to Supabase function URLs, not GitHub Pages.

Examples:

```text
https://jllzhecqlxzegnrqhxnc.supabase.co/functions/v1/order-notification
https://jllzhecqlxzegnrqhxnc.supabase.co/functions/v1/order-file-notification
```
