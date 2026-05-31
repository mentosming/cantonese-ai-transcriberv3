# iOS IAP 上架 Checklist（App Store Connect + RevenueCat）

目標：iOS 用 Apple IAP 賣額度／月費 → RevenueCat webhook → 你個 Express server
`/api/revenuecat-webhook` → 寫 Firestore `users/{uid}` → web（Stripe）同 iOS 共用同一份額度。

> 對應分鐘數已喺 `server/billing.js` 寫死，product id 必須完全一致。

| 方案 | Apple product id | 類型 | 分鐘 |
|---|---|---|---|
| 細包 | `cai.credits.60` | Consumable | 60 |
| 中包 | `cai.credits.180` | Consumable | 180 |
| 大包 | `cai.credits.600` | Consumable | 600 |
| 月費 | `cai.sub.monthly` | Auto-Renewable Subscription | 1200 |

---

## A. App Store Connect
1. **App 建立**：My Apps → ＋ → 新 App，bundle id `com.cantoai.app`。
2. **稅務／銀行**：Agreements, Tax, and Banking → 簽 *Paid Applications* 合約（未簽 IAP 唔會出現）。
3. **建 IAP**：App → Monetization → In-App Purchases
   - 3 個 **Consumable**：product id = `cai.credits.60` / `180` / `600`，各設名稱、價格。
   - Subscriptions → 建一個 **Subscription Group**（例：`Canto AI Pro`）→ 入面建 **Auto-Renewable** `cai.sub.monthly`，設價格／週期（1 個月）。
4. 每個 IAP 填好：顯示名稱、描述、截圖（subscription 要一張 review 截圖），狀態揀 *Ready to Submit*。
5. **Sandbox 測試帳戶**：Users and Access → Sandbox → 開一個測試 Apple ID。

## B. RevenueCat
1. **Project → Apps**：加 iOS app，填 bundle id；上傳 **App Store Connect API Key**（In-App Purchase key，.p8）。
2. **Products**：Import / 手動加上面 4 個 product id（同 App Store Connect 完全一致）。
3. **Entitlement**：建一個 entitlement（例 `pro`）；把 4 個 product 都 attach（或最少月費 attach `pro`）。
4. **Offerings**：建一個 `default` offering，加 4 個 **Packages**（custom package id 隨意，例 `credits60`/`credits180`/`credits600`/`monthly`），每個指向對應 product。
   - native app 直接讀 `offerings().current.availablePackages`，所以毋須改 code。
5. **API Keys**：Project → API Keys → 抄 **Public SDK Key（Apple）** → 填入 `CantoAI/App/Config.swift` 的 `revenueCatAPIKey`。
6. **Webhook**：Project → Integrations → Webhooks
   - URL：`https://<你server網址>/api/revenuecat-webhook`
   - Authorization header：`Bearer <你嘅 REVENUECAT_WEBHOOK_SECRET>`
   - Events：至少 `INITIAL_PURCHASE`, `RENEWAL`, `NON_RENEWING_PURCHASE`, `CANCELLATION`, `EXPIRATION`。

## C. Server（Express）
1. 環境變數設 `REVENUECAT_WEBHOOK_SECRET`（同 RevenueCat webhook header 一致）。
2. 確認 `FIREBASE_SERVICE_ACCOUNT` / `FIRESTORE_DB_ID=cantonese-aitranscriber` 已設，server 寫到 Firestore。
3. 部署後用 RevenueCat 的 *Send test event* 試 webhook → 應該 200，Firestore `users/{uid}` 嘅 `creditMinutes` 有變。

## D. Xcode app
1. `Config.swift`：`revenueCatAPIKey`、`apiBase`（你部署嘅 server）。
2. `appUserID = Firebase uid` 已喺 `BillingService.configure(uid:)` 設好——購買會 attach 到正確用戶。
3. Signing：揀 Team，確認 *In-App Purchase* + *Sign In with Apple* capability（entitlement 已含）。

## E. 測試流程（Sandbox）
1. 真機登出 App Store 的正式帳戶（設定 → App Store → Sandbox Account 用測試 ID）。
2. App 內登入（Apple/Google）→ 開付費牆 → 買細包。
3. 預期：購買成功 → app 顯示「處理緊購買、入賬中…」（輪詢中）→ 幾秒後 webhook 入賬 → 額度 +60。
4. 喺 web 用**同一個帳戶**登入（記得 Apple⇄Google 已連結）→ 應該見到同一份額度。

## 常見坑
- **額度唔通**：多數係 web / iOS 唔同 Firebase uid。叫用戶喺「帳戶 / 連結登入」連結另一個 provider（已內置）。
- **webhook 401**：header secret 唔對。
- **offerings 空**：RevenueCat offering 未設 current，或 product 未 *Ready to Submit* / 合約未簽。
- **Apple 拒審**：iOS app 內**唔可以**出現 Stripe / 外部購買連結賣數碼額度；只可用 IAP（web 先用 Stripe）。
