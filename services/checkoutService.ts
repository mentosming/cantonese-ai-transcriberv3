import { CREDIT_PACKS, MONTHLY_PLAN, REVENUECAT_IOS_SDK_KEY } from "../constants";
import { API_BASE } from "./apiBase";

/**
 * True when running inside the native iOS shell (Capacitor). On iOS, Apple
 * requires in-app purchases to go through StoreKit — we route those to
 * RevenueCat instead of Stripe to stay App Store compliant.
 */
export const isNativeIOS = (): boolean => {
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios";
};

// ---- WEB: Stripe Checkout ----
const startStripeCheckout = async (
  uid: string,
  kind: "credit" | "subscription",
  productId: string
): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      kind,
      productId,
      successUrl: `${window.location.origin}?checkout=success`,
      cancelUrl: `${window.location.origin}?checkout=cancel`,
    }),
  });
  if (!res.ok) throw new Error(`Checkout failed: ${res.status}`);
  const { url } = await res.json();
  if (!url) throw new Error("No checkout URL returned");
  window.location.href = url;
};

// ---- iOS: RevenueCat (StoreKit) ----
// Dynamically imported so the web bundle never needs the native plugin.
// `/* @vite-ignore */` stops Vite from trying to resolve it at build time.
const loadPurchases = async (): Promise<any> => {
  const mod = await import(/* @vite-ignore */ "@revenuecat/purchases-capacitor");
  return (mod as any).Purchases;
};

let rcConfigured = false;

/**
 * Configure RevenueCat once and tie the RevenueCat app_user_id to the Firebase
 * uid, so purchase webhooks credit the right user. No-op off native iOS.
 */
export const configureRevenueCat = async (uid: string): Promise<void> => {
  if (!isNativeIOS()) return;
  try {
    const Purchases = await loadPurchases();
    if (!rcConfigured) {
      await Purchases.configure({ apiKey: REVENUECAT_IOS_SDK_KEY });
      rcConfigured = true;
    }
    await Purchases.logIn({ appUserID: uid });
  } catch (e) {
    console.warn("RevenueCat configure failed:", e);
  }
};

// Purchase a store product by its identifier via the current offering's
// matching package (falls back to a direct store-product purchase).
const startRevenueCatPurchase = async (iosProductId: string): Promise<void> => {
  const Purchases = await loadPurchases();
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings?.current?.availablePackages ?? [];
  const match = pkgs.find((p: any) => p?.product?.identifier === iosProductId);
  if (match) {
    await Purchases.purchasePackage({ aPackage: match });
    return;
  }
  // Fallback: fetch the store product directly and purchase it.
  const result = await Purchases.getProducts({ productIdentifiers: [iosProductId] });
  const product = (result?.products ?? result)?.[0];
  if (!product) {
    throw new Error("搵唔到對應產品，請確認 RevenueCat / App Store 設定。");
  }
  await Purchases.purchaseStoreProduct({ product });
};

/** Buy a PAYG credit pack. */
export const buyCreditPack = async (
  uid: string,
  packId: string
): Promise<void> => {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown credit pack");
  if (isNativeIOS()) return startRevenueCatPurchase(pack.iosProductId);
  return startStripeCheckout(uid, "credit", pack.id);
};

/** Subscribe to the monthly plan. */
export const subscribeMonthly = async (uid: string): Promise<void> => {
  if (isNativeIOS()) return startRevenueCatPurchase(MONTHLY_PLAN.iosProductId);
  return startStripeCheckout(uid, "subscription", MONTHLY_PLAN.id);
};

/** Open the Stripe customer portal (web) to manage/cancel a subscription. */
export const openBillingPortal = async (uid: string): Promise<void> => {
  if (isNativeIOS()) {
    // iOS subscriptions are managed in the App Store settings.
    window.open("https://apps.apple.com/account/subscriptions", "_blank");
    return;
  }
  const res = await fetch(`${API_BASE}/api/billing-portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, returnUrl: window.location.origin }),
  });
  if (!res.ok) throw new Error(`Portal failed: ${res.status}`);
  const { url } = await res.json();
  if (url) window.location.href = url;
};
