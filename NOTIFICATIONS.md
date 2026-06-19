# Order Notifications

The backend can send a thank-you email and Telegram message when a new order is created.

## What Gets Sent

Customer email:

- Thank you message.
- Order ID.
- Pick-up location, date, and time.
- Total, when available.

Telegram:

- Admin chat receives every new order summary.
- Admin chat receives payment proof and design uploads when `order_files` webhooks are configured.
- Customer Telegram DM is sent only if the customer has started your bot before and their Telegram username is registered.

Telegram bots cannot DM a random `@username` until that user opens the bot first. That is a Telegram platform rule.

## Backend Endpoint

```text
POST /api/order-notification
```

Headers:

```text
X-PopOutPick-Webhook-Secret: your ORDER_NOTIFICATION_SECRET
Content-Type: application/json
```

Body can be either a Supabase-style payload:

```json
{
  "type": "INSERT",
  "table": "orders",
  "record": {
    "id": "order-example",
    "customer_name": "Alex",
    "customer_email": "alex@example.com",
    "customer_telegram": "@alex",
    "fulfilment": "meetup",
    "meetup": {
      "date": "2026-06-20",
      "time": "7:00 PM",
      "location": "Pasir Ris Mall"
    },
    "totals": {
      "total": 18
    }
  }
}
```

Or just the order object directly.

File upload notifications use:

```text
POST /api/order-file-notification
```

This endpoint expects a Supabase `order_files` insert payload. It downloads the private file from Supabase Storage with `SUPABASE_SERVICE_ROLE_KEY`, then sends it to `TELEGRAM_ADMIN_CHAT_ID`.

Required `.env` values:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Never expose the service-role key in browser JavaScript.

## Test From This Backend

Start the backend:

```powershell
node server.js
```

Then run:

```powershell
npm.cmd run test-notification
```

You can also sign into `admin.html` and press **Test Notification** in the Deployment Checks section.

The **Test File Bot** button checks whether service-role storage downloading is configured. It will skip/fail until you add `SUPABASE_SERVICE_ROLE_KEY`.

## Email Setup

Set in `.env`:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your@gmail.com
```

For Gmail, use an app password, not your normal account password.

## Telegram Setup

1. Open Telegram and message `@BotFather`.
2. Create a bot and copy the bot token into `TELEGRAM_BOT_TOKEN`.
3. Send any message to your bot from your own Telegram account.
4. Open:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

5. Copy your numeric chat ID into `TELEGRAM_ADMIN_CHAT_ID`.

Or run the local helper after you message the bot:

```powershell
npm.cmd run telegram-diagnose
```

## Customer Telegram Registration

Expose this backend through HTTPS, then set the Telegram webhook:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook&secret_token=YOUR_TELEGRAM_WEBHOOK_SECRET
```

When a customer starts/messages your bot, the backend stores their Telegram username to chat ID mapping in:

```text
data/telegram-chat-map.json
```

That file is intentionally ignored by git.

## Supabase Webhook Setup

Create two webhooks in Supabase Dashboard.

### Order Summary Webhook

1. Go to Database Webhooks.
2. Create a webhook for `public.orders`.
3. Event: `INSERT`.
4. Method: `POST`.
5. URL: `https://your-domain.example/api/order-notification`.
6. Header: `X-PopOutPick-Webhook-Secret` with your `ORDER_NOTIFICATION_SECRET`.

### File Upload Webhook

1. Create another webhook for `public.order_files`.
2. Event: `INSERT`.
3. Method: `POST`.
4. URL: `https://your-domain.example/api/order-file-notification`.
5. Header: `X-PopOutPick-Webhook-Secret` with your `ORDER_NOTIFICATION_SECRET`.

This is the safest setup because email/Telegram secrets remain on your backend, not in browser JavaScript.
