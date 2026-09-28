"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

export function Card({
  title,
  children,
  className = "",
  danger = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`glass p-5 ${danger ? "!border-[rgba(255,77,95,0.3)]" : ""} ${className}`}
    >
      {title ? (
        <div className="mb-3 text-[11.5px] tracking-[1px] text-[#B7BEC9]">{title}</div>
      ) : null}
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/5 py-3 last:border-b-0">
      <div>
        <div className="text-[13.5px] font-semibold">{label}</div>
        {hint ? <div className="mt-1 text-xs leading-6 text-[#B7BEC9]">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-[25px] w-[46px] shrink-0 rounded-full transition-all duration-200 ${
          checked ? "bg-[#35D07F]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-[3px] h-[19px] w-[19px] rounded-full transition-all duration-200 ${
            checked ? "left-[24px] bg-[#08120C]" : "left-[3px] bg-[#E8ECF1]"
          }`}
        />
      </button>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? "bg-[#35D07F] text-[#08120C] font-semibold hover:bg-[#41e08c] border-transparent"
      : variant === "danger"
        ? "bg-[rgba(255,77,95,0.14)] text-[#FF9AA4] border-[rgba(255,77,95,0.4)] hover:bg-[rgba(255,77,95,0.25)] hover:text-white"
        : "bg-white/5 text-white border-white/12 hover:bg-white/15";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-2 text-[12.5px] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 text-[13px] last:border-b-0">
      <span className="text-[#B7BEC9]">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

export function Dot({ state }: { state: "on" | "off" | "idle" }) {
  const color =
    state === "on"
      ? "bg-[#35D07F] shadow-[0_0_0_3px_rgba(53,208,127,0.16)]"
      : state === "off"
        ? "bg-[#FF4D5F] shadow-[0_0_0_3px_rgba(255,77,95,0.14)]"
        : "bg-[#5a626d]";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

type Toast = { id: number; text: string; error?: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, error }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`fade-in glass px-4 py-2.5 text-[13px] ${
              toast.error ? "!border-[rgba(255,77,95,0.5)] text-[#FFB4BC]" : ""
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const STATUS_LABEL: Record<string, string> = {
  waiting: "等待中",
  fetching: "抓取中",
  preparing: "準備下載",
  downloading: "下載中",
  paused: "已暫停",
  completed: "完成",
  failed: "失敗",
  cancelled: "取消",
  interrupted: "Interrupted",
  missing: "File Missing",
};
