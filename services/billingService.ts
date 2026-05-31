import { auth, db } from "./firebase";
import {
  signInAnonymously,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import {
  UserProfile,
  EntitlementCheck,
  PlanId,
} from "../types";
import { FREE_STARTER_MINUTES, MONTHLY_PLAN } from "../constants";
import { ADMIN_EMAIL } from "./authService";

const USERS_COLLECTION = "users";

// Round seconds up to whole minutes for billing (a 31s clip costs 1 minute).
export const secondsToBillableMinutes = (seconds: number): number =>
  Math.max(1, Math.ceil(seconds / 60));

const defaultProfile = (user: User, starterMinutes = 0): UserProfile => ({
  uid: user.uid,
  email: user.email,
  plan: "free",
  creditMinutes: starterMinutes,
  subscriptionStatus: "none",
  subscriptionRenewsAt: null,
  platform: "web",
  stripeCustomerId: null,
  isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Ensures there is a signed-in identity (anonymous if needed) and a matching
 * Firestore user profile. Every visitor gets a uid so credits/subscriptions
 * follow them across sessions and can be merged on Google sign-in later.
 */
export const ensureUser = async (): Promise<UserProfile> => {
  let user = auth.currentUser;
  if (!user) {
    const cred = await signInAnonymously(auth);
    user = cred.user;
  }
  return loadOrCreateProfile(user);
};

export const loadOrCreateProfile = async (user: User): Promise<UserProfile> => {
  const ref = doc(db, USERS_COLLECTION, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as Partial<UserProfile>;
    // Keep admin flag and email fresh on each load.
    const isAdmin = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    return {
      ...defaultProfile(user),
      ...data,
      uid: user.uid,
      email: user.email ?? data.email ?? null,
      isAdmin,
    } as UserProfile;
  }

  // New signed-in (non-anonymous) accounts get the one-time starter credit.
  const starter = user.isAnonymous ? 0 : FREE_STARTER_MINUTES;
  const fresh = defaultProfile(user, starter);
  await setDoc(ref, fresh);
  return fresh;
};

/** Live updates to the profile (credits, subscription) without a refresh. */
export const subscribeToProfile = (
  uid: string,
  cb: (profile: UserProfile | null) => void
): (() => void) => {
  const ref = doc(db, USERS_COLLECTION, uid);
  return onSnapshot(ref, (snap) => {
    cb(snap.exists() ? ({ uid, ...(snap.data() as any) } as UserProfile) : null);
  });
};

export const onAuthChange = (cb: (user: User | null) => void) =>
  onAuthStateChanged(auth, cb);

/** Is the monthly subscription currently usable? */
const subscriptionActive = (p: UserProfile): boolean => {
  if (p.subscriptionStatus !== "active") return false;
  if (p.subscriptionRenewsAt && Date.now() > p.subscriptionRenewsAt) return false;
  return p.plan === "monthly";
};

/**
 * Decides whether a job of `requestedMinutes` may run. Login required: every
 * usable allowance (incl. the 5-min starter) lives in creditMinutes.
 * Order: admin → active monthly → credits.
 */
export const checkEntitlement = (
  profile: UserProfile | null,
  requestedMinutes: number
): EntitlementCheck => {
  if (!profile) {
    return { allowed: false, remainingMinutes: 0, reason: "subscription_inactive", message: "請先登入以使用功能。" };
  }

  if (profile.isAdmin) {
    return { allowed: true, remainingMinutes: Number.MAX_SAFE_INTEGER };
  }

  // Active monthly or any credits cover the request.
  if (profile.creditMinutes >= requestedMinutes) {
    return { allowed: true, remainingMinutes: profile.creditMinutes };
  }

  // Subscription active but period allowance exhausted.
  if (profile.plan === "monthly" && profile.subscriptionStatus === "active") {
    return {
      allowed: false,
      remainingMinutes: profile.creditMinutes,
      reason: "insufficient_credit",
      message: `本月可用分鐘已用完（餘 ${profile.creditMinutes} 分鐘，需 ${requestedMinutes} 分鐘）。將於續期日重置。`,
    };
  }

  // Not enough credit (incl. used-up 5-min starter).
  return {
    allowed: false,
    remainingMinutes: profile.creditMinutes,
    reason: "insufficient_credit",
    message: `額度不足（餘 ${profile.creditMinutes} 分鐘，需 ${requestedMinutes} 分鐘）。請購買分鐘數或訂閱月費。`,
  };
};

/**
 * Atomically deduct minutes after a successful job. Free-tier jobs (no credits,
 * no subscription) deduct nothing. Returns the new balance.
 */
export const deductMinutes = async (
  uid: string,
  minutes: number
): Promise<number> => {
  const ref = doc(db, USERS_COLLECTION, uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 0;
    const data = snap.data() as UserProfile;
    if (data.isAdmin) return data.creditMinutes ?? 0;

    const hasBalance = (data.creditMinutes ?? 0) > 0 || data.plan !== "free";
    if (!hasBalance) return data.creditMinutes ?? 0; // free tier, nothing to deduct

    const next = Math.max(0, (data.creditMinutes ?? 0) - minutes);
    tx.update(ref, { creditMinutes: next, updatedAt: Date.now() });
    return next;
  });
};

/** Convenience accessor used by the UI for badges/labels. */
export const planLabel = (plan: PlanId): string =>
  plan === "monthly" ? MONTHLY_PLAN.label : plan === "payg" ? "分鐘數" : "免費版";
