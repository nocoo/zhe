#!/usr/bin/env python3
"""
Complexity analyzer for autoresearch.

Counts:
- files_over_400: production .ts/.tsx files exceeding 400 lines
- funcs_over_100: functions exceeding 100 lines

Production code roots (excludes tests, scripts, node_modules, generated):
  app/, actions/, components/, viewmodels/, models/, hooks/,
  contexts/, lib/, worker/src/, cli/src/, auth.ts, proxy.ts

Skips: *.d.ts, *.test.ts(x), *.spec.ts(x), files under tests/, scripts/, node_modules/,
       .next/, coverage/, dist/, build/.

Function detection heuristic (brace-matched while ignoring string/comment content):
  - function declarations:           function name(...) { ... }
  - function expressions assigned:   const name = function(...) { ... }
  - arrow functions assigned:        const name = (...) => { ... }
  - class/object methods:            name(...) { ... }   /  async name(...) { ... }

Single-expression arrow functions without { } are skipped (always small).

Emits JSON to stdout:
  {"files_over_400": N, "funcs_over_100": M, "violations": N+M,
   "max_file_lines": ..., "max_func_lines": ...,
   "file_violations": [...], "func_violations": [...]}
"""

from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Production code: only consider these subtrees / files.
PROD_DIRS = [
    "app",
    "actions",
    "components",
    "viewmodels",
    "models",
    "hooks",
    "contexts",
    "lib",
    "worker/src",
    "cli/src",
]
PROD_FILES = ["auth.ts", "proxy.ts"]

# Always skip.
SKIP_DIR_PARTS = {
    "node_modules", ".next", "coverage", "dist", "build",
    "test-results", "playwright-report", ".turbo",
}


