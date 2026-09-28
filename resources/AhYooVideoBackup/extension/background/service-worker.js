/**
 * 阿柚自動影片備份 - Background Service Worker (Manifest V3)
 * 職責：
 *  - 與 Windows Desktop App 建立 Native Messaging 連線 (com.ahyoo.video_backup)
 *  - 驗證並轉送 content script / popup / settings 的請求
 *  - 維護設定、下載統計、連線狀態
 * 安全原則：只允許白名單命令；不接受任意 shell / 路徑 / EXE 命令。
 */

const NATIVE_HOST = "com.ahyoo.video_backup";
const VERSION = "1.0";

const DEFAULT_SETTINGS = {
  version: VERSION,
  notifications: true,
  videoDetection: true,
  autoStart: true,
  downloadMode: "ask",          // ask | direct
  downloadDirectory: "",
  videoQuality: "720p",          // 1080p | 720p | 480p | 240p
  maxConcurrent: 2,
  youtubeBackup: false,
  tiktokBackup: false,
  autoBackupAcknowledged: false,
  keepVideosOnReset: false,
  keepAudioOnReset: false,
  debugMode: false,
  enabled: true
};

const DEFAULT_STATS = { video: 0, audio: 0, failed: 0 };

const ALLOWED_OUTBOUND = new Set([
  "HANDSHAKE", "PING", "VIDEO_DETECTED", "DOWNLOAD_REQUEST",
  "SETTINGS_SYNC", "RESET_REQUEST", "QUEUE_CONTROL"
]);

const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "www.youtube-nocookie.com", "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
  "instagram.com", "www.instagram.com"
];

let port = null;
let connected = false;
let connecting = false;
const pending = new Map();      // requestId -> resolve
let reconnectTimer = null;

function log(...args) {
  chrome.storage.local.get({ settings: DEFAULT_SETTINGS }).then(({ settings }) => {
    if (settings.debugMode) console.log("[阿柚][bg]", ...args);
  }).catch(() => {});
}

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function getSettings() {
  const data = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...data.settings };
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, version: VERSION };
  await chrome.storage.local.set({ settings: next });
  sendNative({ type: "SETTINGS_SYNC", settings: next }).catch(() => {});
  return next;
}

async function getStats() {
  const data = await chrome.storage.local.get({ stats: DEFAULT_STATS });
  return { ...DEFAULT_STATS, ...data.stats };
}

async function bumpStat(key) {
  const stats = await getStats();
  stats[key] = (stats[key] || 0) + 1;
  await chrome.storage.local.set({ stats });
  return stats;
}

function setBadge(ok) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#35D07F" : "#FF4D5F" });
  chrome.action.setBadgeText({ text: ok ? "" : "!" });
}

function connectNative() {
  if (connected || connecting) return;
  connecting = true;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
  } catch (err) {
    connecting = false;
    connected = false;
    setBadge(false);
    log("connectNative failed", err && err.message);
    scheduleReconnect();
    return;
  }

  port.onMessage.addListener((message) => {
    connected = true;
    connecting = false;
    setBadge(true);
    handleNativeMessage(message);
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    connected = false;
    connecting = false;
    port = null;
    setBadge(false);
    for (const [, resolve] of pending) {
      resolve({ ok: false, error: "Desktop App 未連線" });
    }
    pending.clear();
    log("native host disconnected", err && err.message);
    scheduleReconnect();
  });

  try {
    port.postMessage({ type: "HANDSHAKE", version: VERSION, requestId: newId() });
  } catch (_) { /* onDisconnect 會處理 */ }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 15000);
}

function newId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function handleNativeMessage(message) {
  if (!message || typeof message !== "object") return;
  const { type, requestId } = message;
  if (requestId && pending.has(requestId)) {
    pending.get(requestId)({ ok: true, message });
    pending.delete(requestId);
  }
  if (type === "DOWNLOAD_COMPLETE") {
    bumpStat(message.fileType === "audio" ? "audio" : "video").then(() => {
      notify("✓ 下載完成", message.title || "檔案已保存");
    });
  } else if (type === "DOWNLOAD_FAILED") {
    bumpStat("failed").then(() => {
      notify("× 下載失敗", message.error || "未知原因");
    });
  }
  broadcast({ type: "NATIVE_EVENT", payload: message });
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
}

