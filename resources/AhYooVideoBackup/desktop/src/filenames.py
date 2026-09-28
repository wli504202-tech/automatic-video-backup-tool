"""Windows 檔名清理與衝突處理。"""
import os
import re

INVALID = r'[\\/:*?"<>|]'
RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *{"COM%d" % i for i in range(1, 10)},
    *{"LPT%d" % i for i in range(1, 10)},
}


def sanitize(name: str, max_length: int = 120) -> str:
    name = (name or "untitled").strip()
    name = name.replace(":", " - ")
    name = re.sub(INVALID, "-", name)
    name = re.sub(r"[\x00-\x1f]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name.strip("-. ")
    if name.upper() in RESERVED:
        name = "_" + name
    if len(name) > max_length:
        name = name[:max_length].strip()
    return name or "untitled"


def unique_path(path: str) -> str:
    """建立副本：Example.mp4 → Example (1).mp4"""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    index = 1
    while True:
        candidate = "%s (%d)%s" % (base, index, ext)
        if not os.path.exists(candidate):
            return candidate
        index += 1
