import {
  detectPlatform,
  formatBytes,
  isAllowedVideoUrl,
  tiktokId,
  writeLog,
  youtubeId,
} from "@/lib/core";

export const dynamic = "force-dynamic";

const BITRATE_KBPS: Record<string, number> = {
  "1080p": 4200,
  "720p": 2400,
  "480p": 1100,
  "240p": 420,
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "未知";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "AhYooVideoBackup/1.0 (+control-center)" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 盡力取得 YouTube 公開頁面中的 lengthSeconds（公開中繼資料，不繞過任何限制） */
async function youtubeDuration(id: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"lengthSeconds":"(\d+)"/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { url?: string; quality?: string };
  try {
    body = (await request.json()) as { url?: string; quality?: string };
  } catch {
    return Response.json({ ok: false, error: "無效的 JSON" }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  const quality = body.quality ?? "720p";

  if (!isAllowedVideoUrl(url)) {
    return Response.json(
      {
        ok: false,
        error: "無法取得影片資訊",
        reasons: [
          "網址不是支援的平台（YouTube / TikTok / Instagram）",
          "網址格式錯誤或尚未載入完成",
        ],
      },
      { status: 400 },
    );
  }

  const platform = detectPlatform(url);
  await writeLog("VIDEO_DETECT", `${platform} ${url}`);

  if (platform === "youtube") {
    const id = youtubeId(url);
    if (!id) {
      return Response.json(
        { ok: false, error: "無法取得影片資訊", reasons: ["網址中沒有影片 ID"] },
        { status: 400 },
      );
    }
    const oembed = await fetchJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${id}`,
      )}&format=json`,
    );
    if (!oembed) {
      return Response.json(
        {
          ok: false,
          error: "無法取得影片資訊",
          reasons: [
            "影片不公開、已刪除或不允許嵌入",
            "平台頁面結構發生變更",
            "網路連線失敗",
          ],
        },
        { status: 502 },
      );
    }
    const seconds = await youtubeDuration(id);
    const bitrate = BITRATE_KBPS[quality] ?? BITRATE_KBPS["720p"];
    const estimated = seconds ? (seconds * bitrate * 1000) / 8 : 0;
    return Response.json({
      ok: true,
      video: {
        platform: "youtube",
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        title: String(oembed.title ?? "未命名影片"),
        author: String(oembed.author_name ?? ""),
        thumbnail: String(
          oembed.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        ),
        duration: formatDuration(seconds ?? 0),
        durationSeconds: seconds ?? 0,
        sizeLabel: estimated
          ? `約 ${formatBytes(estimated)}（${quality} 估算）`
          : "未知（Desktop App 解析後回報實際大小）",
        sizeBytes: Math.round(estimated),
        quality,
      },
    });
  }

  if (platform === "tiktok") {
    const oembed = await fetchJson(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    );
    if (!oembed) {
      return Response.json(
        {
          ok: false,
          error: "無法取得影片資訊",
          reasons: [
            "TikTok 影片為私人或已刪除",
            "平台頁面結構發生變更",
            "網路連線失敗",
          ],
        },
        { status: 502 },
      );
    }
    const id = tiktokId(String(oembed.embed_product_id ?? "")) ?? tiktokId(url);
    return Response.json({
      ok: true,
      video: {
        platform: "tiktok",
        id: id ?? String(oembed.embed_product_id ?? ""),
        url,
        embedUrl: id
          ? `https://www.tiktok.com/embed/v2/${id}`
          : `https://www.tiktok.com/embed/v2/${String(oembed.embed_product_id ?? "")}`,
        title: String(oembed.title ?? "TikTok 影片"),
        author: String(oembed.author_name ?? ""),
        thumbnail: String(oembed.thumbnail_url ?? ""),
        duration: "未知",
        durationSeconds: 0,
        sizeLabel: "未知",
        sizeBytes: 0,
        quality,
      },
    });
  }

  return Response.json(
    {
      ok: false,
      error: "Instagram 目前無法取得影片資訊",
      reasons: [
        "Instagram 官方 oEmbed 需要應用程式權杖，本工具不繞過平台限制",
        "只能處理你自己擁有或平台明確允許保存的公開內容",
        "可改用 Instagram 官方「下載你的資訊」功能取得自己的影片",
      ],
    },
    { status: 501 },
  );
}
