// Create the LIVE Stripe webhook endpoint in the Canto AI account and print its
// signing secret. Run after the server URL is live.
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dir, '../.env'), 'utf8');
const key = (env.match(/sk_live_[A-Za-z0-9]+/) || [])[0];
if (!key) { console.error('No account sk_live_ key'); process.exit(1); }
const stripe = new Stripe(key);

const URL = process.argv[2] || 'https://cantoai-api.zeabur.app/api/stripe-webhook';

const acct = await stripe.accounts.retrieve();
console.log(`Account: ${acct.id} · ${acct.settings?.dashboard?.display_name || '(no name)'}`);

const wh = await stripe.webhookEndpoints.create({
  url: URL,
  enabled_events: [
    'checkout.session.completed',
    'invoice.paid',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ],
  description: 'Canto AI server — credits/subscription crediting',
});

console.log(`✓ webhook ${wh.id} → ${wh.url}`);
console.log(`STRIPE_WEBHOOK_SECRET=${wh.secret}`);
