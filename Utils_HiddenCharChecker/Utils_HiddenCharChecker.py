"""
==========================================================
MODULE:       Script_AICodeSanitizer
PURPOSE:      AI 產生程式碼 / 文件清洗工具。

              功能：
              - 清除 AI 複製造成的隱形字元與 BOM
              - 精準白名單移除 Markdown Code Fence
              - Python 縮排與空白標準化
              - 支援檔案 / 剪貼簿 / CLI 操作
              - 結構化 CleaningReport 狀態回報
EXPORTS:      clean_file, sanitize_clipboard, sanitize_python, sanitize_text,
              ask_file_path
IMPORTS:      argparse, dataclasses, hashlib, pathlib, typing, tkinter(optional)
FORBIDDEN:    禁止直接覆寫使用者原始檔案；清理結果一律另存新檔，原檔保持不動
DEPENDENCIES: 剪貼簿功能（MODE 4）依賴系統已安裝 Tkinter，未安裝時該功能停用
              但檔案模式（MODE 1-3）不受影響
VERSION:      1.0.1 [Stability: Experimental]
==========================================================
"""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

# ==========================================================
# 模組識別資訊單一化（ACDS v2.3 第七章 / ADR-004）
# 全檔案唯一版本號來源，禁止在其他任何地方重複手動輸入字面值
# ==========================================================
__MODULE_NAME__: Final[str] = "Script_AICodeSanitizer"
__VERSION__: Final[str] = "1.0.1"


# Tkinter 支援檢測（剪貼簿操作 + 檔案選取視窗皆依賴此模組）
# 注意：Final 變數僅宣告一次，兩個分支各自賦值，避免 mypy 對同一 Final
# 變數在不同分支重複型別宣告產生警告
HAS_TK: Final[bool]
try:
    import tkinter as tk
    from tkinter import filedialog
    HAS_TK = True
except ImportError:
    HAS_TK = False


# ==========================================================
# CONFIG & SETTING & MAPPING (純設定與對照)
# ==========================================================

# 注意：此數值為本工具的「換算策略預設值」，非 Python Lexer 的物理 Tab Stop 規則
TAB_WIDTH_ASSUMPTION: Final[int] = 4

# AI 常見複製污染字元與對應替換字元 (SSOT)
INVISIBLE_CHARS: Final[dict[str, str | None]] = {
    "\ufeff": None,      # UTF-8 BOM
    "\u200b": None,      # Zero Width Space
    "\u200c": None,      # Zero Width Non Joiner
    "\u200d": None,      # Zero Width Joiner
    "\u00a0": " ",       # Non Breaking Space
    "\u202f": " ",       # Narrow NBSP
    "\u2000": " ",       # En Quad
    "\u2001": " ",       # Em Quad
    "\u2002": " ",       # En Space
    "\u2003": " ",       # Em Space
    "\u2004": " ",       # Three-per-em Space
    "\u2005": " ",       # Four-per-em Space
    "\u2006": " ",       # Six-per-em Space
    "\u2007": " ",       # Figure Space
    "\u2008": " ",       # Punctuation Space
    "\u2009": " ",       # Thin Space
    "\u200a": " ",       # Hair Space
}

# 允許移除的 Markdown Code Fence 開頭白名單 (SSOT 自動修飾為小寫)
CODE_FENCE_MARKERS: Final[set[str]] = {
    marker.lower()
    for marker in {
        "```",
        "```python",
        "```py",
        "```text",
        "```bash",
        "```json",
    }
}

# 模式與副檔名對照表
PYTHON_EXTENSIONS: Final[set[str]] = {".py", ".pyw"}


# ==========================================================
# REPORTING MODEL (結構化報告)
# ==========================================================