def is_skipped(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIR_PARTS:
        return True
    name = path.name
    if name.endswith(".d.ts"):
        return True
    if re.search(r"\.(test|spec)\.(ts|tsx)$", name):
        return True
    return False


def collect_files() -> list[Path]:
    files: list[Path] = []
    for sub in PROD_DIRS:
        base = ROOT / sub
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in (".ts", ".tsx"):
                continue
            if is_skipped(p.relative_to(ROOT)):
                continue
            files.append(p)
    for f in PROD_FILES:
        p = ROOT / f
        if p.exists():
            files.append(p)
    return files


# --- String / comment stripping (for accurate brace counting) ---

def strip_noncode(src: str) -> str:
    """Replace string/template/comment contents with spaces, preserving line breaks.

    This lets a simple brace counter work without being confused by braces inside
    strings, template literals, or comments. We preserve newlines so that line
    numbering remains intact.
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        # Line comment
        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
            continue
        # Block comment
        if c == "/" and nxt == "*":
            out.append("  ")
            i += 2
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                out.append("\n" if src[i] == "\n" else " ")
                i += 1
            if i < n:
                out.append("  ")
                i += 2
            continue
        # String literals " ' `
        if c in ("'", '"', "`"):
            quote = c
            out.append(quote)
            i += 1
            while i < n:
                ch = src[i]
                if ch == "\\" and i + 1 < n:
                    out.append("  ")
                    i += 2
                    continue
                if ch == quote:
                    out.append(quote)
                    i += 1
                    break
                # Template substitution: ${ ... } may contain code — keep braces!
                if quote == "`" and ch == "$" and i + 1 < n and src[i + 1] == "{":
                    out.append("$")
                    out.append("{")
                    i += 2
                    depth = 1
                    while i < n and depth > 0:
                        cc = src[i]
                        if cc == "{":
                            depth += 1
                            out.append(cc)
                        elif cc == "}":
                            depth -= 1
                            out.append(cc)
                        elif cc == "\n":
                            out.append("\n")
                        else:
                            # Keep code chars as-is so braces inside template
                            # expressions are still counted correctly when they
                            # belong to nested functions.
                            out.append(cc)
                        i += 1
                    continue
                out.append("\n" if ch == "\n" else " ")
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


# --- Function detection ---

# Patterns that locate a function "head" whose body starts at the matching `{`.
# We search in the stripped source.
RE_FUNCTION_DECL = re.compile(
    r"\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?::\s*[^{;=]+)?\s*\{"
)
RE_ARROW_ASSIGN = re.compile(
    r"\b(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?::\s*[^=]+)?=>\s*\{"
)
RE_FUNC_EXPR_ASSIGN = re.compile(
    r"\b(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::\s*[^=]+)?=\s*(?:async\s+)?function\s*\*?\s*[A-Za-z_$]?[\w$]*\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?::\s*[^{;]+)?\s*\{"
)
# Methods inside classes/objects: `name(args) { ... }` or `async name(args) {`
RE_METHOD = re.compile(
    r"(^|\n)\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|override\s+|async\s+|\*\s*)*"
    r"(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?::\s*[^{;=]+)?\s*\{"
)

# Words that, when they appear as the "name", indicate this isn't a method but a
# control-flow keyword (if/for/while/switch/catch/return/etc.).
NON_METHOD_KEYWORDS = {
    "if", "for", "while", "switch", "catch", "return", "do", "else",
    "try", "finally", "function", "class", "interface", "type", "enum",
    "import", "export", "new", "throw", "await", "typeof", "in", "of",
    "as", "from", "with",
}


def find_matching_brace(src: str, open_idx: int) -> int | None:
    depth = 0
    i = open_idx
    n = len(src)
    while i < n:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def line_of(src: str, idx: int) -> int:
    return src.count("\n", 0, idx) + 1


def detect_functions(stripped: str) -> list[tuple[int, int]]:
    """Return list of (start_line, end_line) for detected functions."""
    spans: list[tuple[int, int]] = []
    seen_opens: set[int] = set()

    def record(open_brace_idx: int):
        if open_brace_idx in seen_opens:
            return
        end = find_matching_brace(stripped, open_brace_idx)
        if end is None:
            return
        seen_opens.add(open_brace_idx)
        spans.append((line_of(stripped, open_brace_idx), line_of(stripped, end)))

    for rx in (RE_FUNCTION_DECL, RE_ARROW_ASSIGN, RE_FUNC_EXPR_ASSIGN):
        for m in rx.finditer(stripped):
            brace = stripped.rfind("{", m.start(), m.end())
            if brace == -1:
                continue
            record(brace)

    # Methods: filter by leading name not being a keyword.
    for m in RE_METHOD.finditer(stripped):
        head = m.group(0)
        # Extract the identifier just before the (
        paren = head.find("(")
        if paren == -1:
            continue
        name_match = re.search(r"([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\($", head[:paren + 1])
        if not name_match:
            continue
        name = name_match.group(1)
        if name in NON_METHOD_KEYWORDS:
            continue
        brace = stripped.rfind("{", m.start(), m.end())
        if brace == -1:
            continue
        record(brace)

    return spans


def analyze() -> dict:
    files = collect_files()
    files_over_400: list[tuple[str, int]] = []
    funcs_over_100: list[tuple[str, int, int]] = []  # (file, start_line, length)
    max_file_lines = 0
    max_func_lines = 0

    for f in files:
        try:
            src = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        line_count = src.count("\n") + (0 if src.endswith("\n") or not src else 1)
        if line_count > max_file_lines:
            max_file_lines = line_count
        if line_count > 400:
            files_over_400.append((str(f.relative_to(ROOT)), line_count))

        stripped = strip_noncode(src)
        for (start, end) in detect_functions(stripped):
            length = end - start + 1
            if length > max_func_lines:
                max_func_lines = length
            if length > 100:
                funcs_over_100.append((str(f.relative_to(ROOT)), start, length))

    files_over_400.sort(key=lambda x: -x[1])
    funcs_over_100.sort(key=lambda x: -x[2])

    return {
        "files_over_400": len(files_over_400),
        "funcs_over_100": len(funcs_over_100),
        "violations": len(files_over_400) + len(funcs_over_100),
        "max_file_lines": max_file_lines,
        "max_func_lines": max_func_lines,
        "total_files_scanned": len(files),
        "file_violations": files_over_400,
        "func_violations": funcs_over_100,
    }


if __name__ == "__main__":
    result = analyze()
    if "--verbose" in sys.argv or "-v" in sys.argv:
        print(f"Files scanned: {result['total_files_scanned']}")
        print(f"Files > 400 lines: {result['files_over_400']}")
        for path, n in result["file_violations"]:
            print(f"  {n:5d}  {path}")
        print(f"Functions > 100 lines: {result['funcs_over_100']}")
        for path, line, length in result["func_violations"][:50]:
            print(f"  {length:5d}  {path}:{line}")
        print(f"Max file lines: {result['max_file_lines']}")
        print(f"Max func lines: {result['max_func_lines']}")
        print(f"VIOLATIONS: {result['violations']}")
    else:
        print(json.dumps(result, indent=2))
