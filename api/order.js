// Sends order mail: a receipt to the customer and a notification to the shop.
//
// This runs server-side so RESEND_API_KEY never reaches the browser. Configure
// in the Vercel project (Settings -> Environment Variables):
//
//   RESEND_API_KEY     required, from https://resend.com/api-keys
//   SHOP_NOTIFY_EMAIL  optional, defaults to the address below
//   ORDER_FROM_EMAIL   optional, must be on a domain verified in Resend
//   ALLOWED_ORIGIN     optional, e.g. https://nouryah.pk — rejects other origins

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const SHOP_EMAIL = process.env.SHOP_NOTIFY_EMAIL || 'Muhammadfaiez979@gmail.com';
// resend.dev is Resend's shared sender; it works without a verified domain but
// lands in spam more often. Point ORDER_FROM_EMAIL at your own domain for real use.
const FROM = process.env.ORDER_FROM_EMAIL || 'Nouryah <onboarding@resend.dev>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LINES = 40;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(v, n) {
  return String(v == null ? '' : v).trim().slice(0, n);
}

function shell(heading, intro, rows, footer) {
  return `<div style="background:#08080A;padding:32px 0;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#0E0E10;border:1px solid rgba(255,255,255,.09);padding:36px 34px;color:#EFEAE0">
    <div style="font-size:22px;letter-spacing:.24em;text-transform:uppercase;color:#C9A05C">Nouryah</div>
    <div style="font-size:9px;letter-spacing:.4em;text-transform:uppercase;color:#6E6960;margin-top:5px">Perfumes &middot; Pakistan</div>
    <h1 style="font-size:24px;font-weight:400;margin:28px 0 0">${esc(heading)}</h1>
    <p style="font-size:15px;line-height:1.75;color:#9A948A;margin:14px 0 0">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:26px;font-size:14px">${rows}</table>
    <p style="font-size:12px;line-height:1.7;color:#6E6960;margin:26px 0 0;border-top:1px solid rgba(255,255,255,.09);padding-top:18px">${footer}</p>
  </div>
</div>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#6E6960;font-size:10px;letter-spacing:.2em;text-transform:uppercase;width:150px;vertical-align:top">${esc(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#EFEAE0">${esc(value)}</td>
  </tr>`;
}

function lineRows(lines) {
  if (!lines.length) return '';
  const head = `<tr><td colspan="2" style="padding:16px 0 8px;color:#6E6960;font-size:10px;letter-spacing:.2em;text-transform:uppercase">Items</td></tr>`;
  const body = lines.map(l => `<tr>
    <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#EFEAE0">${esc(l.name)}${l.sizeLabel ? ` <span style="color:#6E6960">&middot; ${esc(l.sizeLabel)}</span>` : ''} &times; ${esc(l.qty)}</td>
    <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#EFEAE0;text-align:right;white-space:nowrap">${esc(l.totalLabel)}</td>
  </tr>`).join('');
  return head + body;
}

function plain(pairs) {
  return pairs.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}

// Normalises whatever the browser posted into a safe, bounded shape. Everything
// that reaches an email body goes through clip() here and esc() at render time.
function readOrder(body) {
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : [];
  return {
    no: clip(body.no, 40),
    trackingCode: clip(body.trackingCode, 60),
    first: clip(body.first, 80),
    last: clip(body.last, 80),
    email: clip(body.email, 160).toLowerCase(),
    phone: clip(body.phone, 40),
    address: clip(body.address, 300),
    zip: clip(body.zip, 20),
    city: clip(body.city, 80),
    province: clip(body.province, 80),
    shipName: clip(body.shipName, 80),
    pay: clip(body.pay, 80),
    totalLabel: clip(body.totalLabel, 40),
    eta: clip(body.eta, 80),
    giftWrap: !!body.giftWrap,
    lines: lines.map(l => ({
      name: clip(l && l.name, 120),
      sizeLabel: clip(l && l.sizeLabel, 60),
      qty: clip(l && l.qty, 10),
      totalLabel: clip(l && l.totalLabel, 40)
    }))
  };
}

function readRequest(body) {
  const picks = Array.isArray(body.picks) ? body.picks.slice(0, MAX_LINES) : [];
  return {
    no: clip(body.no, 40),
    name: clip(body.name, 120),
    company: clip(body.company, 160),
    email: clip(body.email, 160).toLowerCase(),
    phone: clip(body.phone, 40),
    city: clip(body.city, 80),
    fragrances: picks.map(p => clip(p, 80)).filter(Boolean).join(', '),
    units: clip(body.units, 20),
    tier: clip(body.tier, 80),
    estimate: clip(body.estimate, 40),
    date: clip(body.date, 40),
    note: clip(body.note, 1200),
    invoice: !!body.invoice
  };
}

