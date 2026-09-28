"use strict";
const $ = (id) => document.getElementById(id);
let STATE = null;

function toast(text, isError) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast show" + (isError ? " err" : "");
  setTimeout(() => { el.className = "toast"; }, 2400);
}

async function api(path, options) {
  try {
    const res = await fetch(path, {
      method: options ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: options ? JSON.stringify(options) : undefined,
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function bytes(n) {
  if (!n || n <= 0) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Number(n), i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

const STATUS_TEXT = {
  waiting: "等待中", fetching: "抓取中", preparing: "準備下載", downloading: "下載中",
  paused: "已暫停", completed: "完成", failed: "失敗", cancelled: "取消",
  interrupted: "Interrupted", missing: "File Missing",
};

// ---------- 導覽 ----------
document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("p-" + btn.dataset.page).classList.add("active");
    $("pageTitle").textContent = btn.textContent.trim();
    location.hash = btn.dataset.page;
    if (btn.dataset.page === "history") loadHistory();
    if (btn.dataset.page === "queue") loadQueue();
    if (btn.dataset.page === "system") loadLogs();
  });
});

function gotoHash() {
  const page = (location.hash || "#dashboard").slice(1);
  const btn = document.querySelector('.nav[data-page="' + page + '"]');
  if (btn) btn.click();
}
window.addEventListener("hashchange", gotoHash);

// ---------- 狀態 ----------
async function refresh() {
  const state = await api("/api/state");
  if (!state.ok) { toast("× 無法連線背景服務", true); return; }
  STATE = state;
  const s = state.settings;

  $("dTodayVideo").textContent = state.stats.video || 0;
  $("dTodayAudio").textContent = state.stats.audio || 0;
  $("dTotalSize").textContent = bytes(state.stats.bytes);
  $("dStatus").textContent = state.stats.failed > 0 ? "🟠 有失敗任務" : "🟢 正常";

  $("swYoutube").checked = !!s.youtubeBackup;
  $("swYoutube2").checked = !!s.youtubeBackup;
  $("swTiktok").checked = !!s.tiktokBackup;
  $("swTiktok2").checked = !!s.tiktokBackup;
  $("ytDot").className = "dot " + (s.youtubeBackup ? "on" : "");
  $("ttDot").className = "dot " + (s.tiktokBackup ? "on" : "");

  $("swNotify").checked = !!s.notifications;
  $("swDetect").checked = !!s.videoDetection;
  $("swAutoStart").checked = !!s.autoStart;
  $("downloadMode").value = s.downloadMode;
  $("videoQuality").value = s.videoQuality;
  $("ytQuality").value = s.videoQuality;
  $("ttQuality").value = s.videoQuality;
  $("maxConcurrent").value = String(s.maxConcurrent);
  $("conflictPolicy").value = s.conflictPolicy;
  $("ytMode").textContent = s.downloadMode === "ask" ? "每次詢問位置" : "直接下載";

  $("extDot").className = "dot " + (state.extensionConnected ? "on" : "off");
  $("extText").textContent = "Extension: " + (state.extensionConnected ? "Connected" : "未連線");
  $("sysExt").textContent = state.extensionConnected ? "Connected" : "Disconnected";
  $("sysBg").textContent = state.backgroundService;
  $("sysDir").textContent = s.downloadDirectory;
  $("sysFree").textContent = bytes(state.freeBytes);
  $("sysYtdlp").textContent = state.ytDlp ? "已安裝" : "未安裝（無法下載，請執行 install.bat）";
  $("sysFfmpeg").textContent = state.ffmpeg ? "已安裝" : "未安裝（音訊將保留原始格式）";
  $("sysArch").textContent = (state.arch || "unknown") + " · " + (state.bits || 64) + "-bit"
    + (state.is64bit ? "" : "（警告：偵測到 32-bit 執行環境，建議改用 x64 版本）");
  $("sysStatus").textContent = !state.is64bit
    ? "🟠 非 64-bit 執行環境"
    : (state.ytDlp ? "🟢 正常運作" : "🟠 缺少解析元件");
  $("birth").textContent = (s.birthTime || "").replace("T", " ").replace(/-/g, "/");

  const interrupted = state.stats.interrupted || 0;
  $("recovery").innerHTML = interrupted
    ? '發現 ' + interrupted + ' 個未完成下載 <div class="btns"><button class="primary" id="recoverBtn">恢復</button><button class="ghost" id="dropBtn">刪除任務</button></div>'
    : "沒有未完成的下載任務。";
  if (interrupted) {
    $("recoverBtn").onclick = async () => { await api("/api/queue-control", { action: "recover" }); toast("✓ 已恢復未完成下載"); refresh(); loadQueue(); };
    $("dropBtn").onclick = async () => {
      if (!confirm("確定刪除這些未完成的下載任務嗎？")) return;
      await api("/api/queue-control", { action: "drop-interrupted" }); toast("✓ 已刪除未完成任務"); refresh(); loadQueue();
    };
  }
}

// ---------- 設定 ----------
async function save(patch, label) {
  const res = await api("/api/settings", patch);
  toast(res.ok ? "✓ " + (label || "設定已保存") : "× 操作失敗：" + (res.error || ""), !res.ok);
  refresh();
}
const bind = (id, key, transform) =>
  $(id).addEventListener("change", (e) => {
    const value = transform ? transform(e.target) : e.target.checked;
    save({ [key]: value });
  });

bind("swNotify", "notifications");
bind("swDetect", "videoDetection");
bind("swAutoStart", "autoStart");
bind("downloadMode", "downloadMode", (el) => el.value);
bind("videoQuality", "videoQuality", (el) => el.value);
bind("maxConcurrent", "maxConcurrent", (el) => Number(el.value));
bind("conflictPolicy", "conflictPolicy", (el) => el.value);

function bindAutoBackup(id, key) {
  $(id).addEventListener("change", async (e) => {
    if (e.target.checked && STATE && !STATE.settings.autoBackupAcknowledged) {
      const ok = confirm("自動備份已啟用\n\n請確認你只會使用此工具保存自己擁有或獲得保存許可的內容。\n\n[我知道了]");
      if (!ok) { e.target.checked = false; return; }
      await api("/api/settings", { autoBackupAcknowledged: true });
    }
    save({ [key]: e.target.checked }, (key === "youtubeBackup" ? "YouTube" : "TikTok") + " 自動備份：" + (e.target.checked ? "ON" : "OFF"));
  });
}
["swYoutube", "swYoutube2"].forEach((id) => bindAutoBackup(id, "youtubeBackup"));
["swTiktok", "swTiktok2"].forEach((id) => bindAutoBackup(id, "tiktokBackup"));

$("pickDir").addEventListener("click", async () => {
  $("pickDir").textContent = "開啟中...";
  const res = await api("/api/pick-folder", {});
  $("pickDir").textContent = "設置下載位置";
  toast(res.ok ? "✓ 下載位置已設定" : "× " + (res.error || "未選擇"), !res.ok);
  refresh();
});
$("openDir").addEventListener("click", async () => {
  const items = (await api("/api/downloads")).items || [];
  if (!items.length) { toast("× 尚無已下載檔案可開啟資料夾", true); return; }
  const res = await api("/api/open", { id: items[0].id, folder: true });
  if (!res.ok) toast("× " + res.error, true);
});

// ---------- 播放器 ----------
function ytId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
    return u.searchParams.get("v");
  } catch (_) { return null; }
}
function ttId(url) { const m = String(url).match(/\/video\/(\d+)/); return m ? m[1] : null; }

