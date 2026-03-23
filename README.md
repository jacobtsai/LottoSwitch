# LottoSwitch (彩票變盤試算系統)

這是一個純前端的 **Vue 3 單頁應用程式 (SPA)**，專為彩票與賠率盤口設計的「單一錨點連動變盤引擎 (Master-Slave Reactivity Engine)」。

系統不依賴任何後端伺服器，直接透過腳本將 Google Sheets 的大表轉換為本地靜態 JSON 資料庫，確保系統具備極佳的運行速度與離線可用性。

---

## ✨ 核心特色 (Features)

- **單一錨點連動架構**：盤手只需修改「成本 A 盤」的退水或賠率，系統將即刻反推出對應的利潤差額 (Delta)，並全自動同步計算「成本 B 盤」與「現金 A/B 盤」的新賠率與退水，達到所有盤口利潤鎖死的精準風控。
- **支援多層級複合玩法**：內建對於「主獎 / 副獎」機制（例如三中二）的期望值數學疊加計算，支援理論成本的多維度解析。
- **微調溢價彈性**：雖然各盤口採自動連動，但每種玩法與每個盤口依然保留了「利潤疊加（自訂溢價）」的獨立輸入框，可進行個別抽水策略微調。
- **質感的數據介面**：全站無使用 Tailwind，純手工撰寫高質感的 Vanilla CSS，結合 Glassmorphism（毛玻璃）、深色科技背景與專屬數字字體對齊，提供專業且俐落的操盤體驗。

---

## 🚀 系統安裝與啟動

請確認您的電腦已安裝 [Node.js](https://nodejs.org/) (建議 v18 以上)。

### 1. 安裝依賴套件
進到專案目錄後，安裝所需的 Node 套件：
```bash
npm install
```

### 2. 啟動開發伺服器
啟動 Vite 伺服器，直接在本地端檢視介面：
```bash
npm run dev
```
執行後，打開瀏覽器並前往終端機提示的網址（通常為 `http://localhost:5173`) 即可開始使用系統。

---

## 🗄️ 更換 / 更新盤口資料 (Data Sync)

系統初始上線時，已打包了包含「六合彩、大樂透、539、天天樂」共五千多筆原始參數的 JSON 資料檔 (`src/assets/data.json`)。

如果您在原始的 **Google Sheets** 上面進行了大規模的數值調整（例如異動各玩法的基礎利潤值、總次數等），請透過以下專屬爬蟲腳本「一鍵更新」本地資料庫：

```bash
# 此指令會自動去 Google Sheets 完整抓取四個遊戲的 CSV 並轉檔打包
node scripts/fetch-data.js
```

執行成功後，您會在終端機看見 `✅ Generated src/assets/data.json`，接著只要重整網頁，最新數據即會全面套用。

---

## 🏗 技術堆疊 (Tech Stack)

* **核心框架**: Vue 3 (Composition API)
* **打包與開發環境**: Vite
* **資料解析**: PapaParse (CSV to JSON Converter)
* **樣式**: Vanilla CSS (CSS Grid, Flexbox, Glassmorphism, CSS Variables)
