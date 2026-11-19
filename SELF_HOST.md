# Quantify self-host license (model A)

Run Quantify on **your** infrastructure with Pro entitlements and commercial operating rights.

The repository remains **MIT** — you can read and fork the code. A paid self-host license buys:

- a signed unlock key (`QNT1…`) that turns on Pro limits for the instance/account
- commercial use of the stack you operate
- priority email support from the founder

## Quick start

```bash
cp .env.example .env
# Set INSTANCE_PLAN=self_host  OR redeem a license key in the UI (/pricing)
docker compose up -d
```

### Unlock options

1. **Env (simplest for a private server)**  
   `INSTANCE_PLAN=self_host` (or `pro`) in `.env`.

2. **License key**  
   Redeem at `/pricing` (signed in) or `POST /api/billing/license/activate` with `{ "key": "QNT1…" }`.  
   With `LICENSE_UNLOCKS_INSTANCE=true` (default), a `self_host` key also unlocks the whole process.

3. **Development**  
   Key `PRO-DEV` works when `APP_ENV` is not production.

### Issue a key (operator)

```bash
# Requires LICENSE_SIGNING_SECRET + BILLING_ADMIN_TOKEN
curl -X POST "$API/api/billing/license/issue" \
  -H "Content-Type: application/json" \
  -d '{"licensee":"Acme Research","seats":5,"exp":"2027-12-31","admin_token":"…"}'
```

## Hosted Pro (model B)

For the managed cloud, set Stripe:

```
STRIPE_SECRET_KEY=sk_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PRO=price_…   # optional; else inline $29/mo product
```

Checkout: signed-in user → `/pricing` → Stripe → webhook sets `accounts.plan=pro`.

## Support

Founded 15 January 2025 by Mirjalol Umarov. Self-host licensees: email via the contact on the About page / GitHub.