$("ytLoad").addEventListener("click", () => {
  const id = ytId($("ytUrl").value.trim());
  if (!id) { toast("× 請輸入有效的 YouTube 網址", true); return; }
  $("ytFrame").src = "https://www.youtube-nocookie.com/embed/" + id;
  $("ytHint").textContent = "已載入影片 " + id + "。請只保存你擁有或已獲授權的內容。";
});
$("ttLoad").addEventListener("click", () => {
  const id = ttId($("ttUrl").value.trim());
  if (!id) { toast("× 請輸入有效的 TikTok 影片網址", true); return; }
  $("ttFrame").src = "https://www.tiktok.com/embed/v2/" + id;
  $("ttHint").textContent = "已載入 TikTok 影片 " + id + "。";
});

async function queueDownload(url, fileType, quality, hintId) {
  if (!url) { toast("× 請先輸入影片網址", true); return; }
  const hint = $(hintId);
  hint.textContent = "準備下載...";
  const res = await api("/api/download", { url, fileType, quality, title: url, platform: url.includes("tiktok") ? "tiktok" : "youtube" });
  if (!res.ok) { hint.textContent = "× 下載失敗：" + res.error; toast("× " + res.error, true); return; }
  hint.textContent = "✓ 已加入下載佇列（#" + res.id + "）";
  toast("✓ 下載已開始");
  loadQueue();
}

