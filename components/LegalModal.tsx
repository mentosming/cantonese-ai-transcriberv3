import React, { useState } from 'react';
import { X } from 'lucide-react';

interface LegalModalProps {
  tab: 'privacy' | 'terms';
  onClose: () => void;
}

const UPDATED = '2026年5月30日';

const Privacy = () => (
  <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
    <p className="text-xs text-slate-400">最後更新：{UPDATED}</p>
    <p>Canto AI（「本服務」）重視你的私隱。本政策說明我們如何收集、使用及保護你的資料。</p>

    <Section title="1. 我們收集的資料">
      <ul className="list-disc pl-5 space-y-1">
        <li><b>帳戶資料：</b>當你以 Google 登入，我們會收到你的電郵地址及帳戶識別碼，用作建立帳戶與計算用量。</li>
        <li><b>媒體內容：</b>所有處理中的影片只會<b>暫時暫存於你的裝置本地</b>，影片本身不會上載至我們的伺服器。進行轉錄時，只會把抽取出的音訊傳送至第三方 AI 引擎，轉錄完成後不會長期保存。影片字幕燒錄（本地模式）完全在你的裝置上完成。</li>
        <li><b>轉錄結果：</b>為提供「轉換記錄」功能，你的轉錄文字會儲存在你的帳戶下，你可隨時刪除。</li>
        <li><b>付款資料：</b>付款由 Stripe（網頁）及 Apple（iOS）處理，我們不會儲存你的信用卡號碼。</li>
      </ul>
    </Section>

    <Section title="2. 資料如何使用">
      <p>資料僅用於提供及改善服務、計算用量額度、處理付款，以及在你授權下顯示你的歷史記錄。我們不會出售你的個人資料。</p>
    </Section>

    <Section title="3. 第三方處理">
      <p>轉錄依賴第三方 AI 語音引擎處理你上載的音訊。這些供應商按其自身條款處理資料；我們只傳送完成轉錄所需的內容。</p>
    </Section>

    <Section title="4. 資料保留與刪除">
      <p>你可在「轉換記錄」中刪除個別轉錄。如需刪除整個帳戶及相關資料，請電郵聯絡我們，我們會在合理時間內處理。</p>
    </Section>

    <Section title="5. 聯絡我們">
      <p>有關私隱的查詢，請電郵：<a href="mailto:km520daisy@gmail.com" className="text-teal-500 hover:underline">km520daisy@gmail.com</a></p>
    </Section>
  </div>
);

const Terms = () => (
  <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
    <p className="text-xs text-slate-400">最後更新：{UPDATED}</p>
    <p>歡迎使用 Canto AI。使用本服務即表示你同意以下條款。</p>

    <Section title="1. 服務內容">
      <p>本服務提供 AI 語音轉文字、字幕生成及影片工具。轉錄結果由 AI 自動生成，可能含有誤差，請自行核對重要內容。</p>
    </Section>

    <Section title="2. 帳戶與額度">
      <p>新用戶登入後可獲贈免費試用額度（以分鐘計，轉錄與工作室共用）。額度用盡後，可按用量購買額度或訂閱月費方案。</p>
    </Section>

    <Section title="3. 付款與退款">
      <ul className="list-disc pl-5 space-y-1">
        <li>按量額度為一次性購買；月費方案於每期自動續訂，你可隨時取消，於當期結束前仍可使用。</li>
        <li>由於屬數碼服務並即時提供，除適用法律另有規定外，已使用之額度恕不退款。</li>
      </ul>
    </Section>

    <Section title="4. 可接受使用">
      <p>你須擁有所上載內容的合法權利，不得用本服務處理違法、侵權或未經授權的內容。我們可暫停濫用服務的帳戶。</p>
    </Section>

    <Section title="5. 免責聲明">
      <p>本服務按「現狀」提供。對於因轉錄誤差或服務中斷而引致的任何損失，我們在適用法律允許的最大範圍內不承擔責任。</p>
    </Section>

    <Section title="6. 聯絡我們">
      <p>查詢請電郵：<a href="mailto:km520daisy@gmail.com" className="text-teal-500 hover:underline">km520daisy@gmail.com</a></p>
    </Section>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{title}</h3>
    {children}
  </div>
);

const LegalModal: React.FC<LegalModalProps> = ({ tab, onClose }) => {
  const [active, setActive] = useState<'privacy' | 'terms'>(tab);
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-sm">
            <button onClick={() => setActive('privacy')}
              className={`px-3 py-1 rounded-md transition-colors ${active === 'privacy' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>私隱政策</button>
            <button onClick={() => setActive('terms')}
              className={`px-3 py-1 rounded-md transition-colors ${active === 'terms' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>服務條款</button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{active === 'privacy' ? <Privacy /> : <Terms />}</div>
      </div>
    </div>
  );
};

export default LegalModal;
