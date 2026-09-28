"use strict";

const $ = (id) => document.getElementById(id);

function toast(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast show" + (isError ? " err" : "");
  setTimeout(() => { el.className = "toast"; }, 2200);
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "沒有回應" });
    });
  });
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  if (!state.ok) { toast("無法讀取狀態", true); return; }
  const { settings, stats, connected } = state;

  $("enabled").checked = settings.enabled !== false;
  $("dot").className = "dot " + (settings.enabled !== false ? "on" : "");
  $("statusText").textContent = settings.enabled !== false ? "使用中..." : "已停止";
  $("videoCount").textContent = stats.video || 0;
  $("audioCount").textContent = stats.audio || 0;
  $("failedCount").textContent = stats.failed || 0;
  $("quality").value = settings.videoQuality || "720p";
  $("connDot").className = "dot " + (connected ? "on" : "off");
  $("connText").textContent = connected ? "Desktop Connected" : "Desktop Offline";
  $("connectBtn").textContent = connected ? "重新整理" : "連線";
}

$("enabled").addEventListener("change", async (event) => {
  const res = await send({ type: "SAVE_SETTINGS", patch: { enabled: event.target.checked } });
  toast(res.ok ? "✓ 設定已保存" : "× 操作失敗", !res.ok);
  refresh();
});

$("quality").addEventListener("change", async (event) => {
  const res = await send({ type: "SAVE_SETTINGS", patch: { videoQuality: event.target.value } });
  toast(res.ok ? "✓ 畫質已設定為 " + event.target.value : "× 操作失敗", !res.ok);
});

$("connectBtn").addEventListener("click", async () => {
  $("connectBtn").textContent = "連線中...";
  const res = await send({ type: "CONNECT_DESKTOP" });
  toast(res.ok ? "✓ Desktop App 已連線" : "× " + (res.error || "無法連線"), !res.ok);
  refresh();
});

$("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

$("resetBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html#reset") });
  window.close();
});

refresh();
setInterval(refresh, 4000);
