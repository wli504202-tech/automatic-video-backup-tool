"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Btn,
  Card,
  Dot,
  Field,
  STATUS_LABEL,
  Switch,
  ToastProvider,
  formatBytes,
  useToast,
} from "@/components/ui";

type SettingsT = {
  version: string;
  notifications: boolean;
  videoDetection: boolean;
  autoStart: boolean;
  downloadMode: string;
  downloadDirectory: string;
  videoQuality: string;
  maxConcurrent: number;
  youtubeBackup: boolean;
  tiktokBackup: boolean;
  autoBackupAcknowledged: boolean;
  debugMode: boolean;
  desktopConnected: boolean;
  birthTime: string;
};

type DownloadT = {
  id: number;
  requestId: string;
  title: string;
  platform: string;
  url: string;
  fileType: string;
  format: string;
  quality: string;
  duration: string;
  filePath: string;
  fileSize: number;
  progress: number;
  status: string;
  errorMessage: string | null;
  source: string;
  createdAt: string;
};

type StatsT = {
  videoCount: number;
  audioCount: number;
  todayVideo: number;
  todayAudio: number;
  totalBytes: number;
  totalSizeLabel: string;
  active: number;
  failed: number;
  interrupted: number;
  total: number;
};

type DetectedVideo = {
  platform: string;
  id: string;
  url: string;
  embedUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: string;
  sizeLabel: string;
  sizeBytes: number;
  quality: string;
};

const PAGES = [
  { key: "dashboard", label: "首頁", icon: "▦" },
  { key: "youtube", label: "YouTube", icon: "▶" },
  { key: "tiktok", label: "TikTok", icon: "♪" },
  { key: "queue", label: "下載佇列", icon: "⇣" },
  { key: "history", label: "下載紀錄", icon: "🗂" },
  { key: "system", label: "系統", icon: "⚙" },
  { key: "source", label: "原始碼交付", icon: "{ }" },
  { key: "about", label: "關於", icon: "ℹ" },
] as const;

type PageKey = (typeof PAGES)[number]["key"];

async function api<T>(path: string, init?: RequestInit): Promise<T & { ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    return (await res.json()) as T & { ok: boolean; error?: string };
  } catch (error) {
    return { ok: false, error: String(error) } as T & { ok: boolean; error?: string };
  }
}

function uptime(from: Date, to: Date) {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  let hours = to.getHours() - from.getHours();
  let minutes = to.getMinutes() - from.getMinutes();
  let seconds = to.getSeconds() - from.getSeconds();
  if (seconds < 0) { seconds += 60; minutes -= 1; }
  if (minutes < 0) { minutes += 60; hours -= 1; }
  if (hours < 0) { hours += 24; days -= 1; }
  if (days < 0) {
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    months -= 1;
  }
  if (months < 0) { months += 12; years -= 1; }
  return `${years}年${months}月${days}日${hours}時${minutes}分${seconds}秒`;
}

