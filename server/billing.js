// Billing endpoints: Stripe (web) + RevenueCat (iOS) → credits/subscription in Firestore.
// All handlers degrade gracefully when keys are absent so the dev server still boots.
import express from 'express';

// ---- Lazy/guarded SDK init ----
let stripe = null;
let admin = null;
let dbReady = false;

const FIRESTORE_DB_ID = process.env.FIRESTORE_DB_ID || 'cantonese-aitranscriber';

async function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const { default: Stripe } = await import('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

let cachedDb = null;
async function getDb() {
  if (dbReady) return cachedDb;
  try {
    const mod = await import('firebase-admin');
    admin = mod.default || mod;
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!admin.apps?.length) {
      // Uses GOOGLE_APPLICATION_CREDENTIALS env, or FIREBASE_SERVICE_ACCOUNT (JSON string).
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        });
      } else {
        admin.initializeApp();
      }
    }
    // Target the named (non-default) Firestore database explicitly.
    cachedDb = getFirestore(admin.app(), FIRESTORE_DB_ID || '(default)');
    dbReady = true;
    return cachedDb;
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
    return null;
  }
}

// Server-side product catalogue. Keep in sync with frontend constants.ts.
// Stripe price IDs come from env (set after creating products in Stripe).
const CREDIT_PACKS = {
  pack_60: { minutes: 60, price: process.env.STRIPE_PRICE_PACK_60 },
  pack_180: { minutes: 180, price: process.env.STRIPE_PRICE_PACK_180 },
  pack_600: { minutes: 600, price: process.env.STRIPE_PRICE_PACK_600 },
};
const MONTHLY = { minutes: 1200, price: process.env.STRIPE_PRICE_MONTHLY };

// iOS product id → minutes (RevenueCat sends the product identifier).
const IOS_PRODUCT_MINUTES = {
  'cai.credits.60': { minutes: 60, type: 'credit' },
  'cai.credits.180': { minutes: 180, type: 'credit' },
  'cai.credits.600': { minutes: 600, type: 'credit' },
  'cai.sub.monthly': { minutes: MONTHLY.minutes, type: 'subscription' },
};

async function addMinutes(uid, minutes, patch = {}) {
  const db = await getDb();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data().creditMinutes || 0) : 0;
    tx.set(
      ref,
      { creditMinutes: cur + minutes, updatedAt: Date.now(), ...patch },
      { merge: true }
    );
  });
}

async function setMinutes(uid, minutes, patch = {}) {
  const db = await getDb();
  if (!db) throw new Error('Firestore unavailable');
  await db.collection('users').doc(uid).set(
    { creditMinutes: minutes, updatedAt: Date.now(), ...patch },
    { merge: true }
  );
}

// Record a purchase for the admin backend. Best-effort.
async function logPurchase(data) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.collection('purchases').add({ ...data, createdAt: Date.now() });
  } catch (e) {
    console.warn('logPurchase failed:', e.message);
  }
}

