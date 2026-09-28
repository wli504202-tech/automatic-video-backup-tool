"""
驗證產出的 EXE 是否為 64-bit（讀取 PE 標頭的 Machine 欄位）。
用法：python tools\\check_arch.py dist\\AhYooVideoBackup.exe [more.exe ...]
離開碼 0 = 全部 64-bit；1 = 有非 64-bit 或無法檢查的檔案。
"""
import os
import struct
import sys

MACHINE = {
    0x014C: ("x86", 32),
    0x8664: ("x64", 64),
    0xAA64: ("ARM64", 64),
    0x01C4: ("ARM", 32),
}


def pe_machine(path):
    """回傳 (名稱, 位元數)；讀取失敗時回傳 None。"""
    try:
        with open(path, "rb") as handle:
            if handle.read(2) != b"MZ":
                return None
            handle.seek(0x3C)
            offset_bytes = handle.read(4)
            if len(offset_bytes) < 4:
                return None
            offset = struct.unpack("<I", offset_bytes)[0]
            handle.seek(offset)
            if handle.read(4) != b"PE\0\0":
                return None
            machine_bytes = handle.read(2)
            if len(machine_bytes) < 2:
                return None
            machine = struct.unpack("<H", machine_bytes)[0]
    except OSError:
        return None
    return MACHINE.get(machine, ("0x%04X" % machine, 0))


def main(argv):
    targets = list(argv[1:])
    if not targets:
        print("用法：python tools\\check_arch.py <exe> [exe ...]")
        return 1

    failed = False
    checked = 0
    for path in targets:
        if not os.path.isfile(path):
            # uninstall.exe 為選用產物，缺少時只提示，不視為失敗
            print("  [略過] 找不到 %s" % path)
            continue
        info = pe_machine(path)
        checked += 1
        if info is None:
            print("  [錯誤] %s 不是有效的 PE 檔案" % path)
            failed = True
            continue
        name, bits = info
        if bits == 64:
            print("  [OK]   %-26s %s (64-bit)" % (os.path.basename(path), name))
        else:
            print("  [錯誤] %-26s %s (%d-bit) → 需要 64-bit" % (os.path.basename(path), name, bits))
            failed = True

    if checked == 0:
        print("  [錯誤] 沒有任何可檢查的 EXE")
        return 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