async function notify(title, message) {
  const settings = await getSettings();
  if (!settings.notifications) return;
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon128.png"),
      title,
      message: String(message).slice(0, 180)
    });
  } catch (_) { /* 通知失敗不影響主流程 */ }
}

function sendNative(message) {
  return new Promise((resolve) => {
    if (!ALLOWED_OUTBOUND.has(message.type)) {
      resolve({ ok: false, error: "不允許的命令類型: " + message.type });
      return;
    }
    if ((message.type === "VIDEO_DETECTED" || message.type === "DOWNLOAD_REQUEST") &&
        !isAllowedUrl(message.url || "")) {
      resolve({ ok: false, error: "網址不在支援的平台白名單內" });
      return;
    }
    if (!connected || !port) {
      connectNative();
      resolve({ ok: false, error: "Desktop App 未連線" });
      return;
    }
    const requestId = message.requestId || newId();
    const payload = { ...message, requestId };
    const timer = setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        resolve({ ok: false, error: "Desktop App 沒有回應（逾時）" });
      }
    }, 20000);
    pending.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    try {
      port.postMessage(payload);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(requestId);
      connected = false;
      resolve({ ok: false, error: "無法傳送到 Desktop App：" + (err && err.message) });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message && message.type) {
        case "GET_STATE": {
          const [settings, stats] = [await getSettings(), await getStats()];
          sendResponse({ ok: true, settings, stats, connected, version: VERSION });
          break;
        }
        case "SAVE_SETTINGS": {
          const settings = await saveSettings(message.patch || {});
          sendResponse({ ok: true, settings });
          break;
        }
        case "CONNECT_DESKTOP": {
          connectNative();
          await new Promise((r) => setTimeout(r, 1200));
          sendResponse({ ok: connected, connected, error: connected ? null : "無法啟動 / 連線 Desktop App，請確認 AhYooVideoBackup.exe 已安裝並執行。" });
          break;
        }
        case "VIDEO_DETECTED": {
          const settings = await getSettings();
          if (!settings.videoDetection) {
            sendResponse({ ok: false, error: "影片抓取已在設定中關閉" });
            break;
          }
          const result = await sendNative({
            type: "VIDEO_DETECTED",
            platform: message.platform,
            url: message.url,
            title: message.title,
            duration: message.duration,
            requestId: message.requestId || newId()
          });
          sendResponse(result);
          break;
        }
        case "DOWNLOAD_REQUEST": {
          const settings = await getSettings();
          const result = await sendNative({
            type: "DOWNLOAD_REQUEST",
            format: message.format === "audio" ? "audio" : "video",
            quality: settings.videoQuality,
            url: message.url,
            title: message.title,
            platform: message.platform,
            duration: message.duration,
            requestId: message.requestId || newId()
          });
          if (result.ok) {
            notify("下載已開始", message.title || "");
          }
          sendResponse(result);
          break;
        }
        case "QUEUE_CONTROL": {
          sendResponse(await sendNative({ type: "QUEUE_CONTROL", action: message.action }));
          break;
        }
        case "RESET": {
          // 安全機制：background 不直接刪檔，交給 Desktop App 在確認後處理
          const result = await sendNative({
            type: "RESET_REQUEST",
            keepVideos: !!message.keepVideos,
            keepAudio: !!message.keepAudio,
            confirmed: message.confirmed === true
          });
          if (result.ok) {
            await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS }, stats: { ...DEFAULT_STATS } });
          }
          sendResponse(result);
          break;
        }
        case "OPEN_SETTINGS": {
          chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: "未知的訊息類型" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || "內部錯誤" });
    }
  })();
  return true; // async
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings/welcome.html") });
  }
  connectNative();
  setBadge(false);
});

chrome.runtime.onStartup.addListener(() => connectNative());

// Keep-alive：MV3 service worker 會休眠，用 alarms 週期性確認連線（低耗能）
chrome.alarms.create("ahyoo-keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "ahyoo-keepalive") return;
  if (!connected) connectNative();
  else sendNative({ type: "PING" }).catch(() => {});
});

connectNative();
