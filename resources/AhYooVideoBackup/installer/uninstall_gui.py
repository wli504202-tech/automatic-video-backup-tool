"""
阿柚自動影片備份 - 解除安裝程式（Dark UI, tkinter）
不會在未確認的情況下刪除任何使用者影片。
"""
import json
import os
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import messagebox

INSTALL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "AhYooVideoBackup")
DATA_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "AhYooVideoBackup")
BG = "#0B0E13"
PANEL = "#141922"
GREEN = "#35D07F"
RED = "#FF4D5F"
TEXT = "#FFFFFF"
MUTED = "#B7BEC9"


def download_dir():
    try:
        with open(os.path.join(DATA_DIR, "config.json"), "r", encoding="utf-8") as handle:
            value = json.load(handle).get("downloadDirectory")
            if value:
                return value
    except (OSError, ValueError):
        pass
    return os.path.join(os.path.expanduser("~"), "Videos", "阿柚自動影片備份")


def rm(path, log):
    if not os.path.exists(path):
        return True
    try:
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=False)
        else:
            os.remove(path)
        log("已移除 " + path)
        return True
    except OSError as exc:
        log("[警告] 無法移除 %s（%s）" % (path, exc))
        return False


def run_quiet(args):
    try:
        subprocess.run(args, shell=True, capture_output=True, check=False)
    except OSError:
        pass


class App:
    def __init__(self, root):
        self.root = root
        root.title("解除安裝 阿柚自動影片備份 v1.0")
        root.configure(bg=BG)
        root.geometry("520x430")
        root.resizable(False, False)

        tk.Label(root, text="確定解除安裝阿柚自動影片備份嗎？", bg=BG, fg=TEXT,
                 font=("Microsoft JhengHei", 14, "bold")).pack(pady=(26, 14))

        box = tk.Frame(root, bg=PANEL, highlightbackground="#2A313C", highlightthickness=1)
        box.pack(padx=26, fill="x")
        self.keep_video = tk.BooleanVar(value=True)
        self.keep_audio = tk.BooleanVar(value=True)
        self.keep_config = tk.BooleanVar(value=False)
        for text, var in (("保留下載的影片", self.keep_video),
                          ("保留下載的音訊", self.keep_audio),
                          ("保留設定", self.keep_config)):
            tk.Checkbutton(box, text=text, variable=var, bg=PANEL, fg=TEXT, selectcolor=PANEL,
                           activebackground=PANEL, activeforeground=GREEN, anchor="w",
                           font=("Microsoft JhengHei", 10)).pack(fill="x", padx=16, pady=6)

        self.status = tk.Text(root, height=8, bg="#0E131A", fg=MUTED, bd=0,
                              font=("Consolas", 9), wrap="word")
        self.status.pack(padx=26, pady=16, fill="both", expand=True)
        self.log("下載位置：" + download_dir())

        actions = tk.Frame(root, bg=BG)
        actions.pack(pady=(0, 20))
        self.btn = tk.Button(actions, text="解除安裝", command=self.uninstall, bg=RED, fg="#fff",
                             bd=0, padx=24, pady=8, font=("Microsoft JhengHei", 10, "bold"))
        self.btn.pack(side="left", padx=8)
        tk.Button(actions, text="取消", command=root.destroy, bg="#222A35", fg=TEXT, bd=0,
                  padx=24, pady=8, font=("Microsoft JhengHei", 10)).pack(side="left", padx=8)

    def log(self, message):
        self.status.insert("end", message + "\n")
        self.status.see("end")
        self.root.update_idletasks()

    def uninstall(self):
        if not messagebox.askyesno("再次確認", "這個動作無法復原，確定要繼續嗎？"):
            return
        self.btn.config(state="disabled", text="Removing...")
        self.log("[1/6] 停止背景程式 / Tray ...")
        run_quiet(["taskkill", "/im", "AhYooVideoBackup.exe", "/f"])
        run_quiet(["taskkill", "/im", "AhYooNativeHost.exe", "/f"])

        self.log("[2/6] 移除開機啟動項目 ...")
        run_quiet(["reg", "delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                   "/v", "AhYooVideoBackup", "/f"])

        self.log("[3/6] 移除 Native Messaging Host ...")
        run_quiet(["reg", "delete", r"HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ahyoo.video_backup", "/f"])
        run_quiet(["reg", "delete", r"HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ahyoo.video_backup", "/f"])

        self.log("[4/6] 移除程式檔案 ...")
        rm(INSTALL_DIR, self.log)

        self.log("[5/6] 處理下載檔案 ...")
        base = download_dir()
        if self.keep_video.get():
            self.log("保留影片：" + os.path.join(base, "video"))
        else:
            rm(os.path.join(base, "video"), self.log)
        if self.keep_audio.get():
            self.log("保留音訊：" + os.path.join(base, "audio"))
        else:
            rm(os.path.join(base, "audio"), self.log)

        self.log("[6/6] 處理設定與紀錄 ...")
        if self.keep_config.get():
            self.log("保留設定：" + DATA_DIR)
        else:
            rm(DATA_DIR, self.log)

        self.log("解除安裝完成。請至 chrome://extensions 手動移除擴充功能。")
        self.btn.config(text="完成", state="normal", command=self.root.destroy, bg=GREEN, fg="#08120C")


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("解除安裝程式錯誤：%s" % exc)
        sys.exit(1)
