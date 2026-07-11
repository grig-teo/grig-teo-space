#!/usr/bin/env python3
"""Convert the COLMI R11 markdown article to a BlockNote blog seed JSON.

Unlike md_to_blocknote.py this also handles fenced code blocks (```lang ... ```)
and emits the BlockNote `codeBlock` type, which the frontend renderer supports.
Run from backend/scripts/:  python3 build_colmi_post.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BLOG_DIR = Path(__file__).resolve().parent / "blog_posts"


def parse_inline(text: str) -> list[dict]:
    """Split on **bold** runs; everything else is plain text."""
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


def strip_frontmatter(text: str) -> tuple[str, str]:
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            return text[3:end], text[end + 3:].lstrip()
    return "", text


def md_to_blocks(markdown: str) -> list[dict]:
    blocks: list[dict] = []
    lines = markdown.strip().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        # Fenced code block: ```lang ... ```
        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].rstrip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # consume closing fence
            blocks.append(
                {
                    "type": "codeBlock",
                    "props": {"language": lang or "plaintext"},
                    "content": [
                        {"type": "text", "text": "\n".join(code_lines), "styles": {}}
                    ],
                }
            )
            continue

        if not line:
            i += 1
            continue

        if line.startswith("# "):
            blocks.append(
                {"type": "heading", "props": {"level": 1}, "content": parse_inline(line[2:].strip())}
            )
            i += 1
            continue

        if line.startswith("## "):
            blocks.append(
                {"type": "heading", "props": {"level": 2}, "content": parse_inline(line[3:].strip())}
            )
            i += 1
            continue

        if line.startswith("- "):
            blocks.append({"type": "bulletListItem", "content": parse_inline(line[2:].strip())})
            i += 1
            continue

        # Paragraph: gather contiguous non-empty, non-special lines.
        para = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i].rstrip()
            if (
                not nxt
                or nxt.startswith("#")
                or nxt.startswith("- ")
                or nxt.startswith("```")
            ):
                break
            para.append(nxt)
            i += 1
        joined = " ".join(p.strip() for p in para).strip()
        if joined:
            blocks.append({"type": "paragraph", "content": parse_inline(joined)})

    return blocks


def main() -> None:
    src = (BLOG_DIR / "colmi-r11-health-pipeline.en.md").read_text(encoding="utf-8")
    frontmatter, body = strip_frontmatter(src)

    meta: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"')

    blocks = md_to_blocks(body)
    body_json = json.dumps(blocks, ensure_ascii=False)

    post = {
        "id": meta.get("slug", "colmi-r11-health-pipeline"),
        "title": {
            "en": meta.get("title", "Talking to a Smart Ring That Has No Manual: Building the COLMI R11 Health Pipeline"),
            "ru": "Разговор с умным кольцом без инструкции: как я построил пайплайн данных здоровья для COLMI R11",
            "ro": "Conversația cu un inel inteligent fără manual: cum am construit pipeline-ul de date pentru COLMI R11",
        },
        "excerpt": {
            "en": meta.get("description", ""),
            "ru": "Реверс-инжиниринг недокументированного Bluetooth-протокола COLMI R11, устойчивое SwiftUI-приложение на CoreBluetooth и бэкенд на NestJS с офлайн-очередью и трёхслойной фоновой стратегией.",
            "ro": "Inginerie inversă a protocolului Bluetooth nedocumentat al COLMI R11, o aplicație SwiftUI rezilientă pe CoreBluetooth și un backend NestJS cu o coadă offline și o strategie de fundal pe trei straturi.",
        },
        "body": {
            "en": body_json,
            # ru / ro left as the English body for now — translate later.
            "ru": body_json,
            "ro": body_json,
        },
        "publishedAt": meta.get("date", "2026-07-11"),
        "sortOrder": 0,
    }

    out = BLOG_DIR / "colmi-r11-health-pipeline.json"
    out.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out} ({len(blocks)} blocks)")


if __name__ == "__main__":
    sys.exit(main())