@dataclass
class CleaningReport:
    """處理結果與統計報表數據結構。"""
    mode_name: str
    original_size: int
    cleaned_size: int
    warnings: list[str] = field(default_factory=list)
    output_path: Path | None = None
    is_dry_run: bool = False

    @property
    def changed(self) -> bool:
        return self.original_size != self.cleaned_size

    def print_summary(self) -> None:
        """格式化輸出摘要報表。"""
        status_title = "DRY-RUN REPORT" if self.is_dry_run else "CLEANING REPORT"
        print(f"\n======== {status_title} ========")
        print(f"Mode         : {self.mode_name}")
        print(f"Original Size: {self.original_size} chars")
        print(f"Cleaned Size : {self.cleaned_size} chars")
        print(f"Difference   : {self.cleaned_size - self.original_size} chars")
        print(f"Content Changed: {'Yes' if self.changed else 'No'}")

        if self.output_path:
            print(f"Output File  : {self.output_path.name}")
        elif self.is_dry_run:
            print("Output File  : (None - Dry Run)")

        if self.warnings:
            print("\nWarnings / Notices:")
            for w in self.warnings:
                print(f"  - {w}")
        print("=================================\n")


# ==========================================================
# TOOLS: CLEANING CORE ENGINE (純演算工具)
# ==========================================================

def normalize_newline(text: str) -> str:
    """統一換行格式為 LF (\n)。"""
    if not isinstance(text, str):
        raise TypeError("輸入必須為字串")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def remove_invisible_chars(text: str) -> str:
    """清除或替換 AI 複製常見隱形字元。"""
    if not isinstance(text, str):
        raise TypeError("輸入必須為字串")
    for char, replacement in INVISIBLE_CHARS.items():
        if replacement is None:
            text = text.replace(char, "")
        else:
            text = text.replace(char, replacement)
    return text


def remove_trailing_spaces(text: str) -> str:
    """清除每行右側空白，保留左側排版。"""
    lines = text.split("\n")
    cleaned = [line.rstrip(" \t\u3000") for line in lines]
    return "\n".join(cleaned)


def clean_common(text: str) -> str:
    """共用清理 Pipeline (所有模式皆須經過)。"""
    text = normalize_newline(text)
    text = remove_invisible_chars(text)
    return text


def remove_code_fence(text: str) -> str:
    """以白名單機制保守移除 Markdown Code Fence。"""
    lines = text.split("\n")

    # 精準匹配小寫白名單標記
    if lines and lines[0].strip().lower() in CODE_FENCE_MARKERS:
        lines.pop(0)

    # 移除最後一行結尾的 ```
    if lines and lines[-1].strip() == "```":
        lines.pop()

    return "\n".join(lines)


def clean_python_indent_line(line: str, warnings: list[str], force_pure_tab: bool = False) -> str:
    """修復單行 Python 縮排，支援餘數空格處理與 Warning 收集。"""
    line = line.rstrip(" \t\u3000")
    if not line:
        return ""

    width = 0
    index = 0

    while index < len(line):
        char = line[index]
        if char == " ":
            width += 1
        elif char == "\u3000":
            width += 2
        elif char == "\t":
            width += TAB_WIDTH_ASSUMPTION
        else:
            break
        index += 1

    tab_count = width // TAB_WIDTH_ASSUMPTION
    remainder = width % TAB_WIDTH_ASSUMPTION

    if remainder != 0:
        msg = f"偵測到非標準縮排（無法被 {TAB_WIDTH_ASSUMPTION} 整除）: {width} spaces"
        if msg not in warnings:
            warnings.append(msg)

    if force_pure_tab:
        indent = "\t" * tab_count
    else:
        indent = ("\t" * tab_count) + (" " * remainder)

    return indent + line[index:]


def sanitize_python(text: str, warnings: list[str], force_pure_tab: bool = False) -> str:
    """Python 完整清理管道。"""
    text = clean_common(text)
    text = remove_code_fence(text)

    lines = text.split("\n")
    cleaned_lines = [clean_python_indent_line(line, warnings, force_pure_tab) for line in lines]

    text = "\n".join(cleaned_lines)
    text = remove_trailing_spaces(text)
    return text.rstrip() + "\n"


