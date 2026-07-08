# 台灣即時路況導航模擬器 (Taiwan Simulated Navigation)

本專案是一個基於 React 19 + Vite 6 + TypeScript + Leaflet.js 的台灣即時路況與導航模擬系統，包含都會核心環線（交通部周邊環線）的行車模擬、語音路況警示，並規劃與 Firebase 和 Supabase 進行後端整合。

---

## 🚀 本地開發 (Run Locally)

### 前置準備
- 必須安裝 **Node.js** (建議 v18 以上版本)

### 執行步驟
1. **安裝依賴套件**：
   ```bash
   npm install
   ```

2. **設定環境變數**：
   - 複製 `.env.example` 並命名為 `.env`：
     ```bash
     cp .env.example .env
     ```
   - 在 `.env` 中設定您的憑證（如交通部 TDX API Key、Supabase 設定與 Firebase 連線資料）。

3. **啟動開發伺服器**：
   ```bash
   npm run dev
   ```
   - 啟動後，在瀏覽器打開網址：`http://localhost:3000`

---

## 📦 部署至 Firebase Hosting (Deploy to Firebase)

本專案已完成 Firebase Hosting 的靜態網站託管初始化設定。

### 前置準備
- 請確保已全域安裝 Firebase CLI 工具並登入您的 Firebase 帳號：
  ```bash
  npm install -g firebase-tools
  firebase login
  ```

### 部署步驟
1. **編譯專案**：
   執行以下命令，將 React 原始碼打包編譯成靜態網頁檔案（輸出至 `dist/` 目錄）：
   ```bash
   npm run build
   ```

2. **發佈部署**：
   將 `dist/` 資料夾的內容部署至 Firebase 託管伺服器：
   ```bash
   firebase deploy
   ```
   - 部署成功後，Firebase 會提供一組 `https://motc-4ebdb.web.app` 或類似的公開網址，點擊即可瀏覽您的模擬器。

---

## 📂 專案架構與開發規劃

關於本專案的架構分析、Supabase (pgvector) 的串接規格、環境變數規劃與資料庫 Schema 設計，請參考：
- 📄 **[專案架構規劃說明書 (docs.md)](./TMP/docs.md)**
