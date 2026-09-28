(function () {
  "use strict";
  const { PlatformAdapter, registerAdapter, BITRATE_KBPS } = window.AhYoo;

  class TikTokAdapter extends PlatformAdapter {
    constructor() { super("tiktok"); }

    canHandle(url) {
      try { return new URL(url).hostname.toLowerCase().endsWith("tiktok.com"); }
      catch (_) { return false; }
    }

    videoId() {
      const match = location.pathname.match(/\/video\/(\d+)/) ||
                    location.pathname.match(/\/v\/(\d+)/);
      if (match) return match[1];
      const active = PlatformAdapter.q('div[data-e2e="feed-video"] a[href*="/video/"]');
      if (active && active.href) {
        const m = active.href.match(/\/video\/(\d+)/);
        if (m) return m[1];
      }
      return null;
    }

    detectVideo() {
      // 支援 /@user/video/xxx 與 /watch 類型頁面；DOM 改變時失敗安全
      return !!this.videoId() && !!PlatformAdapter.q("video");
    }

    getTitle() {
      const desc =
        PlatformAdapter.text('div[data-e2e="browse-video-desc"]') ||
        PlatformAdapter.text('div[data-e2e="video-desc"]') ||
        PlatformAdapter.text('h1[data-e2e="browse-video-desc"]');
      if (desc) return desc.slice(0, 120);
      const meta = PlatformAdapter.q('meta[property="og:title"]');
      if (meta && meta.content) return meta.content.slice(0, 120);
      return document.title ? document.title.slice(0, 120) : null;
    }

    getDuration() {
      const media = PlatformAdapter.q("video");
      if (media && Number.isFinite(media.duration) && media.duration > 0) {
        return PlatformAdapter.formatDuration(media.duration);
      }
      return null; // 取不到就顯示「未知」，不要顯示錯誤資料
    }

    getThumbnail() {
      const meta = PlatformAdapter.q('meta[property="og:image"]');
      return meta && meta.content ? meta.content : null;
    }

    getVideoUrl() {
      const id = this.videoId();
      if (!id) return location.href;
      const user = (location.pathname.match(/\/@([^/]+)/) || [])[1];
      return user
        ? "https://www.tiktok.com/@" + user + "/video/" + id
        : location.href;
    }

    estimateSize(quality) {
      const media = PlatformAdapter.q("video");
      const seconds = media && Number.isFinite(media.duration) ? media.duration : 0;
      if (!seconds) return null;
      const kbps = BITRATE_KBPS[quality] || BITRATE_KBPS["720p"];
      return Math.round((seconds * kbps * 1000) / 8);
    }
  }

  registerAdapter(new TikTokAdapter());
})();
