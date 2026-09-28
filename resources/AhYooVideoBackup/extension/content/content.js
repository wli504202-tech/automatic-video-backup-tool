/**
 * 阿柚自動影片備份 - Content Script
 * - 使用 PlatformAdapter 偵測影片（YouTube / TikTok / Instagram）
 * - 右上角 Dark Glass 浮動 UI：影片抓取成功 / 錯誤 / 下載進度
 * - 低耗能：MutationObserver + debounce + URL change detection（不做輪詢掃描）
 */
(function () {
  "use strict";
  if (window.__ahyooContentLoaded) return;
  window.__ahyooContentLoaded = true;

  const VERSION = "1.0";
  const HOST_ID = "ahyoo-backup-host";
  let closedForThisPage = false;
  let shadow = null;
  let root = null;
  let currentVideo = null;
  let settings = { videoDetection: true, videoQuality: "720p", downloadMode: "ask" };
  let lastKey = "";
  let busy = false;

  const debounce = (fn, wait) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(i === 0 ? 0 : 1) + " " + units[i];
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.className = "ahyoo-host";
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = STYLE + '<div class="panel" part="panel"></div>';
    root = shadow.querySelector(".panel");
    return host;
  }

  const STYLE = `
<style>
:host { all: initial; }
* { box-sizing: border-box; font-family: "Segoe UI", "Microsoft JhengHei", system-ui, sans-serif; }
.panel {
  width: 320px;
  background: rgba(15,18,24,0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  color: #FFFFFF;
  padding: 16px;
  opacity: 0;
  transform: translateY(-10px);
  animation: ahyoo-in .34s cubic-bezier(.22,.9,.3,1) forwards;
}
@keyframes ahyoo-in { from { opacity:0; transform: translateY(-10px);} to {opacity:1; transform: translateY(0);} }
.head { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.tick { width:24px; height:24px; border-radius:50%; background:#35D07F; display:flex; align-items:center; justify-content:center; color:#0B0E13; font-size:14px; font-weight:700; flex:none; }
.tick.err { background:#FF4D5F; color:#fff; }
.tick.wait { background:rgba(255,255,255,0.14); color:#B7BEC9; }
.title { font-size:14px; font-weight:600; letter-spacing:.3px; flex:1; }
.close { background:transparent; border:0; color:#B7BEC9; font-size:16px; cursor:pointer; padding:2px 6px; border-radius:8px; transition:.18s; }
.close:hover { background:rgba(255,255,255,0.08); color:#fff; }
.row { margin-bottom:10px; }
.label { font-size:11px; color:#B7BEC9; letter-spacing:.6px; margin-bottom:3px; }
.value { font-size:13px; color:#FFFFFF; word-break:break-all; line-height:1.45; }
.value.mini { font-size:12px; color:#B7BEC9; }
.actions { display:flex; gap:8px; margin-top:14px; }
button.act {
  flex:1; padding:9px 10px; border-radius:11px; border:1px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.06); color:#fff; font-size:12.5px; cursor:pointer; transition:.18s;
}
button.act:hover:not(:disabled) { background:rgba(255,255,255,0.12); transform:translateY(-1px); }
button.act:active:not(:disabled) { transform:translateY(0); }
button.act.primary { background:#35D07F; color:#08120C; border-color:transparent; font-weight:600; }
button.act.primary:hover:not(:disabled) { background:#41e08c; }
button.act:disabled { opacity:.55; cursor:not-allowed; }
.bar { height:6px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:8px; }
.bar > i { display:block; height:100%; width:0%; background:#35D07F; transition:width .3s ease; }
.state { font-size:12px; color:#B7BEC9; margin-top:8px; display:flex; justify-content:space-between; }
ul.reasons { margin:6px 0 0; padding-left:16px; color:#B7BEC9; font-size:12px; line-height:1.7; }
.badge { font-size:10.5px; color:#B7BEC9; border:1px solid rgba(255,255,255,0.12); padding:2px 7px; border-radius:99px; }
.footer { margin-top:12px; font-size:10.5px; color:#6f7784; text-align:center; }
.err-text { color:#FF4D5F; }
</style>`;

  function render(html) {
    ensureHost();
    if (!root) return;
    root.innerHTML = html;
    root.style.animation = "none";
    void root.offsetWidth;
    root.style.animation = "";
  }

  function bindClose() {
    const btn = shadow && shadow.querySelector(".close");
    if (btn) {
      btn.addEventListener("click", () => {
        closedForThisPage = true;
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
        shadow = null; root = null;
      });
    }
  }

  function renderSuccess(video) {
    const size = video.sizeLabel || "未知";
    render(`
      <div class="head">
        <div class="tick">✓</div>
        <div class="title">影片抓取成功</div>
        <span class="badge">${video.platform}</span>
        <button class="close" title="關閉">×</button>
      </div>
      <div class="row"><div class="label">連結</div><div class="value">${escapeHtml(video.url)}</div></div>
      <div class="row"><div class="label">名稱</div><div class="value">${escapeHtml(video.title)}</div></div>
      <div class="row"><div class="label">時長</div><div class="value">${escapeHtml(video.duration || "未知")}</div></div>
      <div class="row"><div class="label">大小</div><div class="value">${escapeHtml(size)}</div></div>
      <div class="actions">
        <button class="act primary" data-format="video">下載影片</button>
        <button class="act" data-format="audio">下載音訊</button>
      </div>
      <div class="state"><span id="st">畫質 ${escapeHtml(settings.videoQuality)}</span><span>${settings.downloadMode === "ask" ? "每次詢問位置" : "直接下載"}</span></div>
      <div class="bar"><i id="pb"></i></div>
      <div class="footer">請只保存你擁有或已獲授權的內容 · v${VERSION}</div>
    `);
    bindClose();
    shadow.querySelectorAll("button.act").forEach((btn) => {
      btn.addEventListener("click", () => startDownload(btn.dataset.format, video));
    });
  }

  function renderError(title, reasons, retry) {
    render(`
      <div class="head">
        <div class="tick err">×</div>
        <div class="title err-text">${escapeHtml(title)}</div>
        <button class="close" title="關閉">×</button>
      </div>
      <div class="row"><div class="label">可能原因</div>
        <ul class="reasons">${reasons.map((r) => "<li>" + escapeHtml(r) + "</li>").join("")}</ul>
      </div>
      <div class="actions"><button class="act primary" id="retry">重新嘗試</button></div>
      <div class="footer">阿柚自動影片備份 v${VERSION}</div>
    `);
    bindClose();
    const btn = shadow.querySelector("#retry");
    if (btn) btn.addEventListener("click", () => { if (retry) retry(); });
  }

  function renderDesktopOffline() {
    render(`
      <div class="head">
        <div class="tick err">⚠</div>
        <div class="title">Desktop App 未連線</div>
        <button class="close" title="關閉">×</button>
      </div>
      <div class="row"><div class="value mini">下載工作由 Windows Desktop App 執行，Extension 不會直接操作檔案系統。</div></div>
      <div class="actions"><button class="act primary" id="launch">啟動 Desktop App</button></div>
      <div class="state"><span id="st">尚未連線</span></div>
      <div class="footer">請確認 AhYooVideoBackup.exe 已安裝。</div>
    `);
    bindClose();
    shadow.querySelector("#launch").addEventListener("click", async () => {
      const st = shadow.querySelector("#st");
      st.textContent = "連線中...";
      const res = await sendMessage({ type: "CONNECT_DESKTOP" });
      if (res && res.ok) { st.textContent = "已連線"; detect(true); }
      else st.textContent = (res && res.error) || "請確認 AhYooVideoBackup.exe 已安裝。";
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "沒有回應" });
        });
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || "無法與擴充功能通訊" });
      }
    });
  }

  async function startDownload(format, video) {
    if (busy) return;
    busy = true;
    const buttons = shadow.querySelectorAll("button.act");
    buttons.forEach((b) => (b.disabled = true));
    const st = shadow.querySelector("#st");
    const pb = shadow.querySelector("#pb");
    const setState = (text, percent) => {
      if (st) st.textContent = text;
      if (pb && typeof percent === "number") pb.style.width = Math.max(0, Math.min(100, percent)) + "%";
    };

    setState("準備下載...", 2);
    const res = await sendMessage({
      type: "DOWNLOAD_REQUEST",
      format,
      url: video.url,
      title: video.title,
      platform: video.platform,
      duration: video.duration
    });

    if (!res.ok) {
      setState("× 下載失敗：" + (res.error || "未知原因"), 0);
      buttons.forEach((b) => (b.disabled = false));
      busy = false;
      if ((res.error || "").includes("未連線")) renderDesktopOffline();
      return;
    }

    setState("下載中 0%", 0);
    const requestId = res.message && res.message.requestId;

    const listener = (msg) => {
      if (!msg || msg.type !== "NATIVE_EVENT" || !msg.payload) return;
      const p = msg.payload;
      if (requestId && p.requestId && p.requestId !== requestId) return;
      if (p.type === "DOWNLOAD_PROGRESS") {
        setState("下載中 " + Math.round(p.progress || 0) + "%", p.progress || 0);
      } else if (p.type === "DOWNLOAD_COMPLETE") {
        setState("✓ 下載完成" + (p.fileSize ? "（" + formatBytes(p.fileSize) + "）" : ""), 100);
        buttons.forEach((b) => (b.disabled = false));
        busy = false;
        chrome.runtime.onMessage.removeListener(listener);
      } else if (p.type === "DOWNLOAD_FAILED") {
        setState("× 下載失敗：" + (p.error || "未知原因"), 0);
        buttons.forEach((b) => (b.disabled = false));
        busy = false;
        chrome.runtime.onMessage.removeListener(listener);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
  }

  async function detect(force) {
    if (closedForThisPage) return;
    const state = await sendMessage({ type: "GET_STATE" });
    if (state && state.ok) {
      settings = { ...settings, ...state.settings };
      if (!state.settings.videoDetection || !state.settings.enabled) {
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
        shadow = null; root = null;
        return;
      }
    }

    const adapter = window.AhYoo.resolveAdapter(location.href);
    if (!adapter) return;

    let ok = false;
    try { ok = adapter.detectVideo(); } catch (_) { ok = false; }
    if (!ok) {
      if (force) {
        renderError(
          adapter.name === "instagram" ? "Instagram 目前無法取得影片資訊" : "無法取得影片資訊",
          [
            "網頁尚未載入完成",
            "平台頁面結構發生變更",
            "影片不允許下載",
            "Extension 權限不足",
            "Desktop App 未啟動"
          ],
          () => detect(true)
        );
      }
      return;
    }

    let title = null, duration = null, url = location.href, thumbnail = null, sizeBytes = null;
    try {
      title = adapter.getTitle();
      duration = adapter.getDuration();
      url = adapter.getVideoUrl();
      thumbnail = adapter.getThumbnail();
      sizeBytes = adapter.estimateSize(settings.videoQuality);
    } catch (_) { /* 失敗安全 */ }

    if (!title) {
      renderError("無法取得影片資訊", ["網頁尚未載入完成", "平台頁面結構發生變更"], () => detect(true));
      return;
    }

    const key = url + "|" + title + "|" + (duration || "");
    if (!force && key === lastKey) return;
    lastKey = key;

    const sizeLabel = sizeBytes
      ? "約 " + formatBytes(sizeBytes) + "（" + settings.videoQuality + " 估算）"
      : (duration ? "估算中..." : "未知");

    currentVideo = {
      platform: adapter.name, url, title, duration: duration || "未知",
      thumbnail, sizeBytes, sizeLabel
    };

    renderSuccess(currentVideo);

    const res = await sendMessage({
      type: "VIDEO_DETECTED",
      platform: adapter.name, url, title, duration: duration || "未知"
    });
    if (!res.ok && (res.error || "").includes("未連線")) {
      renderDesktopOffline();
    }
  }

  const detectDebounced = debounce(() => detect(false), 700);

  // URL change detection（YouTube / TikTok 都是 SPA）
  let lastHref = location.href;
  const onNavigate = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    closedForThisPage = false;
    lastKey = "";
    busy = false;
    detectDebounced();
  };
  window.addEventListener("popstate", onNavigate);
  window.addEventListener("yt-navigate-finish", () => { closedForThisPage = false; lastKey = ""; detectDebounced(); });
  const pushState = history.pushState;
  history.pushState = function () { pushState.apply(this, arguments); onNavigate(); };
  const replaceState = history.replaceState;
  history.replaceState = function () { replaceState.apply(this, arguments); onNavigate(); };

  // DOM change detection（節流：只看 body 子樹的節點增減，交給 debounce）
  const observer = new MutationObserver(() => { onNavigate(); detectDebounced(); });
  const startObserver = () => {
    if (!document.body) { setTimeout(startObserver, 300); return; }
    observer.observe(document.body, { childList: true, subtree: true });
  };
  startObserver();

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "FORCE_DETECT") { closedForThisPage = false; detect(true); }
    if (message && message.type === "SETTINGS_CHANGED") { settings = { ...settings, ...message.settings }; detect(true); }
  });

  setTimeout(() => detect(false), 1200);
})();
