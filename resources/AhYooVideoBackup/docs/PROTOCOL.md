# Native Messaging 協定 v1.0（com.ahyoo.video_backup）

> 執行環境：Windows 10/11 **64-bit (x64)**；Native Host 與 Desktop App 皆為 64-bit 執行檔。

## 通道

```
Extension (service-worker.js)
  ⇅ chrome.runtime.connectNative("com.ahyoo.video_backup")
Native Host (native_host.py)  ← stdio, 4-byte little-endian length prefix
  ⇅ HTTP 127.0.0.1:47811 (X-Ahyoo-Token)
Desktop App (server.py → DownloadManager)
```

## 允許的命令（白名單）

| type | 方向 | 說明 |
| --- | --- | --- |
| HANDSHAKE / PING | Ext → App | 建立 / 維持連線 |
| VIDEO_DETECTED | Ext → App | 偵測到影片 |
| DOWNLOAD_REQUEST | Ext → App | 要求下載（video / audio） |
| SETTINGS_SYNC | 雙向 | 設定同步 |
| QUEUE_CONTROL | Ext → App | pause / resume |
| RESET_REQUEST | Ext → App | 需 confirmed=true |
| VIDEO_READY / DOWNLOAD_ACCEPTED / DOWNLOAD_PROGRESS / DOWNLOAD_COMPLETE / DOWNLOAD_FAILED / ERROR | App → Ext | 狀態回報 |

## 範例

```json
{ "type": "VIDEO_DETECTED", "platform": "youtube", "url": "https://www.youtube.com/watch?v=xxxx",
  "title": "Example Video", "duration": "03:42", "requestId": "req_abc123" }
```

```json
{ "type": "VIDEO_READY", "requestId": "req_abc123", "status": "ready", "quality": "720p" }
```

```json
{ "type": "DOWNLOAD_REQUEST", "format": "video", "quality": "1080p",
  "url": "https://www.youtube.com/watch?v=xxxx", "title": "Example Video", "requestId": "req_abc124" }
```

```json
{ "type": "DOWNLOAD_PROGRESS", "requestId": "req_abc124", "progress": 47, "fileSize": 29780000 }
{ "type": "DOWNLOAD_COMPLETE", "requestId": "req_abc124", "filePath": "D:\\VideoBackup\\video\\Example Video.mp4", "fileSize": 29780000 }
{ "type": "DOWNLOAD_FAILED", "requestId": "req_abc124", "error": "儲存空間不足" }
```

## 安全規則

1. 只接受上表 type，其他一律拒絕。
2. 含 `command` / `shell` / `exec` / `script` / `eval` / `path` 欄位者一律拒絕。
3. `url` 必須屬於 youtube.com / youtu.be / youtube-nocookie.com / tiktok.com / instagram.com。
4. `format` 僅允許 `video` / `audio`。
5. 刪除 / 重置必須 `confirmed=true`，且實際刪除只發生在 Desktop App 內部（有刪除清單與失敗回報）。
6. Host 只連線 127.0.0.1，且需 `X-Ahyoo-Token`（存於 `%LOCALAPPDATA%\AhYooVideoBackup\ipc.token`）。
