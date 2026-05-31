# Next.js → SwiftUI App Development Playbook

> Based on the WontonWorld (雲吞看世界) project — a bilingual toddler learning app built from scratch using this workflow.
> Use this as a reference for any project that follows the same pattern: content-heavy, multilingual, audio/image-rich iOS app.

---

## Overview

The core idea is to **separate concerns by tool**:

| Role | Tool | Responsibility |
|------|------|---------------|
| Content strategist | Gemini | Generate JSON data, image prompts, copy |
| UI/UX prototyping | Next.js + Tailwind | Fast visual iteration, stakeholder preview |
| Audio production | Azure Neural TTS (Node scripts) | Batch generate all audio variants |
| Image production | Google Imagen + Sharp | AI illustrations + text-overlay images |
| Final app | SwiftUI | Render content, play audio, handle IAP |
| Deployment preview | Vercel | Shareable URL for review |

This workflow means **Swift engineers only write rendering code** — no content logic, no hardcoded strings.

---

## Phase 1: Content Architecture

### 1.1 Define the JSON Schema First
Before writing any code, lock down the item schema. Changing it later requires migration scripts on both Next.js and Swift sides.

Recommended schema:
```json
{
  "id": "itemId",
  "name_zh": "繁體中文",
  "name_en": "English Name",
  "emoji": "🐼",
  "desc_zh": "廣東話描述句子",
  "desc_en": "English description sentence",
  "image_prompt": "Imagen prompt for illustration",
  "audio_files": {
    "zh_hk":       "levelX/itemId_zh.m4a",
    "zh_hk_f":     "levelX/itemId_zh_f.m4a",
    "zh_hk_m":     "levelX/itemId_zh_m.m4a",
    "en_us":       "levelX/itemId_en_us.m4a",
    "en_us_f":     "levelX/itemId_en_us_f.m4a",
    "en_us_m":     "levelX/itemId_en_us_m.m4a",
    "en_uk":       "levelX/itemId_en_uk.m4a",
    "en_uk_f":     "levelX/itemId_en_uk_f.m4a",
    "en_uk_m":     "levelX/itemId_en_uk_m.m4a",
    "desc_zh_hk_f":"levelX/l1_itemId_desc_zh_f.m4a",
    "desc_zh_hk_m":"levelX/l1_itemId_desc_zh_m.m4a",
    "desc_en_us_f":"levelX/l1_itemId_desc_en_us_f.m4a",
    "desc_en_us_m":"levelX/l1_itemId_desc_en_us_m.m4a",
    "desc_en_uk_f":"levelX/l1_itemId_desc_en_uk_f.m4a",
    "desc_en_uk_m":"levelX/l1_itemId_desc_en_uk_m.m4a"
  },
  "imagePath": "/images/categoryName/itemId.png"
}
```

**Key decisions to make upfront:**
- How many voice variants? (child / adult female / adult male × languages)
- Do you need description sentences? (separate audio track)
- What image size/format? (recommend 400×400 PNG for cards)

### 1.2 Use Gemini for Content Generation
Prompt Gemini to produce batches of JSON items. Give it the schema and ask for N items per category.

Gemini's strengths: vocabulary selection, descriptions, image prompts, translation.
Gemini's weakness: **cannot render Chinese characters in images** — use Sharp + SVG for that (see Phase 3).

---

## Phase 2: Audio Production

### 2.1 Azure Neural TTS Setup
```bash
npm install microsoft-cognitiveservices-speech-sdk dotenv
```

`.env`:
```
AZURE_SPEECH_KEY=your_key
AZURE_SPEECH_REGION=eastasia
```

### 2.2 Generate ALL variants in one pass
**Critical lesson**: Generate all voice variants (child, female, male × all languages) in the same script run. Going back to add variants later is painful.

Standard voice map for a bilingual HK app:
```js
const VOICES = [
  { key: "zh_hk",   voice: "zh-HK-HiuMaanNeural",  lang: "zh-HK", isChild: true  },
  { key: "zh_hk_f", voice: "zh-HK-HiuGaaiNeural",  lang: "zh-HK", isChild: false },
  { key: "zh_hk_m", voice: "zh-HK-WanLungNeural",   lang: "zh-HK", isChild: false },
  { key: "en_us",   voice: "en-US-AnaNeural",        lang: "en-US", isChild: true  },
  { key: "en_us_f", voice: "en-US-AriaNeural",       lang: "en-US", isChild: false },
  { key: "en_us_m", voice: "en-US-GuyNeural",        lang: "en-US", isChild: false },
  { key: "en_uk",   voice: "en-GB-MaisieNeural",     lang: "en-GB", isChild: true  },
  { key: "en_uk_f", voice: "en-GB-SoniaNeural",      lang: "en-GB", isChild: false },
  { key: "en_uk_m", voice: "en-GB-RyanNeural",       lang: "en-GB", isChild: false },
];
```

