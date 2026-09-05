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

### Checking it works

Place a test order on the deployed site and confirm both emails arrive. If they
do not, the Vercel function logs show the reason (a missing key and a rejected
send are both logged server-side; the browser only ever gets a generic error).
