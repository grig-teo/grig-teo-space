#!/usr/bin/env python3
"""Build a BlogPost JSON file from locale markdown files."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

spec = importlib.util.spec_from_file_location("md_to_blocknote", SCRIPT_DIR / "md_to_blocknote.py")
assert spec and spec.loader
md_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(md_module)
md_to_blocks = md_module.md_to_blocks


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("---", 3)
    if end == -1:
        return {}, text
    frontmatter = text[3:end].strip()
    body = text[end + 3 :].lstrip()
    meta: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"')
    return meta, body


def first_heading(body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def build_post(post_id: str) -> dict:
    blog_dir = SCRIPT_DIR / "blog_posts"
    ru_path = blog_dir / f"{post_id}.ru.md"
    meta, ru_body = parse_frontmatter(ru_path.read_text(encoding="utf-8"))

    titles = {
        "ru": meta.get("title") or first_heading(ru_body),
        "en": "Pyaterochka Never Called Back: How I Built Supermarket Delivery Without a Single API",
        "ro": "Pyaterochka nu a sunat înapoi: cum am construit livrarea din supermarket fără un singur API",
    }
    excerpts = {
        "ru": meta.get(
            "description",
            "Честный разбор главного риска grocery-стартапа: почему ритейлеры не дают API ассортимента, что делать вместо этого и почему соседской модели доставки полный каталог сети не обязателен.",
        ),
        "en": "An honest look at the main risk of a grocery startup: why retailers don't share assortment APIs, what to do instead, and why a neighbor-based delivery model doesn't need a full store catalog.",
        "ro": "O analiză sinceră a principalului risc al unui startup grocery: de ce retailerii nu oferă API de sortiment, ce poți face în schimb și de ce modelul de livrare între vecini nu are nevoie de catalogul complet al rețelei.",
    }

    bodies: dict[str, str] = {}
    for locale in ("ru", "en", "ro"):
        path = blog_dir / f"{post_id}.{locale}.md"
        text = path.read_text(encoding="utf-8")
        _, body = parse_frontmatter(text) if locale == "ru" else ({}, text)
        if locale != "ru":
            body = text
        blocks = md_to_blocks(body)
        bodies[locale] = json.dumps(blocks, ensure_ascii=False)

    return {
        "id": meta.get("slug") or post_id,
        "title": titles,
        "excerpt": excerpts,
        "body": bodies,
        "publishedAt": meta.get("date") or "2026-06-15",
        "sortOrder": 0,
    }


def main() -> None:
    post_id = sys.argv[1] if len(sys.argv) > 1 else "supermarkety-bez-api"
    post = build_post(post_id)
    out = SCRIPT_DIR / "blog_posts" / f"{post_id}.json"
    out.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