def sanitize_text(text: str) -> str:
    """TXT 保守清理管道 (不動左側排版)。"""
    text = clean_common(text)
    text = remove_trailing_spaces(text)
    return text.rstrip() + "\n"


def detect_mode(file_path: Path) -> int:
    """根據副檔名自動判斷清洗模式。"""
    if file_path.suffix.lower() in PYTHON_EXTENSIONS:
        return 2
    return 3


# ==========================================================
# TOOLS: OUTPUT SAFETY (輸出覆寫防護 — ACDS 第三章 P0 第 3、4 條)
# ==========================================================

def _content_hash(text: str) -> str:
    """計算文字內容的 SHA-256 雜湊值，用於判斷覆寫是否安全。"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolve_output_path(file_path: Path, cleaned_text: str) -> Path:
    """
    決定輸出檔案路徑，內建覆寫防護：
    - 目標檔案不存在 → 直接使用預設檔名
    - 目標檔案存在且內容雜湊相同 → 視為同一結果，安全覆寫（不留垃圾檔案）
    - 目標檔案存在但內容雜湊不同 → 撞名衝突，禁止靜默覆寫，改用時間戳記區分
    """
    default_path = file_path.with_name(f"{file_path.stem}_已清理{file_path.suffix}")

    if not default_path.exists():
        return default_path

    try:
        existing_text = default_path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        # 既有檔案無法安全讀取比對，保守處理為撞名衝突
        existing_text = None

    if existing_text is not None and _content_hash(existing_text) == _content_hash(cleaned_text):
        return default_path

    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return file_path.with_name(f"{file_path.stem}_已清理_{timestamp}{file_path.suffix}")


# ==========================================================
# TOOLS: IO & CLIPBOARD (檔案與剪貼簿操作)
# ==========================================================

def get_clipboard_text() -> str:
    """安全讀取剪貼簿文字內容。"""
    if not HAS_TK:
        raise RuntimeError("目前的環境未安裝 Tkinter，無法存取剪貼簿。")

    root = tk.Tk()
    root.withdraw()
    try:
        text = root.clipboard_get()
    except tk.TclError:
        raise ValueError("剪貼簿內沒有可讀取的文字內容。")
    else:
        return text
    finally:
        root.destroy()


def set_clipboard_text(text: str) -> None:
    """
    安全將文字寫回剪貼簿。

    【v1.0.1 Bug Fix 說明】
    舊版用 root.update_idletasks() + root.after(100) 試圖延遲銷毀視窗，
    但 after() 只是「排程」一個回呼，沒有 mainloop() 在跑，那個回呼永遠
    不會真正被執行——等於沒延遲。緊接著 finally 就呼叫 root.destroy()，
    Tk 視窗在剪貼簿內容真正交接給作業系統之前就被銷毀，剪貼簿擁有權跟著
    釋放，內容因此直接消失（使用者回報「MODE4 會把剪貼簿清空」的根因）。

    修正做法：改用 root.update()（非 update_idletasks），這會真正處理
    事件佇列、完成剪貼簿的交接程序，確認內容已落地後才安全銷毀視窗。
    """
    if not HAS_TK:
        raise RuntimeError("目前的環境未安裝 Tkinter，無法存取剪貼簿。")

    root = tk.Tk()
    root.withdraw()
    try:
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()  # 關鍵修正：真正處理事件佇列，完成剪貼簿交接
    except tk.TclError as err:
        raise RuntimeError(f"寫入剪貼簿時發生 Tkinter 錯誤: {err}")
    finally:
        root.destroy()


def ask_file_path(title: str = "請選擇要清理的檔案") -> str:
    """
    跳出系統原生檔案選取視窗，回傳使用者選擇的檔案路徑字串。
    使用者取消選擇時回傳空字串，呼叫端須自行檢查。
    僅在 HAS_TK 為 True 時可用；環境無 Tkinter 時由呼叫端降級為手動輸入路徑。
    """
    if not HAS_TK:
        raise RuntimeError("目前的環境未安裝 Tkinter，無法開啟檔案選取視窗。")

    root = tk.Tk()
    root.withdraw()
    try:
        path = filedialog.askopenfilename(
            title=title,
            filetypes=[
                ("所有支援的檔案", "*.py *.pyw *.txt"),
                ("Python 檔案", "*.py *.pyw"),
                ("文字檔案", "*.txt"),
                ("所有檔案", "*.*"),
            ],
        )
    finally:
        root.destroy()

    return path


def clean_file(
    file_path: Path,
    mode: int,
    force_pure_tab: bool = False,
    dry_run: bool = False
) -> CleaningReport:
    """
    讀取檔案並執行清洗，回報結構化 CleaningReport。
    """
    if not file_path.exists():
        raise FileNotFoundError(f"找不到指定檔案: {file_path}")

    warnings: list[str] = []

    # 安全讀檔 (含明確編碼警告標示)
    try:
        text = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        warnings.append("檔案非標準 UTF-8 編碼，將使用 errors='replace'，部分字元可能被替換為 ")
        text = file_path.read_text(encoding="utf-8", errors="replace")

    # 模式判斷
    selected_mode = detect_mode(file_path) if mode == 1 else mode
    mode_map = {2: "Python", 3: "TXT"}
    mode_name = mode_map.get(selected_mode, "Unknown")

    if selected_mode == 2:
        cleaned = sanitize_python(text, warnings, force_pure_tab)
    elif selected_mode == 3:
        cleaned = sanitize_text(text)
    else:
        raise ValueError(f"不合法的清理模式 MODE: {mode}")

    output_path = resolve_output_path(file_path, cleaned) if not dry_run else None

    report = CleaningReport(
        mode_name=mode_name,
        original_size=len(text),
        cleaned_size=len(cleaned),
        warnings=warnings,
        output_path=output_path,
        is_dry_run=dry_run
    )

    # 僅在非 Dry-Run 情況下實際寫檔
    if not dry_run:
        try:
            output_path.write_text(cleaned, encoding="utf-8")
        except OSError as err:
            raise IOError(f"寫入檔案失敗: {err}")

    return report


def sanitize_clipboard(mode: int, force_pure_tab: bool = False) -> CleaningReport:
    """清理剪貼簿流程，回傳報告。"""
    print("\n[Clipboard] 讀取剪貼簿中...")
    warnings: list[str] = []

    text = get_clipboard_text()
    mode_name = "Python (Clipboard)" if mode == 2 else "TXT (Clipboard)"

    if mode == 2:
        cleaned = sanitize_python(text, warnings, force_pure_tab)
    elif mode == 3:
        cleaned = sanitize_text(text)
    else:
        raise ValueError("剪貼簿模式只能指定 MODE 2 (Python) 或 3 (TXT)")

    set_clipboard_text(cleaned)

    return CleaningReport(
        mode_name=mode_name,
        original_size=len(text),
        cleaned_size=len(cleaned),
        warnings=warnings,
        output_path=None,
        is_dry_run=False
    )


# ==========================================================
# CLI & INTERACTIVE HANDLERS
# ==========================================================

def build_parser() -> argparse.ArgumentParser:
    """建立命令列參數解析器。"""
    parser = argparse.ArgumentParser(
        description=f"{__MODULE_NAME__} - 清理 AI 產生的程式碼與隱形字元"
    )
    parser.add_argument(
        "mode",
        type=int,
        nargs="?",
        choices=[1, 2, 3],
        help="1 = Auto Detect, 2 = Python, 3 = TXT"
    )
    parser.add_argument("file", type=str, nargs="?", help="輸入檔案路徑")
    parser.add_argument("--pure-tab", action="store_true", help="Python 模式強制純 TAB 縮排")
    parser.add_argument("--dry-run", action="store_true", help="測試執行，不實際寫入檔案")
    parser.add_argument(
        "--no-pause", action="store_true",
        help="結束後不停在終端機等待按鍵（供自動化腳本呼叫使用，一般手動執行不需加此參數）"
    )
    return parser


def _print_error(prefix: str, err: Exception) -> None:
    """統一錯誤輸出格式，附上例外類型方便事後判讀。"""
    print(f"[錯誤:{type(err).__name__}] {prefix}: {err}")


def cli_mode(mode: int, filename: str, force_pure_tab: bool = False, dry_run: bool = False) -> None:
    """CLI 入口。"""
    path = Path(filename)
    try:
        report = clean_file(path, mode, force_pure_tab, dry_run)
        report.print_summary()
    except FileNotFoundError as err:
        _print_error("找不到檔案", err)
    except (UnicodeDecodeError, ValueError, TypeError) as err:
        _print_error("內容或參數錯誤", err)
    except (IOError, OSError) as err:
        _print_error("檔案讀寫失敗", err)
    except Exception as err:  # 保底：任何未預期的例外仍須攔截，不得讓程式直接崩潰
        _print_error("未預期的錯誤", err)


def interactive_mode() -> None:
    """互動選單模式。"""
    print(f"""
