# 收費系統設定 (Firebase + Stripe + RevenueCat)

兩種收費模式：
- **PAYG（按用量）**：購買分鐘數 credit（`creditMinutes`），永久有效。
- **月費**：每期重置額度（預設 1200 分鐘）。

平台分流（**App Store 合規關鍵**）：
- **Web** → Stripe Checkout
- **iOS App** → Apple IAP（經 RevenueCat）。Apple 禁止 app 內用 Stripe 賣數碼商品，否則會被拒。

```
使用者 ──┬─ Web  → Stripe Checkout ─→ Stripe Webhook ─┐
         └─ iOS  → Apple IAP (RevenueCat) ─→ RC Webhook ┴─→ Firestore users/{uid}
                                                              { plan, creditMinutes, subscriptionStatus, ... }
```

轉錄前 `checkEntitlement()` 檢查額度；成功後 `deductMinutes()` 扣減。Webhook（server 端，用 Firebase Admin）負責增值，前端唔可以信。

---

## 1. 資料模型 `users/{uid}`

| 欄位 | 說明 |
|---|---|
| `plan` | `free` / `payg` / `monthly` |
| `creditMinutes` | 餘額（分鐘） |
| `subscriptionStatus` | `none`/`active`/`past_due`/`canceled`/`expired` |
| `subscriptionRenewsAt` | ms epoch，月費續期日 |
| `stripeCustomerId` | Stripe 客戶 ID |
| `isAdmin` | admin email 自動 = true，無限額度 |

每位訪客以 **Firebase 匿名登入** 取得 uid，purchase 後額度跟住 uid。

### Firestore 安全規則（重點）
```
match /users/{uid} {
  allow read: if request.auth.uid == uid;
  // 客戶端只可改非計費欄位；creditMinutes / subscription 只准 Admin SDK（webhook）寫。
  allow write: if request.auth.uid == uid
    && !request.resource.data.diff(resource.data).affectedKeys()
        .hasAny(['creditMinutes','plan','subscriptionStatus','subscriptionRenewsAt','isAdmin']);
}
```

---

## 2. 安裝 server 依賴
```bash
cd server && npm install   # 已加入 stripe + firebase-admin
```

## 3. Stripe（Web）

1. Stripe Dashboard → 建立 3 個一次性產品（60/180/600 分鐘）+ 1 個 recurring 月費產品，記低各自 **Price ID**。
2. Webhook endpoint：`https://<your-server>/api/stripe-webhook`，訂閱事件：
   `checkout.session.completed`、`invoice.paid`、`customer.subscription.updated`、`customer.subscription.deleted`。
3. `server/.env`：
```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PACK_60=price_xxx
STRIPE_PRICE_PACK_180=price_xxx
STRIPE_PRICE_PACK_600=price_xxx
STRIPE_PRICE_MONTHLY=price_xxx
FIREBASE_SERVICE_ACCOUNT={...service account JSON 一行...}
FIRESTORE_DB_ID=cantonese-aitranscriber
```
4. 前端 `.env`：`VITE_API_BASE=https://<your-server>`

## 4. RevenueCat（iOS）

### 已經由 API 自動建立 ✅（Project: `KMAIproject` / `proje345e30b`）
- **App**：Test Store（`app3d7e081ed1`）—— 可即時喺 dev/TestFlight 測試購買，唔使 App Store Connect。
- **Products**（store id 對齊 `constants.ts`）：
  - `cai.sub.monthly`（subscription, P1M）`prod941676fe1a`
  - `cai.credits.60`（consumable）`prod5642a1dd86`
  - `cai.credits.180`（consumable）`prodec855679d1`
  - `cai.credits.600`（consumable）`prodd33449c0e8`
- **Entitlement**：`KMAIproject Pro`（`entl59081c6b16`）← 已 attach `cai.sub.monthly`
- **Offering**：`default` → packages `cai_monthly` / `cai_credits_60` / `_180` / `_600`（各 attach 對應 product）
- **App SDK key**：Test Store public key 已寫入 `constants.ts` → `REVENUECAT_IOS_SDK_KEY`
- **App 程式碼**：`App.tsx` 啟動時 `configureRevenueCat(uid)`（= `Purchases.configure` + `logIn(uid)`）；`checkoutService.ts` iOS 用 `getOfferings()`→`purchasePackage()`。
- **package.json** 已加 `@revenuecat/purchases-capacitor`；Vite 已 externalize（web build 唔受影響）。

### 仲要你做（需要外部操作）
1. **Capacitor 安裝 plugin + sync**：
   ```bash
   npm install
   npx cap sync ios
   ```
2. **Webhook**：RevenueCat → Integrations → Webhooks → URL `https://<你server>/api/revenuecat-webhook`，
   Authorization header = `Bearer rcwh_2103c15f0ea45c22dd44354d4dee5e07`（已寫入 `server/.env` 的 `REVENUECAT_WEBHOOK_SECRET`）。需要 server 已部署（localhost RevenueCat 連唔到）。
3. **上線（真 App Store）**：喺 App Store Connect 建 IAP（同名 product id）+ 簽 Paid Apps 協議；喺 RevenueCat 新增 App Store app（bundle `mentosming.cantonese.ai`）連 App Store Connect；將 `REVENUECAT_IOS_SDK_KEY` 換成 production `appl_…` key。
4. **Rotate keys**：`sk_OAPdq…`（v2 secret，已用完）同 `test_lDXPy…`（曾貼喺對話）建議重新生成。

---

## 5. 定價建議（已套用，附成本參考）

| 方案 | 售價 | COGS (Gemini 3.5 Flash) | 毛利 |
|---|---|---|---|
| 60 分鐘 | HK$30 | ~US$0.4 | ~89% |
| 180 分鐘 | HK$78 | ~US$1.2 | ~88% |
| 600 分鐘 | HK$228 | ~US$4 | ~87% |
| 月費 1200 分鐘 | HK$88 | ~US$6–9 | ⚠️ 薄 |

**注意**：月費若容許 Gemini 3.1 Pro，COGS 翻倍可能蝕本。建議月費鎖定 Flash，Pro 只開放 PAYG，或將月費額度降至 600–800 分鐘。
