# 最終自檢（v1.0）

| 項目 | 狀態 | 驗證方式 |
| --- | --- | --- |
| Extension 可以載入 | ✅ | chrome://extensions → 載入未封裝項目 → 無錯誤 |
| Popup 正常 | ✅ | 點擊圖示顯示 380×520 狀態 / 統計 / 畫質 |
| Settings 正常 | ✅ | options 頁五個分頁、開關即時保存 |
| YouTube Adapter | ✅ | 觀看影片 → 右上角「影片抓取成功」 |
| TikTok Adapter | ✅ | /@user/video/ 頁面偵測 |
| Instagram Adapter | ✅（失敗安全） | 取不到時顯示明確原因 |
| UI 可以關閉 | ✅ | 右上角 × 本次頁面不再顯示，重新整理可恢復 |
| Download / Audio button | ✅ | 進度：準備下載 → 下載中 % → 完成 / 失敗 |
| Desktop App | ✅ | 1000×650 Dark Glass，側欄七頁 |
| Native Messaging | ✅ | HANDSHAKE → HANDSHAKE_ACK；非白名單命令被拒 |
| Tray | ✅ | 右鍵：開啟 / 暫停 / 恢復 / 設定 / 紀錄 / 退出 |
| Startup | ✅ | HKCU Run 值 `--tray`，開機只常駐系統列 + 通知 |
| Download folder | ✅ | Folder Picker → 自動建立 video / audio |
| Download history | ✅ | SQLite，搜尋 / 篩選 / 排序 / 開啟檔案與資料夾 |
| Reset | ✅ | 二次確認 → 刪除清單 → 逐筆刪除 → 回報失敗清單 |
| Uninstaller | ✅ | uninstall.exe / uninstall.bat，可保留影片 / 音訊 / 設定 |
| install.bat / 打包.exe.bat / uninstall.bat | ✅ | 皆有錯誤檢查與結果摘要 |
| Config | ✅ | config.json 全部可讀寫，無硬編碼 |
| Crash recovery | ✅ | 啟動時標記 interrupted，首頁提供恢復 / 刪除 |
| File conflict | ✅ | 預設建立副本 `Example (1).mp4` |
| Disk check | ✅ | 少於 300MB 直接拒絕並顯示原因 |
| Error handling | ✅ | 所有失敗皆顯示原因，不出現假成功 |
| 64-bit (x64) 產物 | ✅ | `打包.exe.bat` 檢查 OS/Python 架構，`tools\check_arch.py` 驗證 PE Machine = 0x8664 |
| 32-bit 環境阻擋 | ✅ | install.bat / 打包.exe.bat 偵測到 x86 直接中止並說明原因 |
| 執行期架構顯示 | ✅ | Desktop App 系統頁顯示 `AMD64 · 64-bit`，非 64-bit 顯示警告 |
| 沒有假成功狀態 | ✅ | 無 yt-dlp / 無 ffmpeg / 被平台限制皆如實回報 |
