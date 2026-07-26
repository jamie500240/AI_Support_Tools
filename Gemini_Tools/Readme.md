# Gemini_Tools 使用方法

## 功能
擴充 Gemini 功能，提供輕量化且低權限需求的個人化工具。

> 雖然已有較完整的擴充工具，如 Gemini Voyager、Superpower for Gemini，
> 但考量萬用型擴充工具通常需要較高權限，因此開發此陽春版本，
> 以書籤小工具方式提供所需功能。

## 使用方式

### 1. 建立新的瀏覽器書籤（空白書籤）。
### 2. 將需要的 JavaScript 程式碼貼入書籤網址欄。
### 3. 使用 Gemini 時，點擊對應書籤即可執行功能（側邊欄｜下載）。

> **注意：**
> - 側邊欄跟可匯出頁面**無法永久同步**最新狀態。
> - 當頁面跳轉、重新整理或需要重新定位時，需要**重新點擊**書籤初始化。
> - 要匯出的資訊時，需要**手動捲動整個對話**，比較能完整匯出。
> - 閱讀匯出的 MD 檔案，可使用 Visual Studio Code（Shift + Ctrl + V 預覽）或其他 Markdown 編輯器。

## 目前功能

| 名稱 | 功能 | 目前可用|限制|推薦|
|---|---|--|--|--|
|Gemini_Sidebar| 在 Gemini 建立類似 GPT 側邊欄的對話導航工具，用於管理與定位長對話|Gemini|其他AI失敗率高|
|UserSpeak_Sidebar|抓出使用者的對話框|Claude、Grok|受到底層代碼的影響，是抓 USER 的特徵，有一定的不穩定性|
|H1-H3_Sidebar|抓出 H1-H3 對話框，並顯示預覽文字|只要是只用 H1-H3 的頁面都能用（適用 AI: Claude、Grok、Gemini、Copilot、Perplexity）|要有寫 H1-H3 標題的頁面才有用|
|Title_Sidebar|抓出 H1-H4 對話框與粗體標題，並顯示預覽文字|只要是只用 H1-H4 和粗體字的頁面都能用（適用 AI: Claude、GPT、Gemini、Grok、Copilot、Perplexity）|純圖片或是純文字，連粗體都沒有的網頁無法使用|★
|Gemini_MdDownloader|將 Gemini 對話匯出為 Markdown 檔案，包含圖片與程式碼格式|只針對 Gemini 研發| 下載圖片時，有一定機率無法載入|
|AI_MdDownloader|匯出 AI 的對話為 Markdown 檔案，包含圖片與程式碼格式|Claude、GPT、Gemini、Grok、Copilot、Perplexity|必須自己捲動頁面，捲動多少頁面，就能下載多少資料|★

## 推薦使用
如果只想安裝兩個功能：
### 1. Title_Sidebar ★
適合閱讀長篇 AI 回答，快速跳轉章節。
### 2. AI_MdDownloader ★
適合保存 AI 對話，建立自己的 Markdown 知識庫。


## 已知限制

### 資料夾整理功能

受限於瀏覽器安全機制，JavaScript 無法直接存取使用者本機檔案系統。

基於權限最小化與資料控制考量，不使用額外 API 或第三方工具協助，因此暫不規劃此功能。