function Inner() {
  const toast = useToast();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [stats, setStats] = useState<StatsT | null>(null);
  const [downloads, setDownloads] = useState<DownloadT[]>([]);
  const [queue, setQueue] = useState<DownloadT[]>([]);
  const [logs, setLogs] = useState<{ id: number; level: string; event: string; message: string; createdAt: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [resetOpen, setResetOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const loadCore = useCallback(async () => {
    const [s, st, q, lg] = await Promise.all([
      api<{ settings: SettingsT }>("/api/settings"),
      api<{ stats: StatsT }>("/api/stats"),
      api<{ downloads: DownloadT[] }>("/api/downloads?scope=queue"),
      api<{ logs: typeof logs }>("/api/logs"),
    ]);
    if (s.ok) setSettings(s.settings);
    if (st.ok) setStats(st.stats);
    if (q.ok) setQueue(q.downloads);
    if (lg.ok) setLogs(lg.logs);
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await api<{ downloads: DownloadT[] }>(
      `/api/downloads?q=${encodeURIComponent(search)}&filter=${filter}&sort=${sort}`,
    );
    if (res.ok) setDownloads(res.downloads);
  }, [search, filter, sort]);

  useEffect(() => {
    loadCore();
    const timer = setInterval(loadCore, 5000);
    return () => clearInterval(timer);
  }, [loadCore]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const patchSettings = useCallback(
    async (patch: Partial<SettingsT>, label?: string) => {
      const res = await api<{ settings: SettingsT }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setSettings(res.settings);
        toast(`✓ ${label ?? "設定已保存"}`);
      } else {
        toast(`× 操作失敗：${res.error ?? ""}`, true);
      }
      return res.ok;
    },
    [toast],
  );

  const taskAction = useCallback(
    async (id: number, action: string) => {
      const res = await api<Record<string, never>>(`/api/downloads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      toast(res.ok ? `✓ 已執行：${action}` : `× 操作失敗：${res.error ?? ""}`, !res.ok);
      loadCore();
      loadHistory();
    },
    [loadCore, loadHistory, toast],
  );

  const removeRecord = useCallback(
    async (id: number) => {
      if (!window.confirm("確定刪除這筆下載紀錄嗎？（Desktop App 的實體檔案不會被刪除）")) return;
      const res = await api<Record<string, never>>(`/api/downloads/${id}`, { method: "DELETE" });
      toast(res.ok ? "✓ 紀錄已刪除" : "× 刪除失敗", !res.ok);
      loadCore();
      loadHistory();
    },
    [loadCore, loadHistory, toast],
  );

  const queueControl = useCallback(
    async (action: string, label: string) => {
      const res = await api<{ affected: number }>("/api/queue", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast(res.ok ? `✓ ${label}（${res.affected ?? 0} 個任務）` : "× 操作失敗", !res.ok);
      loadCore();
      loadHistory();
    },
    [loadCore, loadHistory, toast],
  );

  const sidebar = (
    <aside className="flex w-[232px] shrink-0 flex-col gap-5 border-r border-white/10 bg-[rgba(11,14,19,0.7)] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden>
          <rect x="1" y="1" width="30" height="30" rx="9" fill="#35D07F" />
          <path d="M13 10.5 L22 16 L13 21.5 Z" fill="#08120C" />
        </svg>
        <div>
          <div className="text-[13.5px] font-bold">阿柚自動影片備份</div>
          <div className="text-[10px] tracking-[1.6px] text-[#B7BEC9]">AHYOO BACKUP</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1.5">
        {PAGES.map((item) => {
          const active = page === item.key;
          const dotState =
            item.key === "youtube"
              ? settings?.youtubeBackup
                ? "on"
                : "idle"
              : item.key === "tiktok"
                ? settings?.tiktokBackup
                  ? "on"
                  : "idle"
                : null;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] transition-all ${
                active
                  ? "border-[rgba(53,208,127,0.32)] bg-[rgba(53,208,127,0.14)] text-white"
                  : "border-transparent text-[#B7BEC9] hover:bg-white/5 hover:text-white"
              }`}
            >
              {dotState ? <Dot state={dotState} /> : <span className="w-3.5 text-center text-[11px]">{item.icon}</span>}
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 text-[11.5px] text-[#B7BEC9]">
        <div className="flex items-center gap-2">
          <Dot state={settings?.desktopConnected ? "on" : "off"} />
          Desktop {settings?.desktopConnected ? "Connected" : "Offline"}
        </div>
        <div>v{settings?.version ?? "1.0"}</div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebar}
      <main className="flex-1 overflow-y-auto px-8 pb-10">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[#0f1319] via-[#0f1319] to-transparent py-5 text-lg font-semibold">
          <div>{PAGES.find((p) => p.key === page)?.label}</div>
          <div className="flex gap-2">
            <Btn onClick={() => queueControl("pause-all", "已暫停所有下載")}>暫停全部</Btn>
            <Btn onClick={() => queueControl("resume-all", "已恢復所有下載")}>恢復全部</Btn>
          </div>
        </header>

        {page === "dashboard" ? (
          <Dashboard
            stats={stats}
            settings={settings}
            onToggle={patchSettings}
            onRecover={queueControl}
          />
        ) : null}

        {page === "youtube" || page === "tiktok" ? (
          <PlatformPage
            key={page}
            platform={page}
            settings={settings}
            onQueued={() => {
              loadCore();
              loadHistory();
            }}
            onToggle={patchSettings}
          />
        ) : null}

        {page === "queue" ? (
          <TaskList
            items={queue}
            showProgress
            emptyText="佇列是空的"
            onAction={taskAction}
            onDelete={removeRecord}
          />
        ) : null}

        {page === "history" ? (
          <Card>
            <div className="mb-4 flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜尋影片名稱"
                className="flex-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[13px] outline-none focus:border-[rgba(53,208,127,0.5)]"
              />
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-xl border border-white/12 bg-[#151a22] px-3 py-2 text-[12.5px]"
              >
                <option value="all">全部</option>
                <option value="video">影片</option>
                <option value="audio">音訊</option>
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="rounded-xl border border-white/12 bg-[#151a22] px-3 py-2 text-[12.5px]"
              >
                <option value="newest">最新</option>
                <option value="oldest">最舊</option>
                <option value="size">檔案大小</option>
              </select>
            </div>
            <TaskList
              items={downloads}
              emptyText="尚無下載紀錄"
              onAction={taskAction}
              onDelete={removeRecord}
              bare
            />
          </Card>
        ) : null}

        {page === "system" ? (
          <SystemPage
            settings={settings}
            stats={stats}
            logs={logs}
            onToggle={patchSettings}
            onOpenReset={() => setResetOpen(true)}
          />
        ) : null}

        {page === "source" ? <SourcePage /> : null}

        {page === "about" ? (
          <div className="grid gap-4">
            <Card title="關於">
              <Field label="創作者" value="阿柚 ah yoo~" />
              <Field label="製作者" value="arena AI" />
              <Field label="版本號" value={`v${settings?.version ?? "1.0"}`} />
              <Field
                label="出生時間"
                value={settings ? new Date(settings.birthTime).toLocaleString("zh-TW", { hour12: false }) : "—"}
              />
              <Field
                label="已運行"
                value={settings ? uptime(new Date(settings.birthTime), now) : "計算中..."}
              />
            </Card>
            <Card>
              {[
                "這個工具最初是因為一個很簡單的想法而開始。",
                "有時候，我們會遇到自己很喜歡的影片或創作者內容，但影片可能因為各種原因被下架、刪除或停止公開。",
                "因此，我想製作一個簡單的工具，讓使用者可以在符合平台規則與內容授權的前提下，將自己有權保存的影片整理並備份到自己的電腦。",
                "它不是一個複雜的平台，而是一個專注於「整理、備份與管理」的小工具。",
                "希望它可以讓重要的合法內容更容易被保存與管理。",
              ].map((line) => (
                <p key={line} className="mb-2.5 text-[13.5px] leading-8 text-[#C9D0DA]">
                  {line}
                </p>
              ))}
            </Card>
          </div>
        ) : null}
      </main>

      {resetOpen ? (
        <ResetModal
          onClose={() => setResetOpen(false)}
          onDone={() => {
            loadCore();
            loadHistory();
          }}
        />
      ) : null}
    </div>
  );
}

function Dashboard({
  stats,
  settings,
  onToggle,
  onRecover,
}: {
  stats: StatsT | null;
  settings: SettingsT | null;
  onToggle: (patch: Partial<SettingsT>, label?: string) => Promise<boolean>;
  onRecover: (action: string, label: string) => Promise<void>;
}) {
  const toast = useToast();
  const confirmAuto = async (key: "youtubeBackup" | "tiktokBackup", value: boolean) => {
    if (value && settings && !settings.autoBackupAcknowledged) {
      const ok = window.confirm(
        "自動備份已啟用\n\n請確認你只會使用此工具保存自己擁有或獲得保存許可的內容。\n\n[我知道了]",
      );
      if (!ok) return;
      await onToggle({ autoBackupAcknowledged: true }, "已確認使用條款");
    }
    onToggle({ [key]: value } as Partial<SettingsT>, `${key === "youtubeBackup" ? "YouTube" : "TikTok"} 自動備份：${value ? "ON" : "OFF"}`);
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { k: "今日影片", v: stats?.todayVideo ?? 0 },
          { k: "今日音訊", v: stats?.todayAudio ?? 0 },
          { k: "總容量", v: stats?.totalSizeLabel ?? "未知" },
          { k: "狀態", v: (stats?.failed ?? 0) > 0 ? "🟠 有失敗任務" : "🟢 正常" },
        ].map((item) => (
          <Card key={item.k}>
            <div className="text-[11.5px] text-[#B7BEC9]">{item.k}</div>
            <div className="mt-1.5 text-2xl font-bold">{item.v}</div>
          </Card>
        ))}
      </div>

      <Card title="自動化影片備份">
        <Switch
          label="啟動 YouTube 自動備份影片模式"
          hint="偵測 ON / 自動下載 OFF（僅限你有權保存的內容）"
          checked={!!settings?.youtubeBackup}
          onChange={(value) => confirmAuto("youtubeBackup", value)}
        />
        <Switch
          label="啟動 TikTok 自動備份影片模式"
          hint="偵測 ON / 自動下載 OFF"
          checked={!!settings?.tiktokBackup}
          onChange={(value) => confirmAuto("tiktokBackup", value)}
        />
      </Card>

      <Card title="Crash Recovery · 未完成任務">
        {(stats?.interrupted ?? 0) > 0 ? (
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <span>發現 {stats?.interrupted} 個未完成下載（標記為 Interrupted，不會假裝完成）</span>
            <div className="flex gap-2">
              <Btn variant="primary" onClick={() => onRecover("recover", "已恢復未完成下載")}>
                恢復
              </Btn>
              <Btn
                variant="danger"
                onClick={() => {
                  if (window.confirm("確定刪除這些未完成的下載任務嗎？")) {
                    onRecover("drop-interrupted", "已刪除未完成任務");
                  }
                }}
              >
                刪除任務
              </Btn>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-[#B7BEC9]">沒有未完成的下載任務。</div>
        )}
      </Card>

      <Card title="系統架構說明">
        <p className="text-[13px] leading-7 text-[#C9D0DA]">
          實際的檔案下載由 Windows Desktop App（AhYooVideoBackup.exe + DownloadManager + yt-dlp）執行，
          Extension 只負責偵測與送出請求，透過 Native Messaging（com.ahyoo.video_backup）通訊。
          本控制中心負責設定、佇列、紀錄與完整原始碼交付，所有資料 Local First。
        </p>
        <div className="mt-3 flex gap-2">
          <Btn onClick={() => toast("✓ 原始碼可於「原始碼交付」頁下載完整 ZIP")}>如何取得程式？</Btn>
          <a href="/api/source/zip" download>
            <Btn variant="primary">下載完整專案 ZIP</Btn>
          </a>
        </div>
      </Card>
    </div>
  );
}

function PlatformPage({
  platform,
  settings,
  onQueued,
  onToggle,
}: {
  platform: "youtube" | "tiktok";
  settings: SettingsT | null;
  onQueued: () => void;
  onToggle: (patch: Partial<SettingsT>, label?: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<DetectedVideo | null>(null);
  const [error, setError] = useState<{ title: string; reasons: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState(settings?.videoQuality ?? "720p");
  const [phase, setPhase] = useState("");

  useEffect(() => {
    if (settings?.videoQuality) setQuality(settings.videoQuality);
  }, [settings?.videoQuality]);

  const detect = async () => {
    setLoading(true);
    setError(null);
    setVideo(null);
    setPhase("抓取中...");
    const res = await api<{ video: DetectedVideo; reasons?: string[] }>("/api/detect", {
      method: "POST",
      body: JSON.stringify({ url, quality }),
    });
    setLoading(false);
    if (!res.ok) {
      setPhase("");
      setError({ title: res.error ?? "無法取得影片資訊", reasons: res.reasons ?? ["請稍後重試"] });
      return;
    }
    setVideo(res.video);
    setPhase("✓ 影片抓取成功");
  };

  const download = async (fileType: "video" | "audio") => {
    if (!video) return;
    setPhase("準備下載...");
    const res = await api<{ note: string; download: DownloadT }>("/api/downloads", {
      method: "POST",
      body: JSON.stringify({
        url: video.url,
        title: video.title,
        fileType,
        quality,
        duration: video.duration,
        thumbnail: video.thumbnail,
      }),
    });
    if (!res.ok) {
      setPhase(`× 下載失敗：${res.error ?? ""}`);
      toast(`× 下載失敗：${res.error ?? ""}`, true);
      return;
    }
    setPhase(`✓ 已加入佇列 #${res.download.id}｜${res.note}`);
    toast("✓ 下載已開始（等待 Desktop App 接手）");
    onQueued();
  };

  const isYoutube = platform === "youtube";

  return (
    <div className="grid grid-cols-[1.55fr_1fr] items-start gap-4">
      <Card title={isYoutube ? "YouTube 播放器" : "TikTok 播放器"}>
        <div className="mb-3 flex gap-2">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={isYoutube ? "https://www.youtube.com/watch?v=..." : "https://www.tiktok.com/@user/video/..."}
            className="flex-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[13px] outline-none focus:border-[rgba(53,208,127,0.5)]"
          />
          <Btn variant="primary" onClick={detect} disabled={loading || !url.trim()}>
            {loading ? "抓取中..." : "偵測影片"}
          </Btn>
        </div>
        <div
          className={`relative overflow-hidden rounded-2xl border border-white/12 bg-black ${
            isYoutube ? "aspect-video" : "mx-auto aspect-[9/16] w-[290px]"
          }`}
        >
          {video ? (
            <iframe
              key={video.embedUrl}
              src={video.embedUrl}
              title="player"
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#6f7784]">
              尚未載入影片
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4">
        {video ? (
          <div className="glass fade-in p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#35D07F] text-sm font-bold text-[#08120C]">
                ✓
              </span>
              <span className="text-sm font-semibold">影片抓取成功</span>
              <span className="ml-auto rounded-full border border-white/12 px-2 py-0.5 text-[10.5px] text-[#B7BEC9]">
                {video.platform}
              </span>
            </div>
            <div className="mb-2.5">
              <div className="text-[11px] tracking-wide text-[#B7BEC9]">連結</div>
              <div className="text-[13px] break-all">{video.url}</div>
            </div>
            <div className="mb-2.5">
              <div className="text-[11px] tracking-wide text-[#B7BEC9]">名稱</div>
              <div className="text-[13px]">{video.title}</div>
            </div>
            <div className="mb-2.5">
              <div className="text-[11px] tracking-wide text-[#B7BEC9]">時長</div>
              <div className="text-[13px]">{video.duration}</div>
            </div>
            <div className="mb-2.5">
              <div className="text-[11px] tracking-wide text-[#B7BEC9]">大小</div>
              <div className="text-[13px]">{video.sizeLabel}</div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12.5px]">
              <span className="text-[#B7BEC9]">畫質</span>
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
                className="rounded-lg border border-white/12 bg-[#151a22] px-2.5 py-1.5"
              >
                {["1080p", "720p", "480p", "240p"].map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <Btn variant="primary" className="flex-1" onClick={() => download("video")}>
                下載影片
              </Btn>
              <Btn className="flex-1" onClick={() => download("audio")}>
                下載音訊
              </Btn>
            </div>
            <div className="mt-3 text-[11.5px] leading-6 text-[#B7BEC9]">{phase}</div>
          </div>
        ) : null}

        {error ? (
          <div className="glass fade-in !border-[rgba(255,77,95,0.4)] p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF4D5F] text-sm font-bold">
                ×
              </span>
              <span className="text-sm font-semibold text-[#FF4D5F]">{error.title}</span>
            </div>
            <div className="text-[11px] text-[#B7BEC9]">可能原因</div>
            <ul className="mt-1.5 list-disc pl-4 text-[12px] leading-7 text-[#B7BEC9]">
              {error.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <Btn variant="primary" className="mt-3 w-full" onClick={detect}>
              重新嘗試
            </Btn>
          </div>
        ) : null}

        <Card title="平台設定">
          <Switch
            label={`啟動 ${isYoutube ? "YouTube" : "TikTok"} 自動備份影片模式`}
            hint="偵測 ON / 自動下載 OFF"
            checked={isYoutube ? !!settings?.youtubeBackup : !!settings?.tiktokBackup}
            onChange={(value) =>
              onToggle(
                (isYoutube ? { youtubeBackup: value } : { tiktokBackup: value }) as Partial<SettingsT>,
                `${isYoutube ? "YouTube" : "TikTok"} 自動備份：${value ? "ON" : "OFF"}`,
              )
            }
          />
          <div className="mt-2 text-[11.5px] leading-6 text-[#B7BEC9]">
            {isYoutube
              ? "YouTube 為 SPA：Extension 以 URL change + MutationObserver + debounce 更新資訊。"
              : "Instagram 受平台限制時會顯示原因，不會嘗試繞過。"}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TaskList({
  items,
  emptyText,
  onAction,
  onDelete,
  showProgress = false,
  bare = false,
}: {
  items: DownloadT[];
  emptyText: string;
  onAction: (id: number, action: string) => void;
  onDelete: (id: number) => void;
  showProgress?: boolean;
  bare?: boolean;
}) {
  const body = (
    <div className="flex max-h-[540px] flex-col gap-2.5 overflow-y-auto">
      {items.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#B7BEC9]">{emptyText}</div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/12 bg-white/[0.03] p-3.5">
            <h4 className="mb-1.5 text-[13.5px] font-semibold break-all">{item.title}</h4>
            <div className="flex flex-wrap gap-3 text-[11.5px] text-[#B7BEC9]">
              <span
                className={`rounded-full border px-2 py-0.5 ${
                  item.status === "completed"
                    ? "border-[rgba(53,208,127,0.4)] text-[#35D07F]"
                    : ["failed", "missing", "interrupted"].includes(item.status)
                      ? "border-[rgba(255,77,95,0.4)] text-[#FF4D5F]"
                      : "border-white/12"
                }`}
              >
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <span>
                {item.fileType.toUpperCase()} · {item.format.toUpperCase()}
              </span>
              <span>{item.quality}</span>
              <span>{formatBytes(item.fileSize)}</span>
              <span>{new Date(item.createdAt).toLocaleString("zh-TW", { hour12: false })}</span>
              <span>{item.platform}</span>
              <span>{item.source === "extension" ? "來自 Extension" : "控制中心"}</span>
            </div>
            {item.filePath ? (
              <div className="mt-1 text-[11px] break-all text-[#6f7784]">{item.filePath}</div>
            ) : null}
            {item.errorMessage ? (
              <div className="mt-1 text-[11.5px] text-[#FF9AA4]">{item.errorMessage}</div>
            ) : null}
            {showProgress ? (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#35D07F] transition-all duration-300"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            ) : null}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {showProgress ? (
                <>
                  <Btn onClick={() => onAction(item.id, "pause")}>暫停</Btn>
                  <Btn onClick={() => onAction(item.id, "resume")}>繼續</Btn>
                  <Btn onClick={() => onAction(item.id, "cancel")}>取消</Btn>
                </>
              ) : (
                <>
                  {item.status !== "completed" ? <Btn onClick={() => onAction(item.id, "retry")}>重試</Btn> : null}
                  <Btn onClick={() => onAction(item.id, "missing")}>標記 File Missing</Btn>
                  <Btn variant="danger" onClick={() => onDelete(item.id)}>
                    刪除紀錄
                  </Btn>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
  return bare ? body : <Card title="Download Queue">{body}</Card>;
}

function SystemPage({
  settings,
  stats,
  logs,
  onToggle,
  onOpenReset,
}: {
  settings: SettingsT | null;
  stats: StatsT | null;
  logs: { id: number; level: string; event: string; message: string; createdAt: string }[];
  onToggle: (patch: Partial<SettingsT>, label?: string) => Promise<boolean>;
  onOpenReset: () => void;
}) {
  const [dir, setDir] = useState(settings?.downloadDirectory ?? "");
  useEffect(() => setDir(settings?.downloadDirectory ?? ""), [settings?.downloadDirectory]);

  return (
    <div className="grid gap-4">
      <Card title="系統需求 · Windows x64（64-bit）">
        <Field label="作業系統" value="Windows 10 / 11 64-bit（x64）；ARM64 以 x64 模擬執行" />
        <Field label="產出 EXE" value="AhYooVideoBackup.exe / AhYooNativeHost.exe / uninstall.exe 皆為 x64（PE Machine 0x8664）" />
        <Field label="打包用 Python" value="64-bit Python 3.10+（安裝檔名須含 amd64）" />
        <Field label="不支援" value="32-bit Windows（x86）：install.bat 與 打包.exe.bat 會直接中止" />
        <Field label="架構驗證" value="打包第 [7] 步執行 tools\\check_arch.py 讀 PE 標頭，非 64-bit 即打包失敗" />
        <div className="mt-3 text-[11.5px] leading-6 text-[#B7BEC9]">
          PyInstaller 產出的位元數跟隨當前 Python 直譯器，因此必須使用 64-bit Python 打包；
          完成後會輸出 dist\\BUILD_INFO.txt 記錄 Architecture / OS Arch / Python Arch / Build Time。
          Desktop App「系統」頁會顯示實際執行架構（例如 AMD64 · 64-bit），若偵測到 32-bit 會顯示警告而非假裝正常。
        </div>
      </Card>

      <Card title="系統 · 自動化影片備份">
        <Field label="狀態" value={(stats?.failed ?? 0) > 0 ? "🟠 有失敗任務" : "🟢 正常運作"} />
        <Field label="目標架構" value="x64（64-bit）" />
        <Field
          label="Extension / Desktop"
          value={settings?.desktopConnected ? "Connected" : "Disconnected"}
        />
        <Field label="Background Service" value="Running" />
        <Field label="下載位置" value={settings?.downloadDirectory || "（未設定，預設 阿柚自動影片備份/assets）"} />
        <Field label="佇列中" value={`${stats?.active ?? 0} 個任務`} />
        <Field label="版本" value={`v${settings?.version ?? "1.0"}`} />
      </Card>

      <Card title="設定">
        <Switch
          label="通知"
          hint="下載完成 / 失敗時顯示系統通知"
          checked={!!settings?.notifications}
          onChange={(value) => onToggle({ notifications: value })}
        />
        <Switch
          label="影片抓取"
          hint="關閉後 Extension 不會主動分析目前頁面的影片"
          checked={!!settings?.videoDetection}
          onChange={(value) => onToggle({ videoDetection: value })}
        />
        <Switch
          label="重啟自動開啟"
          hint="Windows 啟動後由官方 Run 機制常駐系統列（不自動開啟大視窗）"
          checked={!!settings?.autoStart}
          onChange={(value) => onToggle({ autoStart: value })}
        />
        <Switch
          label="Debug Mode"
          hint="顯示 Extension / Platform / Detection / Native Connection / Queue 除錯資訊"
          checked={!!settings?.debugMode}
          onChange={(value) => onToggle({ debugMode: value })}
        />
        <Switch
          label="Desktop App 已連線（模擬 Native Messaging 狀態）"
          hint="實際使用時由 native host handshake 自動設定"
          checked={!!settings?.desktopConnected}
          onChange={(value) => onToggle({ desktopConnected: value }, value ? "Desktop Connected" : "Desktop Offline")}
        />

        <div className="flex items-center justify-between gap-5 border-b border-white/5 py-3">
          <div className="text-[13.5px] font-semibold">下載模式</div>
          <select
            value={settings?.downloadMode ?? "ask"}
            onChange={(event) => onToggle({ downloadMode: event.target.value }, "下載模式已更新")}
            className="rounded-lg border border-white/12 bg-[#151a22] px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="ask">每次都要訪問下載位置</option>
            <option value="direct">直接下載</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-white/5 py-3">
          <div className="text-[13.5px] font-semibold">預設畫質</div>
          <select
            value={settings?.videoQuality ?? "720p"}
            onChange={(event) => onToggle({ videoQuality: event.target.value }, `畫質：${event.target.value}`)}
            className="rounded-lg border border-white/12 bg-[#151a22] px-2.5 py-1.5 text-[12.5px]"
          >
            {["1080p", "720p", "480p", "240p"].map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-white/5 py-3">
          <div className="text-[13.5px] font-semibold">同時下載數</div>
          <select
            value={String(settings?.maxConcurrent ?? 2)}
            onChange={(event) => onToggle({ maxConcurrent: Number(event.target.value) }, `同時下載數：${event.target.value}`)}
            className="rounded-lg border border-white/12 bg-[#151a22] px-2.5 py-1.5 text-[12.5px]"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 py-3">
          <input
            value={dir}
            onChange={(event) => setDir(event.target.value)}
            placeholder="D:\VideoBackup"
            className="flex-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[13px] outline-none focus:border-[rgba(53,208,127,0.5)]"
          />
          <Btn variant="primary" onClick={() => onToggle({ downloadDirectory: dir }, "下載位置已更新")}>
            設置下載位置
          </Btn>
        </div>
        <div className="text-[11.5px] leading-6 text-[#B7BEC9]">
          Desktop App 會於此位置自動建立 video\ 與 audio\ 兩個資料夾；在 Windows 上按「設置下載位置」會開啟原生 Folder Picker。
        </div>
      </Card>

      <Card title="↻ 重置" danger>
        <div className="text-[12px] leading-6 text-[#B7BEC9]">
          清除設定與下載紀錄，可選擇保留影片 / 音訊。刪除前會顯示二次確認並建立刪除清單。
        </div>
        <Btn variant="danger" className="mt-3" onClick={onOpenReset}>
          重置
        </Btn>
      </Card>

      <Card title="Logs">
        <pre className="max-h-56 overflow-auto rounded-xl bg-black/30 p-3 text-[11px] leading-6 whitespace-pre-wrap text-[#9aa3af]">
          {logs.length
            ? logs
                .map(
                  (line) =>
                    `${new Date(line.createdAt).toLocaleString("zh-TW", { hour12: false })} [${line.level.toUpperCase()}] ${line.event} ${line.message}`,
                )
                .join("\n")
            : "目前沒有日誌。"}
        </pre>
      </Card>
    </div>
  );
}

function ResetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [keepVideos, setKeepVideos] = useState(false);
  const [keepAudio, setKeepAudio] = useState(false);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setProgress("Processing... 建立刪除清單");
    const res = await api<{ removed: number; kept: number; failures: string[]; message: string }>("/api/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: true, keepVideos, keepAudio }),
    });
    setBusy(false);
    if (!res.ok) {
      setProgress(`× 重置失敗：${res.error ?? ""}`);
      toast("× 重置失敗", true);
      return;
    }
    setProgress(
      res.failures.length
        ? `部分檔案無法刪除（${res.failures.length} 個）：${res.failures.slice(0, 3).join("、")}`
        : `✓ 重置完成（刪除 ${res.removed} 筆 / 保留 ${res.kept} 筆）`,
    );
    toast("✓ 重置完成");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass fade-in w-[460px] !border-[rgba(255,77,95,0.35)] p-6">
        <h2 className="mb-4 text-center text-lg font-semibold">確定重置嗎？</h2>
        <div className="flex justify-center gap-6 text-[13px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={keepVideos} onChange={(e) => setKeepVideos(e.target.checked)} />
            保留影片
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} />
            保留音訊
          </label>
        </div>
        <div className="my-4 h-px bg-white/12" />
        <div className="mb-2.5 text-[13px] text-[#FF4D5F]">《重置後的後果》</div>
        {[
          "重置後你的電腦可能會暫時變慢，因為系統可能需要在背景清理大量已下載的影片與音訊檔案。",
          "如果勾選保留影片，影片不會刪除。如果勾選保留音訊，音訊不會刪除。",
          "設定也會恢復成預設值。",
        ].map((line) => (
          <p key={line} className="mb-2 text-[12.5px] leading-7 text-[#C9D0DA]">
            {line}
          </p>
        ))}
        <div className="mt-2 min-h-[18px] text-[12px] text-[#B7BEC9]">{progress}</div>
        <div className="mt-4 flex gap-2.5">
          <Btn variant="danger" className="flex-1" onClick={run} disabled={busy}>
            {busy ? "Removing..." : "確定"}
          </Btn>
          <Btn className="flex-1" onClick={onClose} disabled={busy}>
            取消
          </Btn>
        </div>
      </div>
    </div>
  );
}

function SourcePage() {
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ files: { path: string; size: number }[] }>("/api/source").then((res) => {
      if (res.ok) setFiles(res.files);
    });
  }, []);

  const open = async (path: string) => {
    setActive(path);
    setLoading(true);
    setContent("");
    const res = await api<{ content: string }>(`/api/source?file=${encodeURIComponent(path)}`);
    setLoading(false);
    setContent(res.ok ? res.content : `無法讀取檔案：${res.error ?? ""}`);
  };

  const groups = useMemo(() => {
    const map = new Map<string, { path: string; size: number }[]>();
    for (const file of files) {
      const top = file.path.split("/")[0];
      const list = map.get(top) ?? [];
      list.push(file);
      map.set(top, list);
    }
    return Array.from(map.entries());
  }, [files]);

  return (
    <div className="grid gap-4">
      <Card title="完整專案交付 · AhYooVideoBackup v1.0">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[13px] leading-7 text-[#C9D0DA]">
            共 {files.length} 個檔案：extension（Manifest V3）、desktop（Python + Tray + DownloadManager）、
            native-host（com.ahyoo.video_backup）、installer（install.bat / 打包.exe.bat / uninstall.bat / uninstall.exe）、docs。
            下載 ZIP 後在 64-bit Windows 執行「打包.exe.bat」即可產生 x64 的 AhYooVideoBackup.exe，再執行 install.bat 安裝。
            打包流程會用 tools/check_arch.py 驗證產物確實為 64-bit（PE Machine 0x8664），非 64-bit 直接判定失敗。
          </div>
          <a href="/api/source/zip" download>
            <Btn variant="primary">下載 ZIP</Btn>
          </a>
        </div>
      </Card>
      <div className="grid grid-cols-[280px_1fr] items-start gap-4">
        <Card title="檔案樹">
          <div className="max-h-[520px] overflow-y-auto pr-1">
            {groups.map(([group, items]) => (
              <div key={group} className="mb-3">
                <div className="mb-1 text-[11.5px] tracking-wide text-[#35D07F]">{group}/</div>
                {items.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => open(file.path)}
                    className={`block w-full truncate rounded-lg px-2 py-1 text-left text-[11.5px] transition-colors ${
                      active === file.path ? "bg-white/10 text-white" : "text-[#B7BEC9] hover:bg-white/5"
                    }`}
                    title={file.path}
                  >
                    {file.path.slice(group.length + 1) || file.path}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <Card title={active ?? "選擇左側檔案以檢視原始碼"}>
          <pre className="max-h-[520px] overflow-auto rounded-xl bg-black/35 p-4 text-[11.5px] leading-6 whitespace-pre text-[#C9D0DA]">
            {loading ? "Loading..." : content || "尚未選擇檔案。"}
          </pre>
        </Card>
      </div>
    </div>
  );
}

export default function ControlCenter() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  );
}