function buildOrderMail(o) {
  const name = o.first || 'there';
  const ship = [o.address, o.city, o.province, o.zip].filter(Boolean).join(', ');
  const details =
    detailRow('Order', o.no) +
    lineRows(o.lines) +
    detailRow('Total', o.totalLabel) +
    detailRow('Payment', o.pay) +
    detailRow('Delivery', o.shipName) +
    detailRow('Expected', o.eta) +
    detailRow('Ship to', ship) +
    detailRow('Phone', o.phone) +
    (o.giftWrap ? detailRow('Gift wrap', 'Yes') : '') +
    detailRow('Tracking', o.trackingCode);

  // shell() escapes the heading; intro is raw HTML so it escapes its own values.
  const customerHtml = shell(
    `Thank you, ${name}.`,
    `Your order <strong style="color:#EFEAE0">${esc(o.no)}</strong> is confirmed. Two samples are going in the box, chosen against what you ordered.`,
    details,
    `Questions? Reply to this email or message us on WhatsApp. This is a confirmation of your request &mdash; we will be in touch to arrange payment and delivery.`
  );

  const shopHtml = shell(
    `New order ${o.no}`,
    `${esc([o.first, o.last].filter(Boolean).join(' ') || 'A customer')} placed an order via the website.`,
    details + detailRow('Customer email', o.email),
    `Sent automatically by the Nouryah storefront.`
  );

  const text = plain([
    ['Order', o.no],
    ['Customer', [o.first, o.last].filter(Boolean).join(' ')],
    ['Email', o.email],
    ['Phone', o.phone],
    ['Items', o.lines.map(l => `${l.name} ${l.sizeLabel} x${l.qty} ${l.totalLabel}`).join(' | ')],
    ['Total', o.totalLabel],
    ['Payment', o.pay],
    ['Delivery', o.shipName],
    ['Expected', o.eta],
    ['Ship to', ship],
    ['Tracking', o.trackingCode]
  ]);

  return { customerHtml, shopHtml, text };
}

function buildRequestMail(r) {
  const details =
    detailRow('Request', r.no) +
    detailRow('Name', r.name) +
    detailRow('Company', r.company) +
    detailRow('Phone', r.phone) +
    detailRow('Deliver to', r.city) +
    detailRow('Fragrances', r.fragrances) +
    detailRow('Units', r.units) +
    detailRow('Volume tier', r.tier) +
    detailRow('Indicative list', r.estimate) +
    detailRow('Needed by', r.date) +
    detailRow('Invoice requested', r.invoice ? 'Yes' : '') +
    detailRow('Note', r.note);

  const customerHtml = shell(
    `Request received, ${r.name || 'there'}.`,
    `We have your order request <strong style="color:#EFEAE0">${esc(r.no)}</strong>. A quote follows within one working day.`,
    details,
    `Reply to this email to add anything to the request.`
  );

  const shopHtml = shell(
    `New order request ${r.no}`,
    `${esc(r.name || 'A customer')} submitted a wholesale / gifting request.`,
    details + detailRow('Customer email', r.email),
    `Sent automatically by the Nouryah storefront.`
  );

  const text = plain([
    ['Request', r.no],
    ['Name', r.name],
    ['Company', r.company],
    ['Email', r.email],
    ['Phone', r.phone],
    ['Deliver to', r.city],
    ['Fragrances', r.fragrances],
    ['Units', r.units],
    ['Volume tier', r.tier],
    ['Indicative list', r.estimate],
    ['Needed by', r.date],
    ['Note', r.note]
  ]);

  return { customerHtml, shopHtml, text };
}