======================================
       {__MODULE_NAME__} v{__VERSION__}
======================================
1 = File Auto Detect
2 = Python Sanitizer
3 = TXT Sanitizer
4 = Clipboard Sanitizer
======================================
""")
    try:
        mode_input = input("請選擇 MODE (1-4): ").strip()
        if not mode_input.isdigit():
            print("[錯誤] 請輸入有效數字 (1-4)")
            return

        mode = int(mode_input)

        # 4: 剪貼簿模式
        if mode == 4:
            clip_mode = input("\nClipboard 類型 (2=Python, 3=TXT): ").strip()
            if clip_mode not in ("2", "3"):
                print("[錯誤] 剪貼簿模式只能選擇 2 或 3")
                return
            pure = input("是否強制純 TAB？(y/N): ").strip().lower() == "y"
            report = sanitize_clipboard(int(clip_mode), pure)
            report.print_summary()
            print("[完成] 剪貼簿清理完成！可以直接按下 Ctrl + V 貼上。")
            return

        # 1-3: 檔案模式
        if mode in (1, 2, 3):
            if HAS_TK:
                file_input = ask_file_path()
            else:
                # 降級處理：環境沒有 Tkinter 時才退回手動輸入路徑
                file_input = input("請輸入檔案路徑: ").strip().strip('"').strip("'")

            if not file_input:
                print("[取消] 未選擇任何檔案")
                return

            pure = False
            if mode == 2:
                pure = input("Python 是否強制純 TAB？(y/N): ").strip().lower() == "y"

            dry_run_choice = input("是否進行 Dry-Run 測試 (不實際寫入)？(y/N): ").strip().lower() == "y"

            report = clean_file(Path(file_input), mode, pure, dry_run=dry_run_choice)
            report.print_summary()
            return

        print("[錯誤] 無效的 MODE 選擇")

    except FileNotFoundError as err:
        _print_error("找不到檔案", err)
    except (UnicodeDecodeError, ValueError, TypeError) as err:
        _print_error("內容或參數錯誤", err)
    except (IOError, OSError, RuntimeError) as err:
        _print_error("執行環境錯誤", err)
    except Exception as err:  # 保底：互動模式禁止讓未預期例外直接中斷程式
        _print_error("未預期的錯誤", err)


# ==========================================================
# MAIN / SINGLE ENTRY POINT COORDINATOR (單一入口)
# ==========================================================

def main() -> None:
    """單一入口協調器。"""
    parser = build_parser()
    args = parser.parse_args()

    if args.mode is not None and args.file is not None:
        cli_mode(args.mode, args.file, args.pure_tab, args.dry_run)
    else:
        interactive_mode()

    # 結束後停在終端機，避免雙擊執行時視窗一閃而逝、來不及檢核結果
    # --no-pause 保留給自動化腳本呼叫時使用，一般手動執行不需要加此參數
    if not args.no_pause:
        input("\n按 Enter 鍵結束程式...")


if __name__ == "__main__":
    main()
