#!/usr/bin/env python3
"""Поиск и загрузка реальных звуков и музыки с открытыми лицензиями (Openverse: Freesound, Wikimedia, Jamendo).

    python3 scripts/fetch_sounds.py scripts/sound-queries.json out_dir

queries.json — список {"q": "fpv drone", "n": 6, "length": "short", "max": 40}.
Берутся только лицензии, разрешающие коммерческое использование (CC0, PDM, CC BY, CC BY-SA).
Каждый файл — out_dir/<slug>/<n>.mp3 и рядом <n>.json (название, автор, лицензия, ссылка) для титров.
Запускается в GitHub Actions: у серверов GitHub открыт интернет.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "kvartira14-game/1.0 (sound search for CC-licensed audio)"}


def get(url, timeout=60, limit=None):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(limit) if limit else r.read()


def fetch_one(d, i, r, item):
    """Скачать начало файла (хватает на нужные секунды) и перекодировать в mp3."""
    src = r.get("url")
    if not src:
        return None
    raw = d / f"{i}.src"
    try:
        raw.write_bytes(get(src, 45, int(item.get("bytes", 14_000_000))))
    except Exception as e:
        print(f"  ! {src}: {e}")
        return None
    mp3 = d / f"{i}.mp3"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-t", str(item.get("max", 40)), "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", str(mp3)]
    ok = subprocess.run(cmd).returncode == 0 and mp3.exists() and mp3.stat().st_size > 2000
    raw.unlink()
    return mp3 if ok else None


def main():
    t0 = time.time()
    limit = float(__import__("os").environ.get("FETCH_MINUTES", "25")) * 60
    queries = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for item in queries:
        if time.time() - t0 > limit:
            print("! время вышло — сохраняю найденное")
            break
        q = item["q"]
        slug = re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")
        params = {"q": q, "license_type": "commercial", "page_size": item.get("n", 6)}
        if item.get("length"):
            params["length"] = item["length"]
        try:
            data = json.loads(get("https://api.openverse.org/v1/audio/?" + urllib.parse.urlencode(params), 30))
        except Exception as e:
            print(f"! {q}: {e}")
            continue
        d = out / slug
        d.mkdir(exist_ok=True)
        res = data.get("results", [])
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(6) as ex:
            files = list(ex.map(lambda ir: fetch_one(d, ir[0], ir[1], item), enumerate(res)))
        for i, (r, mp3) in enumerate(zip(res, files)):
            if not mp3:
                continue
            meta = {k: r.get(k) for k in ("id", "title", "creator", "license", "license_version", "license_url", "foreign_landing_url", "provider", "source", "duration", "tags")}
            meta["tags"] = [t.get("name") for t in (meta.get("tags") or [])][:12]
            meta["query"] = q
            (d / f"{i}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            index.append({"file": f"{slug}/{i}.mp3", **{k: meta[k] for k in ("title", "creator", "license", "provider", "duration")}})
            print(f"  {slug}/{i}.mp3  {meta['license']}  {meta['title']!r}")
        (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(1.0)
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"всего: {len(index)}")


if __name__ == "__main__":
    main()
