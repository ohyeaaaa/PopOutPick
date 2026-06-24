# PopOutPick Self-Hosting

This Node backend is optional when running the site through GitHub Pages plus Supabase Edge Functions. Keep it only for local testing or if you want a traditional server later.

## Start Locally

```powershell
node server.js
```

Default local URL:

```text
http://localhost:8080
```

If your PowerShell allows npm scripts, `npm.cmd start` works too.

Health check:

```text
http://localhost:8080/healthz
```

## Preflight

Start the backend in one terminal, then run:

```powershell
npm.cmd run preflight
```

This checks that public routes work, admin routes are protected, and sensitive files are blocked.

## Admin Access

The backend adds an extra HTTP Basic Auth prompt before serving:

- `admin/index.html`
- `admin/admin.css`
- `admin/admin.js`
- `/api/admin/requests`
- `/api/admin/logs`

The generated local credentials are stored in `.env`.

This is only the first gate. The admin page still requires Supabase Auth and the signed-in user's UUID must be present in `public.admin_users`.

## Run On Startup

Install a Windows Scheduled Task:

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-windows-task.ps1
```

Remove it later:

```powershell
powershell -ExecutionPolicy Bypass -File tools/uninstall-windows-task.ps1
```

The task starts `server.js` when Windows starts. Keep the machine awake if this is your public host.

Install uptime monitoring as a repeating Windows Scheduled Task:

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-monitor-task.ps1
```

## Router Setup

1. Reserve a static LAN IP for this computer in your router.
2. Forward public TCP port `80` or `443` to this computer.
3. If forwarding to the default backend port, map router external port `80` to internal port `8080`.
4. Keep Windows Firewall limited to the one port you actually expose.
5. Use a domain name and HTTPS before taking payments publicly.

## HTTPS

Running public checkout/admin pages over plain HTTP is not acceptable for real customers. Use one of these:

- Cloudflare Tunnel in front of this backend.
- A reverse proxy such as Caddy or nginx with Let's Encrypt.
- Node HTTPS mode with `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` in `.env`.

Example configs are in:

- `deploy/Caddyfile.example`
- `deploy/cloudflare-tunnel.yml.example`

If HTTPS is handled by a tunnel or reverse proxy, set:

```text
PUBLIC_BASE_URL=https://your-domain.example
TRUST_PROXY=true
REQUIRE_HTTPS=true
```

If you enable `REQUIRE_HTTPS=true` without a tunnel, reverse proxy, or Node HTTPS cert, local plain HTTP requests will redirect.

## Request Log

After signing into the backend Basic Auth gate:

```text
http://localhost:8080/api/admin/requests?limit=20
```

Persistent log file reader:

```text
http://localhost:8080/api/admin/logs?date=2026-06-19&limit=100
```

This is an in-memory rolling log of recent requests. It resets when the server restarts.

When `LOG_TO_FILE=true`, persistent JSONL logs are written into `logs/`.

## Uptime Monitoring

Single check:

```powershell
node tools/monitor.js --once
```

Continuous checks:

```powershell
npm.cmd run monitor
```

Monitor output is appended to `logs/monitor.jsonl`.

## Admin Operations

The admin page can now:

- Review orders.
- Filter orders by customer/status.
- Export visible orders to CSV.
- Export orders/settings to JSON.
- Update order status.
- Open signed Supabase storage links for order uploads when Supabase policies allow signed URL creation.

## Order Notifications

Email and Telegram notification setup is documented in `docs/NOTIFICATIONS.md`.

Use Supabase Database Webhooks to call:

```text
https://your-domain.example/api/order-notification
```

The request must include `X-PopOutPick-Webhook-Secret`.

For payment/design files, also configure a Supabase webhook to:

```text
https://your-domain.example/api/order-file-notification
```

## Checkout Submission

Orders are created by the backend at:

```text
https://your-domain.example/api/checkout/orders
```

The browser sends the order intent and payment/design image files to this endpoint. The backend recomputes product prices, shipping, discounts, and fulfilment validity, then creates the private Supabase order bucket, uploads files, and inserts `orders` and `order_files` with `SUPABASE_SERVICE_ROLE_KEY`.

For same-origin hosting, leave `commerce.checkoutApiUrl` blank in `site-config.js`. If the frontend is hosted somewhere else, set `commerce.checkoutApiUrl` to the backend URL above and add that frontend origin to `CHECKOUT_ALLOWED_ORIGINS` in `.env`.

## GitHub Pages

Static GitHub Pages deployment is documented in `docs/GITHUB_PAGES.md`.

GitHub Pages can host the website, but it cannot run `server.js`. Keep the backend separately available for checkout submission and Telegram/email notifications. The GitHub Pages build does not publish the admin files.

## Files Intentionally Not Served

The backend does not serve the entire project folder. It blocks files like:

- `.env`
- `.git`
- `database/supabase-setup.sql`
- `integrations/google-app-script.gs`
- `PopOutPick-payment.html`
- `docs/TEXT_GUIDE.md`
- `TELEGRAM.txt`
- source design/STL/3MF folders

Only the public pages, scripts, styles, GLB files, selected images, video assets, and video files are served publicly. Admin files are served only by the backend behind the admin gate.

## Remaining Public Launch Checklist

- Apply the latest `database/supabase-setup.sql` in Supabase.
- Confirm RLS is enabled on all tables listed in the SQL.
- Confirm the admin Auth user is in `public.admin_users`.
- Set a long unique `ADMIN_PASSWORD` in `.env`.
- Use HTTPS.
- Run `npm.cmd run preflight`.
- Test checkout with a real order and verify files land under `order-.../design` and `order-.../payment`.
