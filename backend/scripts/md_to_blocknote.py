#!/usr/bin/env python3
"""Convert markdown (without frontmatter) to BlockNote JSON blocks."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def parse_inline(text: str) -> list[dict]:
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    content: list[dict] = []
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            content.append({"type": "text", "text": part[2:-2], "styles": {"bold": True}})
        else:
            content.append({"type": "text", "text": part, "styles": {}})
    return content or [{"type": "text", "text": text, "styles": {}}]


def md_to_blocks(markdown: str) -> list[dict]:
    blocks: list[dict] = []
    lines = markdown.strip().splitlines()
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        if not line or line.strip() == "---":
            i += 1
            continue

        if line.startswith("# "):
            blocks.append(
                {
                    "type": "heading",
                    "props": {"level": 1},
                    "content": parse_inline(line[2:].strip()),
                }
            )
            i += 1
            continue

        if line.startswith("## "):
            blocks.append(
                {
                    "type": "heading",
                    "props": {"level": 2},
                    "content": parse_inline(line[3:].strip()),
                }
            )
            i += 1
            continue

        if line.startswith("|") and i + 1 < len(lines) and lines[i + 1].startswith("|"):
            table_lines: list[str] = []
            while i < len(lines) and lines[i].startswith("|"):
                row = lines[i].strip()
                if not re.match(r"^\|\s*-+", row):
                    cells = [cell.strip() for cell in row.strip("|").split("|")]
                    table_lines.append(" — ".join(cell for cell in cells if cell))
                i += 1
            for row in table_lines:
                blocks.append({"type": "bulletListItem", "content": parse_inline(row)})
            continue

        if line.startswith("- "):
            blocks.append({"type": "bulletListItem", "content": parse_inline(line[2:].strip())})
            i += 1
            continue

        paragraph_lines = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if (
                not nxt
                or nxt.startswith("#")
                or nxt.startswith("- ")
                or nxt.startswith("|")
                or nxt.strip() == "---"
            ):
                break
            paragraph_lines.append(nxt)
            i += 1

        paragraph = " ".join(part.strip() for part in paragraph_lines).strip()
        if paragraph:
            blocks.append({"type": "paragraph", "content": parse_inline(paragraph)})

    return blocks


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            return text[end + 3 :].lstrip()
    return text


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: md_to_blocknote.py input.md output.json")

    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    body = strip_frontmatter(source)
    blocks = md_to_blocks(body)
    Path(sys.argv[2]).write_text(json.dumps(blocks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(blocks)} blocks to {sys.argv[2]}")


if __name__ == "__main__":
    main()