async function send({ to, subject, html, text, replyTo }) {
  const payload = { from: FROM, to: [to], subject, html, text };
  if (replyTo) payload.reply_to = replyTo;

  const r = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    // Surface the provider's reason in the server log only — never to the client,
    // since the response can echo request detail.
    const detail = await r.text().catch(() => '');
    throw new Error(`Resend ${r.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

// ─── WhatsApp (Meta Cloud API) ───────────────────────────────────────────────
//
// Business-initiated messages must use a template Meta has approved; free-form
// text only reaches someone who messaged you in the last 24 hours. Set
// WHATSAPP_TEMPLATE_NAME once your template is approved — without it this falls
// back to plain text, which is fine for testing but will be rejected for
// customers who have never messaged the business number.

const WA_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
// The business number shown at the top of the storefront: 0334 820 0192.
const SHOP_WA = process.env.WHATSAPP_SHOP_NUMBER || '923348200192';

// Pakistani numbers as typed into the checkout ("0300 1234567", "+92 300 …",
// "300…") normalised to the digits-only E.164 form the Cloud API expects.
function toE164Pk(raw) {
  const d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('92') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) return '92' + d;
  return null; // not a number we can address with confidence — skip rather than guess
}

function waConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function sendWhatsApp({ to, template, params, text }) {
  const body = template
    ? {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p || '—') })) }]
        }
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };

  const r = await fetch(`https://graph.facebook.com/${WA_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`WhatsApp ${r.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed) {
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    if (!origin.startsWith(allowed) && !referer.startsWith(allowed)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — cannot send order mail.');
    return res.status(500).json({ error: 'Email is not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const isRequest = body.type === 'request';
  const data = isRequest ? readRequest(body) : readOrder(body);

  if (!EMAIL_RE.test(data.email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!data.no) {
    return res.status(400).json({ error: 'Missing order reference' });
  }
  if (!isRequest && data.lines.length === 0) {
    return res.status(400).json({ error: 'Order has no items' });
  }

  const mail = isRequest ? buildRequestMail(data) : buildOrderMail(data);
  const label = isRequest ? 'Order request' : 'Order';

  // The customer receipt is what the confirmation screen promises, so its result
  // drives the response. The shop notification is sent independently: if it fails
  // the customer should still see their confirmation.
  const [customer, shop] = await Promise.allSettled([
    send({
      to: data.email,
      subject: `${label} ${data.no} — Nouryah`,
      html: mail.customerHtml,
      text: mail.text,
      replyTo: SHOP_EMAIL
    }),
    send({
      to: SHOP_EMAIL,
      subject: `${label} ${data.no} — ${(isRequest ? data.name : [data.first, data.last].filter(Boolean).join(' ')) || 'Customer'}`,
      html: mail.shopHtml,
      text: mail.text,
      replyTo: data.email
    })
  ]);

  if (customer.status === 'rejected') console.error('Customer mail failed:', customer.reason);
  if (shop.status === 'rejected') console.error('Shop mail failed:', shop.reason);

  const customerSent = customer.status === 'fulfilled';
  const shopSent = shop.status === 'fulfilled';

  // WhatsApp is best-effort and never affects the response status: a customer
  // who has a working receipt should not see an error because Meta rejected a
  // template. Failures are logged for the operator instead.
  const whatsapp = { customer: false, shop: false, skipped: !waConfigured() };
  if (waConfigured()) {
    const who = isRequest ? data.name : [data.first, data.last].filter(Boolean).join(' ');
    const summary = isRequest
      ? `${label} ${data.no}: ${data.fragrances || '—'}, ${data.units || '—'} units for ${data.city || '—'}.`
      : `${label} ${data.no}: ${data.lines.map(l => `${l.name} x${l.qty}`).join(', ')} — ${data.totalLabel}.`;

    const custNumber = toE164Pk(data.phone);
    const custParams = [who || 'there', data.no, isRequest ? (data.units || '—') : data.totalLabel, isRequest ? (data.city || '—') : (data.eta || '—')];
    const shopParams = [data.no, who || 'Customer', isRequest ? (data.units || '—') : data.totalLabel, data.city || '—'];

    const jobs = [];
    if (custNumber) {
      jobs.push(['customer', sendWhatsApp({
        to: custNumber,
        template: process.env.WHATSAPP_TEMPLATE_NAME,
        params: custParams,
        text: `Thank you ${who || ''}. ${summary} We will confirm delivery shortly. — Nouryah`
      })]);
    } else if (data.phone) {
      console.error('Skipping customer WhatsApp — unrecognised number:', data.phone);
    }
    jobs.push(['shop', sendWhatsApp({
      to: SHOP_WA,
      template: process.env.WHATSAPP_SHOP_TEMPLATE_NAME || process.env.WHATSAPP_TEMPLATE_NAME,
      params: shopParams,
      text: `New ${summary} Contact: ${data.phone || '—'} / ${data.email}`
    })]);

    const results = await Promise.allSettled(jobs.map(j => j[1]));
    results.forEach((r, i) => {
      const key = jobs[i][0];
      if (r.status === 'fulfilled') whatsapp[key] = true;
      else console.error(`WhatsApp to ${key} failed:`, r.reason);
    });
  }

  if (!customerSent && !shopSent) {
    return res.status(502).json({ error: 'Could not send order mail', customerSent, shopSent, whatsapp });
  }

  return res.status(200).json({ ok: true, customerSent, shopSent, whatsapp });
};
