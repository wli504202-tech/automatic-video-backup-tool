(function () {
  "use strict";
  const { PlatformAdapter, registerAdapter, BITRATE_KBPS } = window.AhYoo;

  class YouTubeAdapter extends PlatformAdapter {
    constructor() { super("youtube"); }

    canHandle(url) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith("youtube.com") || host === "youtu.be";
      } catch (_) { return false; }
    }

    videoId() {
      try {
        const u = new URL(location.href);
        if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
        return u.searchParams.get("v");
      } catch (_) { return null; }
    }

    detectVideo() {
      const hasId = !!this.videoId();
      const media = PlatformAdapter.q("video.html5-main-video, video");
      return hasId && !!media;
    }

    getTitle() {
      const el =
        PlatformAdapter.q("h1.ytd-watch-metadata yt-formatted-string") ||
        PlatformAdapter.q("h1.title yt-formatted-string") ||
        PlatformAdapter.q("#title h1") ||
        PlatformAdapter.q('meta[name="title"]');
      if (el) {
        const value = (el.content || el.textContent || "").trim();
        if (value) return value;
      }
      const docTitle = document.title.replace(/ - YouTube$/, "").trim();
      return docTitle || null;
    }

    getDuration() {
      const media = PlatformAdapter.q("video.html5-main-video, video");
      if (media && Number.isFinite(media.duration) && media.duration > 0) {
        return PlatformAdapter.formatDuration(media.duration);
      }
      const label = PlatformAdapter.text(".ytp-time-duration");
      return label || null;
    }

    durationSeconds() {
      const media = PlatformAdapter.q("video.html5-main-video, video");
      if (media && Number.isFinite(media.duration) && media.duration > 0) return media.duration;
      return 0;
    }

    getThumbnail() {
      const id = this.videoId();
      return id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : null;
    }

    getVideoUrl() {
      const id = this.videoId();
      return id ? "https://www.youtube.com/watch?v=" + id : location.href;
    }

    estimateSize(quality) {
      const seconds = this.durationSeconds();
      if (!seconds) return null;
      const kbps = BITRATE_KBPS[quality] || BITRATE_KBPS["720p"];
      return Math.round((seconds * kbps * 1000) / 8);
    }
  }

  registerAdapter(new YouTubeAdapter());
})();
