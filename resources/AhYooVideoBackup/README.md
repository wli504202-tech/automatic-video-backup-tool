# 阿柚自動影片備份 v1.0 — 系統全貌與操作手冊

本專案包含兩個核心模組：

1. **控制中心（Web Console）**：基於 Next.js 16 打造的網頁控制台與 API 伺服器，同時作為完整原始碼的交付入口。

2. **安裝版客戶端（Desktop App + Browser Extension）**：實際運行於 Windows 64-bit 系統的影片備份主程式。

---

## 0. 系統需求（Windows 64-bit / x64）

| 項目 | 需求 |
| ----- | ----- |
| 作業系統 | **Windows 10 / 11 64-bit（x64）** |
| 產出位元 | `AhYooVideoBackup.exe`、`AhYooNativeHost.exe` 均為 **64-bit (PE Machine = 0x8664)** |
| 打包用 Python | **64-bit Python 3.10+**（下載檔名須含 `amd64`） |
| 瀏覽器 | Chrome / Edge 114+（64-bit） |
| 不支援 | 32-bit Windows（x86）。批次檔偵測到 32-bit 會自動中止 |

---

## 1. 懶人快速安裝流程（請依檔名步驟執行）

解壓縮 ZIP 後，直接在資料夾內依序雙擊執行以下檔名：

### 步驟 1：`打包.exe 步驟1.bat`
* 檢查系統與 Python 是否為 64-bit。
* 自動打包產出 `dist/AhYooVideoBackup.exe` 與 `dist/AhYooNativeHost.exe`。

### 步驟 2：`install 步驟2.bat`
* 自動建立 `%LOCALAPPDATA%` 軟體安裝目錄與資料夾結構。
* 安裝核心依賴、建立捷徑、設定開機常駐，並註冊 Chrome / Edge Native Messaging Host。

### 步驟 3：`下載影片一定要先下載我 步驟3.bat`
* **（注意：請務必在步驟 2 之後執行，否則路徑尚未建立會出錯）**
* 自動從官方下載免安裝版 `ffmpeg.exe` 並直接注入到安裝目錄中，確保高畫質影片與音訊轉檔完全正常。

### 步驟 4：載入瀏覽器擴充功能
1. 開啟 Chrome / Edge 的 `chrome://extensions` 或 `edge://extensions`
2. 開啟右上角 **「開發人員模式」**
3. 點選 **「載入未封裝項目」**，選擇資料夾中的 **`extension/`**
4. 將獲得的 **Extension ID** 貼回步驟 2 的提示視窗中完成綁定

---

## 2. 核心檔案說明

| 檔名 | 用途 |
| --- | --- |
| `打包.exe 步驟1.bat` | 部署與打包主程式（產生 64-bit EXE） |
| `install 步驟2.bat` | 安裝系統資料夾、依賴套件與註冊瀏覽器橋接 |
| `下載影片一定要先下載我 步驟3.bat` | 自動下載並注入 ffmpeg 轉檔核心元件 |
| `uninstall.bat` | 一鍵完整解除安裝（可選擇保留或刪除下載影片） |
| `desktop/` | Python 桌面端主程式原始碼 |
| `extension/` | 瀏覽器擴充功能 (Manifest V3) |
| `native-host/` | 瀏覽器與桌面端 Safe Native Messaging 通訊橋接 |

---

## 3. Web 控制中心功能頁面

| 頁面 | 功能說明 |
| ----- | ----- |
| `▦ 首頁` | 今日影片 / 音訊統計、總容量、自動備份開關與崩潰恢復 (Crash Recovery) |
| `▶ YouTube` | 輸入網址 → 偵測影片資訊 → 內嵌播放器（16:9）→ 下載影片/音訊 |
| `♪ TikTok` | 同上，播放器為 9:16 直式版面 |
| `⇣ 下載佇列` | 佇列狀態、即時進度條、暫停 / 繼續 / 取消 |
| `🗂 下載紀錄` | 搜尋、類型篩選（全部 / 影片 / 音訊）、排序（最新 / 最舊 / 大小） |
| `⚙ 系統` | 系統需求檢測、所有設定開關、資料重置、即時 Logs |
| `{ } 原始碼交付` | 線上瀏覽全部原始碼，並可一鍵下載打包 ZIP |
| `ℹ 關於` | 作者資訊 + 每秒即時更新之「已運行時間」 |

---

## 4. 故障排除

| 現象 | 排除方法 |
| ----- | ----- |
| 打包時提示「Python 是 32-bit」 | 請解除安裝 32-bit Python，改安裝 `python-3.x.x-amd64.exe`。 |
| 提示「缺少影片解析元件」 | 請確認已執行 `install 步驟2.bat` 完成 `yt-dlp` 套件安裝。 |
| 影片無法合併或音訊無轉檔 | 請確認已執行 **`下載影片一定要先下載我 步驟3.bat`** 補齊 `ffmpeg.exe`。 |
| 擴充功能顯示「Desktop App 未連線」 | 請啟動桌面端程式，並確認 `install 步驟2.bat` 有正確填入 Extension ID。 |

---

**創作者**：阿柚 ah yoo~ │ **製作者**：arena AI │ **版本**：v1.0 (Windows x64) │ **出生時間**：2026/09/28