SSML prosody: child voice `pitch="+15%" rate="-10%"`, adult `rate="-5%"`.

### 2.3 Script Best Practices
```js
// Always skip existing files — enables safe re-runs
if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) { skip++; continue; }

// Use 300ms delay to avoid Azure rate limiting
await sleep(300);

// After run, check for 0-byte files (failed silently)
find public/audio -name "*.m4a" -size 0 -delete
// Then re-run the script — it will only regenerate missing files
```

**Never pipe to `| head` or `| tail`** when running generation scripts — it terminates the process early.

### 2.4 Phonetic Substitutions for Local Pronunciation
For place names or words with non-standard pronunciation, use a substitution map:
```js
const PRONUNCIATION = {
  "Tsim Sha Tsui": "Jim Shah Tsoy",
  "Mong Kok":      "Mong Gok",
  "Causeway Bay":  "Caw-zee Bay",
  // ...
};
const ttsText = PRONUNCIATION[item.name_en] || item.name_en;
```

### 2.5 Copy to Xcode
```bash
cp public/audio/zh_hk/levelX/*.m4a /path/to/Xcode/zh_hk/levelX/
cp public/audio/en_us/levelX/*.m4a /path/to/Xcode/en_us/levelX/
cp public/audio/en_uk/levelX/*.m4a /path/to/Xcode/en_uk/levelX/
```

Xcode audio folder structure:
```
WontonWorld/
  zh_hk/
    level1/   ← newer items with level prefix
    itemId_zh.m4a  ← older items at root
  en_us/
  en_uk/
```

---

## Phase 3: Image Production

### 3.1 Illustrations — Imagen + Background Removal
Use Google Imagen for character/object illustrations. Recommended style prompt suffix:
```
2D vector illustration, bold black outlines, flat solid colors,
simple toddler educational book clipart style,
isolated on pure white background
```

Remove background with `remove.bg` API or local Sharp-based tool.
Add to `Assets.xcassets/{itemId}.imageset/` with a `Contents.json`.

### 3.2 Text-overlay Images — Sharp + SVG (NOT Imagen)
When images need to display text (especially Chinese), use Sharp + SVG locally. Imagen and other AI models cannot reliably render CJK characters.

```js
import sharp from "sharp";

function buildSVG(nameCh, nameEn, bgColor) {
  const luminance = getLuminance(bgColor);
  const textColor = luminance > 0.65 ? "#1a1a1a" : "#ffffff";
  const borderColor = luminance > 0.65 ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.5)";

  return `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="400" fill="${bgColor}" rx="32"/>
    <rect x="16" y="16" width="368" height="368"
          fill="none" stroke="${borderColor}" stroke-width="3" rx="20"/>
    <text x="200" y="182" font-family="'PingFang HK', sans-serif"
          font-size="96" font-weight="900" fill="${textColor}"
          text-anchor="middle">${nameCh}</text>
    <text x="200" y="258" font-family="'Helvetica Neue', sans-serif"
          font-size="30" font-weight="700" fill="${textColor}"
          text-anchor="middle">${nameEn}</text>
  </svg>`;
}

await sharp(Buffer.from(buildSVG(nameCh, nameEn, color))).png().toFile(outPath);
```

Use `luminance` check so dark backgrounds get white text and light backgrounds get dark text.

---

## Phase 4: Next.js Prototype

### 4.1 Structure
```
src/app/
  page.tsx              ← home / level selector
  level/[levelId]/      ← category grid
  category/[categoryId]/← learning cards
  settings/             ← settings panel
public/
  data/                 ← JSON files
  audio/                ← generated .m4a files
  images/               ← generated PNG files
```

### 4.2 Use Next.js for UX Validation
Validate these before moving to Swift:
- Card grid layout (2×2, 2×3, etc.)
- Touch target size (use browser devtools mobile mode)
- Animation feel (bounce on tap)
- Audio debounce behaviour
- Settings panel flow

### 4.3 Toddler UX Rules (Non-negotiable)
- **Massive hit boxes** — 2×2 or 2×3 grid, cards fill full screen
- **Bounce animation on tap** — scale down on press, spring up on release (pure CSS)
- **500ms debounce per card** — prevent audio spam from repeated taps
- **No scroll** — all content visible without scrolling
- **Parental gate** — long-press 3s for settings/back button
- **Bilingual display** — Chinese (large) + English (smaller) on every card

