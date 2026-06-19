# GitHub Pages Deployment

GitHub Pages can host the public static website. It cannot run the Node backend.

## What Works On GitHub Pages

- Home page.
- Configurator.
- Checkout frontend.
- Supabase browser uploads and order inserts.
- Admin page UI, because it talks directly to Supabase with the anon key and RLS.

## What Still Needs The Backend

- Telegram order notifications.
- Telegram payment/design file forwarding.
- Email notifications.
- Backend request logs.
- Backend Basic Auth gate around `admin.html`.

For those features, keep running `server.js` on your PC, a VPS, or behind Cloudflare Tunnel.

## Local Static Build

```powershell
npm.cmd run build:pages
```

This creates `dist/`.

The build copies only approved public files and assets. It intentionally excludes:

- `.env`
- `TELEGRAM.txt`
- `server.js`
- `supabase-setup.sql`
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

If the frontend is on GitHub Pages but notifications are on your backend, Supabase webhooks should point to the backend domain, not GitHub Pages.

Examples:

```text
https://api.yourdomain.example/api/order-notification
https://api.yourdomain.example/api/order-file-notification
```
