(function () {
  "use strict";
  const { PlatformAdapter, registerAdapter } = window.AhYoo;

  /**
   * Instagram：只處理明確支援的公開影片頁 (/reel/, /p/, /tv/)。
   * 平台限制導致無法取得資訊時，直接顯示原因，不做任何破解。
   */
  class InstagramAdapter extends PlatformAdapter {
    constructor() { super("instagram"); }

    canHandle(url) {
      try { return new URL(url).hostname.toLowerCase().endsWith("instagram.com"); }
      catch (_) { return false; }
    }

    shortcode() {
      const match = location.pathname.match(/\/(reel|reels|p|tv)\/([^/]+)/);
      return match ? match[2] : null;
    }

    detectVideo() {
      return !!this.shortcode() && !!PlatformAdapter.q("video");
    }

    getTitle() {
      const meta = PlatformAdapter.q('meta[property="og:title"]');
      if (meta && meta.content) return meta.content.slice(0, 120);
      const code = this.shortcode();
      return code ? "Instagram " + code : null;
    }

    getDuration() {
      const media = PlatformAdapter.q("video");
      if (media && Number.isFinite(media.duration) && media.duration > 0) {
        return PlatformAdapter.formatDuration(media.duration);
      }
      return null;
    }

    getThumbnail() {
      const meta = PlatformAdapter.q('meta[property="og:image"]');
      return meta && meta.content ? meta.content : null;
    }

    getVideoUrl() {
      const code = this.shortcode();
      const type = (location.pathname.match(/\/(reel|reels|p|tv)\//) || [])[1] || "p";
      return code ? "https://www.instagram.com/" + type + "/" + code + "/" : location.href;
    }

    estimateSize() { return null; } // Instagram 不提供可靠大小 → 顯示「未知」
  }

  registerAdapter(new InstagramAdapter());
})();