---

## Phase 5: SwiftUI Port

### 5.1 Audio Manager Pattern
```swift
class AudioManager {
    static let shared = AudioManager()

    func audioFilename(for files: AudioFiles, language: VoiceLanguage, gender: VoiceGender) -> String? {
        switch (language, gender) {
        case (.zhHK, .child):  return files.zh_hk
        case (.zhHK, .female): return files.zh_hk_f ?? files.zh_hk
        // ...
        }
    }

    func play(filename: String?, debounceKey: String, soundEnabled: Bool) {
        // Determine lang folder from filename pattern
        // Try Bundle.main.url(forResource:withExtension:subdirectory:) first
        // Fall back to bundle root
    }
}
```

### 5.2 JSON → Swift Model
Make `phonetic_*` and all `audio_files` optional so missing fields don't crash:
```swift
struct Item: Identifiable, Codable {
    let id: String
    let name_zh: String
    let name_en: String
    let audio_files: AudioFiles
    let phonetic_ipa_us: String?
    let phonetic_ipa_uk: String?
    let phonetic_simple: String?
    let phonetic_syllable: String?
}

struct AudioFiles: Codable {
    let zh_hk: String
    let zh_hk_f: String?
    let zh_hk_m: String?
    // ...
}
```

### 5.3 Content Loading
Load JSON at app launch into global constants (`allLevels`, `allCategories`).
Each `Category` references a `jsonFile` name — load items lazily when category is opened.

### 5.4 ScreenTime / Parental Gate
- `ScreenTimeManager` with `@MainActor`, call `pause()` before `start()` to reset properly
- Back button: small, low-contrast, long-press 3s to activate
- Settings gear: long-press 3s to open

---

## Phase 6: IAP + Freemium

### 6.1 StoreKit 2 Pattern
- Free tier: first 1-2 levels
- Pro tier: all remaining levels
- Products: monthly + yearly (with free trial on yearly)
- No user login required — use `Transaction.currentEntitlements`

### 6.2 App Store Connect Setup
- Create products before first submission
- Set age rating 4+ for toddler apps
- Privacy policy URL required (host on landing page)
- Support URL = landing page domain

---

## Phase 7: Deployment

### Landing Page
- Deploy on Vercel from GitHub
- **Do not include `Co-Authored-By: Claude` in commits** — Vercel blocks deployments with AI attribution lines
- DNS: Hostinger A record `@ → 216.198.79.1`, CNAME `www → cname.vercel-dns.com`

### wonton-api / Backend
- Minimal API for TTS proxy and pronunciation scoring
- Deploy on Vercel (separate repo)
- Azure Speech key stays server-side only

---

## Checklist for a New Project

### Content
- [ ] JSON schema locked (all fields defined upfront)
- [ ] Gemini generates all items with consistent structure
- [ ] Image prompts included in every JSON item

### Audio
- [ ] All 9 voice variants generated per item (3 languages × 3 genders)
- [ ] Description audio generated (if feature needed)
- [ ] 0-byte files checked and re-generated
- [ ] Files copied to Xcode bundle

### Images
- [ ] Illustrations generated + background removed
- [ ] Text overlay images use Sharp + SVG (not AI)
- [ ] xcassets imagesets created with correct Contents.json

### Next.js
- [ ] Card layout validated on mobile viewport
- [ ] Audio debounce working
- [ ] Settings panel functional
- [ ] Deployed to Vercel for stakeholder review

### SwiftUI
- [ ] JSON decodes cleanly with optional fields
- [ ] AudioManager resolves paths correctly
- [ ] All 9 voice variants selectable in settings
- [ ] ScreenTime / parental gate implemented
- [ ] IAP paywall on premium levels
- [ ] Build passes on device (not just simulator)

---

## File Naming Conventions

| Asset | Pattern | Example |
|-------|---------|---------|
| Item audio (child) | `{id}_{lang}.m4a` | `dog_zh.m4a` |
| Item audio (gendered) | `{id}_{lang}_{g}.m4a` | `dog_zh_f.m4a` |
| Description audio | `{prefix}_{id}_desc_{lang}_{g}.m4a` | `l1_dog_desc_zh_f.m4a` |
| Item image | `{id}.png` | `dog.png` |
| Level prefix | `l1_`, `l2_`, `l3_`, `l4_`, `l5_`, `l6_` | |
| UI icons | `ui_{name}-icon.png` | `ui_timer-icon.png` |

---

*This playbook was built from the WontonWorld project (2026). Feel free to adapt the schema and scripts for your own content domain.*
