#!/usr/bin/env python3
"""Publish a blog seed JSON to the live site via admin API."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_API = "https://grig-teo.space/api"


def request_json(url: str, *, method: str = "GET", data: dict | None = None, token: str | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    post_id = sys.argv[1] if len(sys.argv) > 1 else "durov-oslo-freedom-2026"
    api_base = os.environ.get("API_BASE_URL", DEFAULT_API).rstrip("/")
    access_key = os.environ.get("ADMIN_ACCESS_KEY")
    if not access_key:
        raise SystemExit("ADMIN_ACCESS_KEY is required")

    seed_path = SCRIPT_DIR / "blog_posts" / f"{post_id}.json"
    if not seed_path.exists():
        raise SystemExit(f"Seed not found: {seed_path}")

    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    login = request_json(f"{api_base}/admin/auth/login", method="POST", data={"accessKey": access_key})
    token = login["token"]

    content = request_json(f"{api_base}/admin/content", token=token)
    posts = content.get("blog", [])
    if any(post.get("id") == seed["id"] for post in posts):
        print(f"Post '{seed['id']}' already exists — skipping")
        return

    updated = [seed, *posts]
    request_json(f"{api_base}/admin/content/blog", method="PUT", data=updated, token=token)
    print(f"Published blog post '{seed['id']}' to {api_base}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {error.code}: {detail}") from error
