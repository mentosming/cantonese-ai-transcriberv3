import { auth, db } from "./firebase";
import { signInWithPopup, GoogleAuthProvider, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

export const ADMIN_EMAIL = "km520daisy@gmail.com";

// --- Admin Login (Google Sign-In) ---
export const loginAdminWithGoogle = async (): Promise<User> => {
  try {
    const provider = new GoogleAuthProvider();
    // Force account selection to prevent auto-login to wrong account
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Security Check: Whitelist
    if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      await signOut(auth); // Logout immediately if unauthorized
      throw new Error(`此 Google 帳號 (${user.email}) 沒有管理員權限。`);
    }

    return user;
  } catch (error: any) {
    console.error("Google Login error", error);
    
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error("登入已取消");
    }
    if (error.code === 'auth/popup-blocked') {
      throw new Error("彈出視窗被瀏覽器攔截，請允許彈出視窗後重試。");
    }
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error("Google 登入未啟用。請前往 Firebase Console > Authentication > Sign-in method 開啟 Google 提供者。");
    }
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error("網域未授權。請前往 Firebase Console > Authentication > Settings > Authorized domains 新增目前網址的網域。");
    }

    // Pass through our custom unauthorized error
    throw new Error(error.message || "登入失敗，請稍後再試。");
  }
};

export const logoutAdmin = async () => {
  await signOut(auth);
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const isAdminUser = (user: User | null): boolean => {
  return user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
};

// --- License Management (Firestore) ---

// 1. Generate & Save New License (Admin Only)
// Accepts duration string (days) or "lifetime"
export const createNewLicense = async (durationStr: string): Promise<{ key: string, expiresAtDisplay: string }> => {
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
     throw new Error("系統偵測不到登入狀態，請重新整理頁面並重新登入。");
  }

  if (!isAdminUser(currentUser)) {
    throw new Error(`無權限執行此操作。當前帳號 (${currentUser.email}) 非管理員。`);
  }

  // Generate a random readable key (e.g., PRO-ABCD-1234)
  const randomPart1 = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const randomPart2 = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const licenseKey = `PRO-${randomPart1}-${randomPart2}`;

  // Calculate Expiration
  let expiresAt: Timestamp | null = null;
  let expiresAtDisplay = "永久有效";

  if (durationStr !== 'lifetime') {
      const days = parseInt(durationStr);
      if (!isNaN(days) && days > 0) {
          const date = new Date();
          date.setDate(date.getDate() + days); // Add days to current time
          expiresAt = Timestamp.fromDate(date);
          expiresAtDisplay = date.toLocaleDateString();
      }
  }

  try {
    await setDoc(doc(db, "licenses", licenseKey), {
      createdAt: Timestamp.now(),
      createdBy: currentUser?.email,
      isActive: true,
      type: durationStr === 'lifetime' ? "lifetime" : "limited",
      durationDays: durationStr,
      expiresAt: expiresAt // Will be null for lifetime, or a Timestamp
    });
    
    return { key: licenseKey, expiresAtDisplay };
  } catch (error: any) {
    console.error("Error creating license:", error);
    
    if (error.code === 'permission-denied') {
      throw new Error("權限被拒 (Permission Denied)。請前往 Firebase Console > Firestore Database > Rules 設定寫入權限。");
    }
    
    if (error.code === 'not-found' || error.message.includes('project') || error.code === 'unavailable') {
      throw new Error("找不到指定的資料庫 (cantonese-aitranscriber)。請確認 Firebase Console 中的資料庫名稱是否完全一致。");
    }

    throw new Error(`寫入資料庫失敗 (${error.code}): ${error.message}`);
  }
};

// 2. Validate License (User)
// Checks if key exists, isActive is true, and NOT expired
export const validateLicenseKey = async (key: string): Promise<boolean> => {
  if (!key) return false;
  
  try {
    const docRef = doc(db, "licenses", key.trim());
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // 1. Check Active Status
      if (data.isActive !== true) return false;

      // 2. Check Expiration (if field exists)
      if (data.expiresAt) {
          const now = Timestamp.now();
          // Check if current time is AFTER expiration time
          if (now.toMillis() > data.expiresAt.toMillis()) {
              console.warn("License expired on:", data.expiresAt.toDate());
              return false;
          }
      }

      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("License validation error:", error);
    return false;
  }
};

// --- Local Storage Helpers (Cache valid key locally) ---
export const getStoredLicense = (): string | null => {
  return localStorage.getItem('cai_license_key');
};

export const saveLicense = (key: string) => {
  localStorage.setItem('cai_license_key', key);
};

export const clearLicense = () => {
  localStorage.removeItem('cai_license_key');
};