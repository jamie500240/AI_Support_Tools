# ==========================================================
# MODULE:      Utils_HiddenCharChecker (完全沒有經過任何調教，直接從 Claude 手上拿到的版本)
# PURPOSE:     貼上程式碼／文字前的隱形字元檢查工具。專門抓出網頁複製時
#              常見、肉眼看不出來但會讓 Python 直譯器報錯的特殊空白字元
#              （不斷行空格、全形空格、零寬字元、UTF-8 BOM）。
# EXPORTS:     scan_file, clean_and_save
# IMPORTS:     tkinter, pathlib, unicodedata
# FORBIDDEN:   禁止直接覆寫原檔；清理後一律另存新檔，原檔保持不動
# VERSION:     0.0.0 [Stability: Experimental]
# ==========================================================
#
# 【給新手的說明】
# 為什麼需要這個工具？
# 從網頁、Word、某些筆記軟體複製文字貼到程式碼編輯器時，常常會夾帶一種
# 叫做「不斷行空格」(U+00A0) 的特殊字元。它在螢幕上長得跟一般空格一模
# 一樣，肉眼完全分辨不出來，但 Python 直譯器不認得它，貼上去執行時就
# 會直接報 SyntaxError，讓人摸不著頭緒——這支工具就是用來抓出這種問題。
#
# 怎麼用？
# 直接執行這支程式，跳出視窗選擇你要檢查的檔案（通常是 .py，但任何純
# 文字檔都可以檢查），它會告訴你有沒有問題，有問題的話會問你要不要
# 自動清理並另存一份乾淨的版本（不會動到你的原始檔案）。

import tkinter as tk
import unicodedata
from pathlib import Path
from tkinter import filedialog, messagebox

# ==========================================
# 1. CONFIG - 這裡列出所有要抓的可疑字元
# ==========================================
# 每一項是 (字元, 替換成什麼, 給人看的說明)
# 替換成 None 代表「直接刪除」，替換成字串代表「替換成這個字元」
SUSPICIOUS_CHARS = [
    ("\ufeff", None, "UTF-8 BOM（檔案開頭的隱形記號，常見於 Windows 記事本另存的檔案）"),
    ("\u00a0", " ", "不斷行空格 U+00A0（網頁複製最常見的兇手，長得跟空格一樣）"),
    ("\u3000", " ", "全形空格 U+3000（中文網頁排版常見）"),
    ("\u200b", None, "零寬空格 U+200B（完全看不見，常見於某些網頁編輯器）"),
    ("\u200c", None, "零寬非連字 U+200C"),
    ("\u200d", None, "零寬連字 U+200D"),
    ("\u202f", " ", "窄不斷行空格 U+202F"),
]


def scan_file(file_path: Path) -> list:
    """
    掃描檔案，回傳所有發現的可疑字元清單。
    每筆紀錄包含：行號、字元的 Unicode 編碼、字元名稱。
    """
    raw = file_path.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8")

    findings = []
    if has_bom:
        findings.append((0, "U+FEFF", "檔案開頭 UTF-8 BOM"))

    for i, ch in enumerate(text):
        for target_char, _, description in SUSPICIOUS_CHARS:
            if ch == target_char and target_char != "\ufeff":  # BOM 已經另外處理過
                line_no = text[:i].count("\n") + 1
                code_point = f"U+{ord(ch):04X}"
                findings.append((line_no, code_point, description))

    return findings


def clean_text(text: str) -> str:
    """依照 SUSPICIOUS_CHARS 表格，把所有可疑字元替換或刪除，回傳乾淨的文字"""
    for target_char, replacement, _ in SUSPICIOUS_CHARS:
        if replacement is None:
            text = text.replace(target_char, "")
        else:
            text = text.replace(target_char, replacement)
    return text


def clean_and_save(file_path: Path) -> Path:
    """
    讀取原始檔案、清除所有可疑字元、另存成新檔案（不覆蓋原檔）。
    回傳新檔案的路徑。
    """
    raw = file_path.read_bytes()
    # 先去除 BOM（如果有的話），再解碼
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8")

    cleaned = clean_text(text)

    new_path = file_path.with_name(f"{file_path.stem}_已清理{file_path.suffix}")
    new_path.write_text(cleaned, encoding="utf-8")
    return new_path


def main():
    root = tk.Tk()
    root.withdraw()

    print("========================================")
    print("   隱形字元檢查器 v0.0.0")
    print("========================================")
    print("請選擇要檢查的檔案（例如貼上去、準備存檔的 .py 或 .json）")

    file_path_str = filedialog.askopenfilename(
        title="選擇要檢查的檔案",
        filetypes=[("所有檔案", "*.*"), ("Python 檔案", "*.py"), ("JSON 檔案", "*.json")],
    )
    root.destroy()

    if not file_path_str:
        print("[資訊] 未選擇檔案，程式結束。")
        return

    file_path = Path(file_path_str)

    try:
        findings = scan_file(file_path)
    except UnicodeDecodeError as e:
        print(f"[錯誤] 檔案編碼異常，無法以 UTF-8 讀取：{e}")
        return

    if not findings:
        print(f"\n✅ 檢查完成：{file_path.name} 乾淨，未發現任何隱形字元問題。")
        return

    print(f"\n⚠️ 發現 {len(findings)} 個可疑字元：")
    for line_no, code_point, description in findings:
        location = f"檔案開頭" if line_no == 0 else f"第 {line_no} 行"
        print(f"  {location}｜{code_point}｜{description}")

    choice = input("\n是否要自動清理並另存一份乾淨的版本？(Y/N): ").strip().upper()
    if choice == "Y":
        new_path = clean_and_save(file_path)
        print(f"\n✅ 已清理完成，新檔案已儲存為：{new_path.name}")
        print(f"📄 原始檔案未被更動，你可以比對兩份檔案確認差異後再決定是否取代。")
    else:
        print("\n[終止] 未進行清理，原始檔案保持不變。")


if __name__ == "__main__":
    main()
