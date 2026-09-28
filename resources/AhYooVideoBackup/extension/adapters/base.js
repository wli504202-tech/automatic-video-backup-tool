/**
 * PlatformAdapter 基底類別 + 註冊表
 * 所有平台邏輯都在各自的 adapter，不寫死在單一巨大 JS。
 */
(function () {
  "use strict";

  class PlatformAdapter {
    constructor(name) {
      this.name = name;
    }
    /** @param {string} url */
    canHandle(url) { return false; }
    /** @returns {boolean} 目前頁面是否為可處理的影片頁 */
    detectVideo() { return false; }
    getTitle() { return null; }
    getDuration() { return null; }
    getThumbnail() { return null; }
    getVideoUrl() { return location.href; }
    /** 可選：回傳估算大小(bytes)，不確定就回 null，不要假裝知道 */
    estimateSize(_quality) { return null; }

    /** 共用工具：秒數 → mm:ss / h:mm:ss */
    static formatDuration(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const pad = (n) => String(n).padStart(2, "0");
      return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
    }

    /** 共用工具：安全查詢，DOM 改變時不拋錯 */
    static q(selector, root) {
      try { return (root || document).querySelector(selector); } catch (_) { return null; }
    }

    static text(selector, root) {
      const el = PlatformAdapter.q(selector, root);
      if (!el) return null;
      const value = (el.textContent || "").trim();
      return value || null;
    }
  }

  const registry = [];

  window.AhYoo = window.AhYoo || {};
  window.AhYoo.PlatformAdapter = PlatformAdapter;
  window.AhYoo.registerAdapter = function (adapter) { registry.push(adapter); };
  window.AhYoo.resolveAdapter = function (url) {
    for (const adapter of registry) {
      try {
        if (adapter.canHandle(url)) return adapter;
      } catch (_) { /* adapter 失敗安全 */ }
    }
    return null;
  };
  window.AhYoo.BITRATE_KBPS = { "1080p": 4200, "720p": 2400, "480p": 1100, "240p": 420 };
})();
