"use strict";
const $ = (id) => document.getElementById(id);

function toast(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast show" + (isError ? " err" : "");
  setTimeout(() => { el.className = "toast"; }, 2400);
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
      resolve(response || { ok: false, error: "沒有回應" });
    });
  });
}

document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("page-" + btn.dataset.page).classList.add("active");
  });
});

const BOOLS = ["notifications", "videoDetection", "autoStart", "debugMode", "youtubeBackup", "tiktokBackup"];

async function load() {
  const state = await send({ type: "GET_STATE" });
  if (!state.ok) { toast("無法讀取設定", true); return; }
  const s = state.settings;
  BOOLS.forEach((key) => { if ($(key)) $(key).checked = !!s[key]; });
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === s.downloadMode; });
  $("downloadDirectory").value = s.downloadDirectory || "";
  $("videoQuality").value = s.videoQuality || "720p";
  $("maxConcurrent").value = String(s.maxConcurrent || 2);
  $("connDot").className = "dot " + (state.connected ? "on" : "off");
  $("connText").textContent = state.connected ? "Desktop Connected" : "Desktop Offline";
}

async function save(patch, label) {
  const res = await send({ type: "SAVE_SETTINGS", patch });
  toast(res.ok ? "✓ " + (label || "設定已保存") : "× 操作失敗：" + (res.error || ""), !res.ok);
  return res.ok;
}

BOOLS.forEach((key) => {
  const el = $(key);
  if (!el) return;
  el.addEventListener("change", async () => {
    if ((key === "youtubeBackup" || key === "tiktokBackup") && el.checked) {
      const state = await send({ type: "GET_STATE" });
      if (state.ok && !state.settings.autoBackupAcknowledged) {
        const ok = window.confirm(
          "自動備份已啟用\n\n請確認你只會使用此工具保存自己擁有或獲得保存許可的內容。\n\n[我知道了]"
        );
        if (!ok) { el.checked = false; return; }
        await save({ autoBackupAcknowledged: true }, "已確認使用條款");
      }
    }
    save({ [key]: el.checked });
  });
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", () => save({ downloadMode: radio.value }, "下載模式已更新"));
});

$("videoQuality").addEventListener("change", (e) => save({ videoQuality: e.target.value }, "畫質：" + e.target.value));
$("maxConcurrent").addEventListener("change", (e) => save({ maxConcurrent: Number(e.target.value) }, "同時下載數：" + e.target.value));

$("downloadDirectory").addEventListener("change", (e) => {
  const value = e.target.value.trim();
  if (value && !/^[a-zA-Z]:\\/.test(value) && !/^\\\\/.test(value)) {
    toast("× 請輸入完整 Windows 路徑，例如 D:\\VideoBackup", true);
    return;
  }
  save({ downloadDirectory: value }, "下載位置已更新");
});

// 資料夾選擇必須由 Desktop App 開啟原生 Folder Picker（Extension 不直接操作檔案系統）
$("pickDir").addEventListener("click", async () => {
  $("pickDir").textContent = "開啟中...";
  const res = await send({ type: "CONNECT_DESKTOP" });
  $("pickDir").textContent = "設置下載位置";
  if (!res.ok) {
    toast("× Desktop App 未連線，請先啟動 AhYooVideoBackup.exe 後於 App 內選擇資料夾", true);
    return;
  }
  toast("✓ 請在 Desktop App 視窗中選擇資料夾（系統 → 設置下載位置）");
});

// ---- 重置流程 ----
$("openReset").addEventListener("click", () => $("resetOverlay").classList.add("show"));
$("cancelReset").addEventListener("click", () => $("resetOverlay").classList.remove("show"));

$("confirmReset").addEventListener("click", async () => {
  const keepVideos = $("keepVideos").checked;
  const keepAudio = $("keepAudio").checked;
  const progress = $("resetProgress");
  $("confirmReset").disabled = true;
  progress.textContent = "Processing... 正在建立刪除清單";
  const res = await send({ type: "RESET", keepVideos, keepAudio, confirmed: true });
  $("confirmReset").disabled = false;
  if (!res.ok) {
    progress.textContent = "× 重置失敗：" + (res.error || "Desktop App 未連線");
    toast("× 重置失敗：" + (res.error || "Desktop App 未連線"), true);
    return;
  }
  const payload = (res.message && res.message.result) || {};
  progress.textContent = payload.failures && payload.failures.length
    ? "部分檔案無法刪除（" + payload.failures.length + " 個）"
    : "✓ 重置完成";
  toast("✓ 重置完成");
  setTimeout(() => { $("resetOverlay").classList.remove("show"); load(); }, 1200);
});

if (location.hash === "#reset") {
  document.querySelector('.nav[data-page="reset"]').click();
  $("resetOverlay").classList.add("show");
}

load();
setInterval(load, 6000);