$("ytVideo").addEventListener("click", () => queueDownload($("ytUrl").value.trim(), "video", $("ytQuality").value, "ytHint"));
$("ytAudio").addEventListener("click", () => queueDownload($("ytUrl").value.trim(), "audio", $("ytQuality").value, "ytHint"));
$("ttVideo").addEventListener("click", () => queueDownload($("ttUrl").value.trim(), "video", $("ttQuality").value, "ttHint"));
$("ttAudio").addEventListener("click", () => queueDownload($("ttUrl").value.trim(), "audio", $("ttQuality").value, "ttHint"));

// ---------- 佇列 / 紀錄 ----------
function itemHtml(item, withProgress) {
  const status = STATUS_TEXT[item.status] || item.status;
  return '<div class="item" data-id="' + item.id + '">' +
    '<h4>' + escapeHtml(item.title) + '</h4>' +
    '<div class="meta"><span class="tag ' + item.status + '">' + status + '</span>' +
    '<span>' + item.fileType.toUpperCase() + ' · ' + String(item.format).toUpperCase() + '</span>' +
    '<span>' + (item.quality || "-") + '</span>' +
    '<span>' + bytes(item.fileSize) + '</span>' +
    '<span>' + (item.createdAt || "") + '</span></div>' +
    (item.errorMessage ? '<div class="meta" style="color:#FF9AA4">' + escapeHtml(item.errorMessage) + '</div>' : "") +
    (withProgress ? '<div class="bar"><i style="width:' + (item.progress || 0) + '%"></i></div>' : "") +
    '<div class="ops">' +
      (withProgress ? '<button class="ghost" data-act="pause">暫停</button><button class="ghost" data-act="resume">繼續</button><button class="ghost" data-act="cancel">取消</button>' : "") +
      (!withProgress && item.status !== "completed" ? '<button class="ghost" data-act="retry">重試</button>' : "") +
      (!withProgress ? '<button class="ghost" data-act="open">開啟檔案</button><button class="ghost" data-act="folder">開啟所在資料夾</button><button class="ghost" data-act="delete-record">刪除紀錄</button>' : "") +
    '</div></div>';
}

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bindOps(container, reload) {
  container.querySelectorAll(".item").forEach((el) => {
    el.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(el.dataset.id);
        const act = btn.dataset.act;
        if (act === "delete-record" && !confirm("確定刪除這筆下載紀錄嗎？（檔案不會被刪除）")) return;
        let res;
        if (act === "open") res = await api("/api/open", { id, folder: false });
        else if (act === "folder") res = await api("/api/open", { id, folder: true });
        else res = await api("/api/task", { id, action: act });
        if (!res.ok) toast("× " + (res.error || "操作失敗"), true);
        else if (act !== "open" && act !== "folder") { toast("✓ 已執行：" + act); reload(); }
      });
    });
  });
}

