import type { ReactNode } from "react";

const features = [
  {
    title: "一鍵下載",
    text: "支援 YouTube / TikTok 等熱門平台，從影片資訊偵測到批次備份，一鍵完成實作。",
    tag: "Smart Capture",
  },
  {
    title: "高畫質轉檔",
    text: "內建 ffmpeg，將影片與音訊轉成穩定可保存格式，保留高畫質與清晰聲質。",
    tag: "4K Ready",
  },
  {
    title: "自動備份",
    text: "可設定自動備份、排程任務、重試恢復，避免手動下載導致的遺失風險。",
    tag: "Auto Sync",
  },
  {
    title: "瀏覽器整合",
    text: "透過 Chrome / Edge 擴充功能與 Native Messaging，讓下載流程無縫接軌桌面端。",
    tag: "Native Bridge",
  },
];

const stats = [
  { value: "1 click", label: "即刻備份" },
  { value: "Win x64", label: "完整支援" },
  { value: "99%", label: "穩定運行" },
  { value: "24/7", label: "自動化執行" },
];

const steps = [
  "下載安裝包",
  "執行三步驟安裝",
  "啟動擴充功能與備份",
];

function FeatureCard({ title, text, tag }: { title: string; text: string; tag: string }) {
  return (
    <article className="feature-card">
      <span className="feature-tag">{tag}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default function Page() {
  return (
    <main className="ahyoo-landing">
      <div className="bg-orb orb-one" />
      <div className="bg-orb orb-two" />
      <header className="topbar">
        <div className="brand" aria-label="AHYOO VIDEO BACKUP Brand">
          <span className="brand-mark">A</span>
          <span>AHYOO VIDEO BACKUP</span>
        </div>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#features">功能</a>
          <a href="#workflow">安裝</a>
          <a href="#about">關於</a>
        </nav>
        <button className="primary-btn">立即體驗</button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Chrome / Edge + Native Messaging</p>
          <h1>
            阿柚自動影片備份
            <span>AHYOO VIDEO BACKUP</span>
          </h1>
          <p className="lead">
            將常見影片與音訊下載需求，變成簡單、穩定、可自動化執行的工作流程。從發現內容到備份完成，
            全程幾乎不用多餘操作。
          </p>

          <div className="cta-row">
            <button className="primary-btn">立即下載</button>
            <button className="ghost-btn">看功能介紹</button>
          </div>

          <div className="stats-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="stat-item">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-label="Product showcase">
          <div className="screen-window">
            <div className="window-bar">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>

            <div className="screen-body">
              <div className="panel-grid">
                <div className="panel large-panel">
                  <div className="mini-label">今日備份</div>
                  <div className="progress-wrap">
                    <div className="progress-bar">
                      <span className="fill" />
                    </div>
                  </div>
                  <div className="video-card">
                    <div className="video-thumb" />
                    <div>
                      <strong>Music Session</strong>
                      <small>1080p · 4.8 GB</small>
                    </div>
                  </div>
                </div>

                <div className="panel metrics-panel">
                  <div className="metric-row">
                    <span>影片</span>
                    <strong>128</strong>
                  </div>
                  <div className="metric-row">
                    <span>音訊</span>
                    <strong>86</strong>
                  </div>
                  <div className="metric-row">
                    <span>容量</span>
                    <strong>1.2 TB</strong>
                  </div>
                </div>
              </div>

              <div className="bottom-row">
                <div className="signal-box">
                  <span className="signal-dot" />
                  <div>
                    <small>系統狀態</small>
                    <strong>線上備份中</strong>
                  </div>
                </div>
                <div className="signal-box glow-box">
                  <small>保留品質</small>
                  <strong>HD / MP3</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="floating-card card-top">
            <span className="chip">Auto Backup</span>
            <strong>連續下載</strong>
          </div>

          <div className="floating-card card-bottom">
            <span className="chip success">Ready</span>
            <strong>Windows x64</strong>
          </div>
        </div>
      </section>

      <section id="features" className="feature-section">
        <div className="section-head">
          <p className="eyebrow">核心功能</p>
          <h2>從「抓取」到「保存」，一站完成</h2>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="section-head narrow">
          <p className="eyebrow">簡單流程</p>
          <h2>三步驟就能開始使用</h2>
        </div>

        <div className="steps">
          {steps.map((step, index) => (
            <div key={step} className="step-item">
              <span className="step-index">0{index + 1}</span>
              <h3>{step}</h3>
              <p>
                {index === 0 && "下載專屬安裝包，依照提示完成系統與依賴準備。"}
                {index === 1 && "執行步驟 1～3 的自動化安裝腳本，快速布署完成。"}
                {index === 2 && "啟動瀏覽器擴充功能，立即開始影片與音訊的備份工作。"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="cta-section">
        <div className="cta-panel">
          <div>
            <p className="eyebrow">Built for creators</p>
            <h2>讓每一次下載都變得更輕鬆、更可靠</h2>
          </div>
          <button className="primary-btn">下載試用</button>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "阿柚自動影片備份 | AHYOO VIDEO BACKUP",
    description: "一個高質感的宣傳頁面，介紹阿柚自動影片備份工具的功能、流程與高級備份體驗。",
  };
}

export function PageShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
