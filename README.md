# Nouryay-Perfumes

The Nouryah storefront: a single static page (`index.html`) plus one serverless
endpoint (`api/order.js`) that emails order confirmations.

## Order email

When a customer places an order or sends an order request, the browser posts to
`/api/order`, which sends two emails through [Resend](https://resend.com):

- a receipt to the customer, with the shop as reply-to
- a notification to the shop, with the customer as reply-to

The confirmation screen only claims a receipt was sent once that call succeeds.

### Deploying

**This must be hosted somewhere that runs serverless functions — Vercel, Netlify
or similar. GitHub Pages serves static files only, so `/api/order` would 404
there and no email would ever be sent.**

On Vercel: import this repo, accept the zero-config defaults (no build step, the
root is served statically and `api/` becomes a function), then set the
environment variables below and redeploy.

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | From <https://resend.com/api-keys>. Without it the endpoint returns 500 and no mail is sent. |
| `ORDER_FROM_EMAIL` | recommended | Sender, e.g. `Nouryah <orders@nouryah.pk>`. The domain must be verified in Resend. Defaults to Resend's shared `onboarding@resend.dev`, which works for testing but is far more likely to land in spam. |
| `SHOP_NOTIFY_EMAIL` | no | Where shop notifications go. Defaults to the address in `api/order.js`. |
| `ALLOWED_ORIGIN` | recommended | e.g. `https://nouryah.pk`. Rejects posts from other origins. Leave unset to allow any. |

Set these in the Vercel project under Settings → Environment Variables. Never
put the API key in `index.html` — anything in that file is public.

## WhatsApp confirmations

The same endpoint messages the customer and the business number
(0334 820 0192) over the WhatsApp Cloud API. It is skipped entirely unless
both `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set, and a WhatsApp
failure never affects the order or the emails — it is only logged.

| Variable | Required | Purpose |
| --- | --- | --- |
| `WHATSAPP_TOKEN` | for WhatsApp | Permanent access token for the WhatsApp Business account. |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | The sending number's ID from the Meta app dashboard. Not the phone number itself. |
| `WHATSAPP_TEMPLATE_NAME` | in practice yes | Approved template for customer messages. Without it the code sends plain text, which Meta only delivers to people who messaged the business in the last 24 hours — so real customers will not receive it. |
| `WHATSAPP_SHOP_TEMPLATE_NAME` | no | Separate template for the business notification. Falls back to `WHATSAPP_TEMPLATE_NAME`. |
| `WHATSAPP_TEMPLATE_LANG` | no | Template language code. Defaults to `en`. |
| `WHATSAPP_SHOP_NUMBER` | no | Business number in E.164 digits. Defaults to `923348200192`. |
| `WHATSAPP_API_VERSION` | no | Graph API version. Defaults to `v21.0`. |

Templates receive four body parameters in this order:

- customer: name, order number, total (or units for a request), expected delivery (or city)
- business: order number, customer name, total (or units), city

**Registering a number with the Cloud API removes it from the normal WhatsApp
and WhatsApp Business apps.** If 0334 820 0192 is in day-to-day use, register a
different number for sending and keep this one only as the notification
recipient.

## Order tracking

Orders are saved to the customer's own browser (`localStorage`, key
`nouryah.orders`) when placed, and the tracking screen reads from there. The
confirmation screen's "Track your order" link and the copied link
(`…/#track=<code>`) both open it, as does the footer link, and a code can be
typed in by hand. Lookup accepts either the order number or the tracking code.

**This only works on the device the order was placed from** — there is no
server-side order store, so a customer cannot track from their phone an order
placed on a laptop, and clearing browser data loses it. Making tracking work
everywhere needs orders persisted in a database, and showing real courier
progress needs the TCS consignment number recorded against the order after
handover.

### Checking it works

Place a test order on the deployed site and confirm both emails arrive. If they
do not, the Vercel function logs show the reason (a missing key and a rejected
send are both logged server-side; the browser only ever gets a generic error).