export function createBillingRouter() {
  const router = express.Router();

  // --- Create Stripe Checkout session (web) ---
  router.post('/api/create-checkout-session', express.json(), async (req, res) => {
    const s = await getStripe();
    if (!s) return res.status(501).json({ error: 'Stripe not configured. See BILLING_SETUP.md' });
    const { uid, kind, productId, successUrl, cancelUrl } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    try {
      let line, mode;
      if (kind === 'subscription') {
        if (!MONTHLY.price) return res.status(501).json({ error: 'STRIPE_PRICE_MONTHLY not set' });
        line = { price: MONTHLY.price, quantity: 1 };
        mode = 'subscription';
      } else {
        const pack = CREDIT_PACKS[productId];
        if (!pack?.price) return res.status(400).json({ error: 'Unknown/unconfigured pack' });
        line = { price: pack.price, quantity: 1 };
        mode = 'payment';
      }

      const session = await s.checkout.sessions.create({
        mode,
        line_items: [line],
        success_url: successUrl || `${req.headers.origin}?checkout=success`,
        cancel_url: cancelUrl || `${req.headers.origin}?checkout=cancel`,
        client_reference_id: uid,
        metadata: { uid, kind, productId: productId || 'monthly' },
        // For subscriptions, propagate uid so invoice webhooks can find the user.
        subscription_data: mode === 'subscription' ? { metadata: { uid } } : undefined,
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('checkout error', e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- Stripe customer portal ---
  router.post('/api/billing-portal', express.json(), async (req, res) => {
    const s = await getStripe();
    if (!s) return res.status(501).json({ error: 'Stripe not configured' });
    const { uid, returnUrl } = req.body;
    try {
      const db = await getDb();
      const snap = await db?.collection('users').doc(uid).get();
      const customerId = snap?.data()?.stripeCustomerId;
      if (!customerId) return res.status(400).json({ error: 'No Stripe customer for user' });
      const portal = await s.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || req.headers.origin,
      });
      res.json({ url: portal.url });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Stripe webhook (raw body mounted in index.js) ---
  router.post('/api/stripe-webhook', async (req, res) => {
    const s = await getStripe();
    if (!s) return res.status(501).end();
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const sess = event.data.object;
          const uid = sess.client_reference_id || sess.metadata?.uid;
          if (!uid) break;
          const email = sess.customer_details?.email || null;
          if (sess.mode === 'payment') {
            const pack = CREDIT_PACKS[sess.metadata?.productId];
            if (pack) {
              await addMinutes(uid, pack.minutes, { plan: 'payg', platform: 'web', stripeCustomerId: sess.customer });
              await logPurchase({ uid, email, source: 'stripe', platform: 'web', type: 'credit', productId: sess.metadata?.productId, minutes: pack.minutes, amount: sess.amount_total, currency: sess.currency });
            }
          } else if (sess.mode === 'subscription') {
            await setMinutes(uid, MONTHLY.minutes, {
              plan: 'monthly', platform: 'web', subscriptionStatus: 'active',
              stripeCustomerId: sess.customer,
              subscriptionRenewsAt: Date.now() + 31 * 24 * 3600 * 1000,
            });
            await logPurchase({ uid, email, source: 'stripe', platform: 'web', type: 'subscription', productId: 'monthly', minutes: MONTHLY.minutes, amount: sess.amount_total, currency: sess.currency });
          }
          break;
        }
        case 'invoice.paid': {
          // Monthly renewal → refill allowance.
          const inv = event.data.object;
          const uid = inv.subscription_details?.metadata?.uid || inv.metadata?.uid;
          if (uid) {
            const periodEnd = (inv.lines?.data?.[0]?.period?.end || 0) * 1000;
            await setMinutes(uid, MONTHLY.minutes, {
              plan: 'monthly', subscriptionStatus: 'active',
              subscriptionRenewsAt: periodEnd || Date.now() + 31 * 24 * 3600 * 1000,
            });
            await logPurchase({ uid, source: 'stripe', platform: 'web', type: 'renewal', productId: 'monthly', minutes: MONTHLY.minutes, amount: inv.amount_paid, currency: inv.currency });
          }
          break;
        }
        case 'customer.subscription.deleted':
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const uid = sub.metadata?.uid;
          if (uid) {
            const status = sub.status === 'active' || sub.status === 'trialing' ? 'active'
              : sub.status === 'past_due' ? 'past_due'
              : sub.cancel_at_period_end ? 'active' : 'canceled';
            await setMinutes(uid, status === 'active' ? MONTHLY.minutes : 0, {
              subscriptionStatus: status,
              plan: status === 'canceled' ? 'free' : 'monthly',
            });
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error('Webhook handler error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- RevenueCat webhook (iOS) ---
  // Configure RevenueCat → app_user_id = Firebase uid, and an Authorization
  // header bearer = REVENUECAT_WEBHOOK_SECRET.
  router.post('/api/revenuecat-webhook', express.json(), async (req, res) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).end();
    }
    const ev = req.body?.event;
    if (!ev) return res.status(400).end();

    const uid = ev.app_user_id;
    const product = IOS_PRODUCT_MINUTES[ev.product_id];
    try {
      switch (ev.type) {
        case 'NON_RENEWING_PURCHASE':
        case 'INITIAL_PURCHASE':
        case 'RENEWAL': {
          if (!uid || !product) break;
          if (product.type === 'subscription') {
            await setMinutes(uid, product.minutes, {
              plan: 'monthly', platform: 'ios', subscriptionStatus: 'active',
              subscriptionRenewsAt: ev.expiration_at_ms || (Date.now() + 31 * 24 * 3600 * 1000),
            });
          } else {
            await addMinutes(uid, product.minutes, { plan: 'payg', platform: 'ios' });
          }
          await logPurchase({ uid, source: 'revenuecat', platform: 'ios', type: product.type, productId: ev.product_id, minutes: product.minutes, amount: ev.price_in_purchased_currency, currency: ev.currency });
          break;
        }
        case 'CANCELLATION':
        case 'EXPIRATION': {
          if (uid) await setMinutes(uid, 0, { subscriptionStatus: 'expired', plan: 'free' });
          break;
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error('RevenueCat handler error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
