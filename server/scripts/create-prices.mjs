// Create Canto AI credit-pack + monthly products/prices in the account-scoped
// LIVE Stripe account (sk_live_ on .env line 28). Prints price ids.
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dir, '../.env'), 'utf8');
const key = (env.match(/sk_live_[A-Za-z0-9]+/) || [])[0];
if (!key) { console.error('No account sk_live_ key found'); process.exit(1); }
const stripe = new Stripe(key);

// Safety: confirm which account we are about to write to.
const acct = await stripe.accounts.retrieve();
const name = acct.settings?.dashboard?.display_name || acct.business_profile?.name || '(no name)';
console.log(`Account: ${acct.id} · ${name} · country=${acct.country} · charges_enabled=${acct.charges_enabled}`);
if (/hklaw/i.test(name)) { console.error('!! Looks like HKLAW account — aborting.'); process.exit(1); }

const ITEMS = [
  { env: 'STRIPE_PRICE_PACK_60',  name: 'Canto AI — 60 分鐘',  desc: '60 分鐘額度（轉錄／字幕／剪片，永久有效）', amount: 3000 },
  { env: 'STRIPE_PRICE_PACK_180', name: 'Canto AI — 180 分鐘', desc: '180 分鐘額度（永久有效），熱門裝', amount: 7800 },
  { env: 'STRIPE_PRICE_PACK_600', name: 'Canto AI — 600 分鐘', desc: '600 分鐘額度（永久有效），最抵', amount: 22800 },
  { env: 'STRIPE_PRICE_MONTHLY',  name: 'Canto AI — 月費無憂',  desc: '每月 1200 分鐘額度（每期重置）+ AI 免扣', amount: 8800, monthly: true },
];

const out = {};
for (const it of ITEMS) {
  const product = await stripe.products.create({ name: it.name, description: it.desc });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'hkd',
    unit_amount: it.amount,
    ...(it.monthly ? { recurring: { interval: 'month' } } : {}),
  });
  out[it.env] = price.id;
  console.log(`✓ ${it.name}  →  ${price.id}  (HK$${(it.amount / 100).toFixed(0)}${it.monthly ? '/月' : ''})`);
}

console.log('\n--- paste into server/.env ---');
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
console.log('done');
