# Supabase Backend

This project can run checkout submission and uploads through a Supabase Edge Function instead of a separate Node server.

## What Supabase Handles

- `checkout-order` Edge Function receives checkout form submissions.
- Supabase Storage stores payment proof and design uploads in private per-order buckets.
- Supabase Postgres stores rows in `orders` and `order_files`.
- The static admin page uses Supabase Auth and RLS to manage orders/settings.
- Telegram admin notification is sent from the Edge Function when configured.
- Customer email can be sent from the Edge Function with Resend.

## One-Time Database Setup

Run this SQL in the Supabase SQL editor:

```text
database/supabase-setup.sql
```

Create an admin Auth user, then add their UUID to `public.admin_users`.

## Function Secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are reserved Supabase-provided runtime variables. Do not set them with `supabase secrets set`.

Set the project-specific secrets in Supabase Dashboard > Project Settings > Edge Functions > Secrets, or with the Supabase CLI:

```powershell
npx.cmd supabase secrets set CHECKOUT_ALLOWED_ORIGINS=https://ohyeaaaa.github.io
npx.cmd supabase secrets set SHOP_NAME=PopOutPick
npx.cmd supabase secrets set TELEGRAM_BOT_TOKEN=your-bot-token
npx.cmd supabase secrets set TELEGRAM_ADMIN_CHAT_ID=your-chat-id
npx.cmd supabase secrets set RESEND_API_KEY=your-resend-api-key
npx.cmd supabase secrets set NOTIFICATION_FROM_EMAIL=orders@your-domain.example
```

Only `CHECKOUT_ALLOWED_ORIGINS` is required for checkout if Supabase provides the reserved variables. Telegram and Resend are optional.

If your function ever reports that the checkout backend is not configured, set this fallback secret with the service-role key from Project Settings > API:

```powershell
npx.cmd supabase secrets set POPOUTPICK_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Deploy

Install and log in to the Supabase CLI, then run:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref jllzhecqlxzegnrqhxnc
npx.cmd supabase functions deploy checkout-order
```

The checkout endpoint is:

```text
https://jllzhecqlxzegnrqhxnc.supabase.co/functions/v1/checkout-order
```

## Admin Page

The admin UI is now included in the GitHub Pages static build:

```text
https://ohyeaaaa.github.io/PopOutPick/hotcheeks/
```

It is protected by Supabase Auth plus the `public.admin_users` allowlist. The old Node-only preflight and notification test buttons are hidden in static mode.