async function loadQueue() {
  const res = await api("/api/queue");
  const box = $("queueList");
  const items = (res.items || []);
  box.innerHTML = items.length ? items.map((i) => itemHtml(i, true)).join("") : '<div class="empty">佇列是空的</div>';
  bindOps(box, loadQueue);
}

async function loadHistory() {
  const q = encodeURIComponent($("search").value.trim());
  const res = await api("/api/downloads?q=" + q + "&filter=" + $("filter").value + "&sort=" + $("sort").value);
  const box = $("historyList");
  const items = res.items || [];
  box.innerHTML = items.length ? items.map((i) => itemHtml(i, false)).join("") : '<div class="empty">尚無下載紀錄</div>';
  bindOps(box, loadHistory);
}
["search", "filter", "sort"].forEach((id) => $(id).addEventListener("input", loadHistory));

$("pauseAll").addEventListener("click", async () => { await api("/api/queue-control", { action: "pause-all" }); toast("✓ 已暫停所有下載"); loadQueue(); });
$("resumeAll").addEventListener("click", async () => { await api("/api/queue-control", { action: "resume-all" }); toast("✓ 已恢復所有下載"); loadQueue(); });

async function loadLogs() {
  const res = await api("/api/logs");
  $("logs").textContent = (res.lines || []).join("") || "目前沒有日誌。";
}

// ---------- 重置 ----------
$("openReset").addEventListener("click", () => $("resetOverlay").classList.add("show"));
$("cancelReset").addEventListener("click", () => $("resetOverlay").classList.remove("show"));
$("confirmReset").addEventListener("click", async () => {
  $("confirmReset").disabled = true;
  $("resetProgress").textContent = "Processing... 建立刪除清單";
  const res = await api("/api/reset", {
    confirm: true, keepVideos: $("keepVideos").checked, keepAudio: $("keepAudio").checked,
  });
  $("confirmReset").disabled = false;
  if (!res.ok) { $("resetProgress").textContent = "× 重置失敗：" + (res.error || ""); return; }
  $("resetProgress").textContent = (res.failures && res.failures.length)
    ? "部分檔案無法刪除（" + res.failures.length + " 個）：" + res.failures.slice(0, 3).join("、")
    : "✓ 重置完成（刪除 " + res.removed + " 筆）";
  toast("✓ 重置完成");
  refresh(); loadHistory(); loadQueue();
});

// ---------- 使用時間 ----------
function diff(from, to) {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  let hours = to.getHours() - from.getHours();
  let minutes = to.getMinutes() - from.getMinutes();
  let seconds = to.getSeconds() - from.getSeconds();
  if (seconds < 0) { seconds += 60; minutes--; }
  if (minutes < 0) { minutes += 60; hours--; }
  if (hours < 0) { hours += 24; days--; }
  if (days < 0) { const prev = new Date(to.getFullYear(), to.getMonth(), 0).getDate(); days += prev; months--; }
  if (months < 0) { months += 12; years--; }
  return { years, months, days, hours, minutes, seconds };
}
setInterval(() => {
  if (!STATE || !STATE.settings.birthTime) return;
  const birth = new Date(STATE.settings.birthTime);
  const now = new Date();
  if (now < birth) { $("uptime").textContent = "尚未開始（出生時間在未來）"; return; }
  const d = diff(birth, now);
  $("uptime").textContent = d.years + "年" + d.months + "月" + d.days + "日" + d.hours + "時" + d.minutes + "分" + d.seconds + "秒";
}, 1000);

refresh();
loadQueue();
loadHistory();
loadLogs();
gotoHash();
setInterval(refresh, 3000);
setInterval(() => { if ($("p-queue").classList.contains("active")) loadQueue(); }, 1500);
