"""
WaveBox music server — searches and streams SoundCloud via yt-dlp
Run: /opt/homebrew/bin/python3.11 server.py
"""

import os
import asyncio
import json
import hashlib
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

YT_DLP = os.environ.get("YTDLP_PATH", "/opt/homebrew/bin/yt-dlp")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "wavebox_v2")
os.makedirs(CACHE_DIR, exist_ok=True)

_preload_tasks = {}


def cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def find_file(key: str):
    for ext in ["opus", "mp3", "m4a", "webm", "ogg", "aac"]:
        p = os.path.join(CACHE_DIR, f"{key}.{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            return p
    return None


async def ytdlp(*args, timeout=30):
    proc = await asyncio.create_subprocess_exec(
        YT_DLP, *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, out.decode(errors="ignore"), err.decode(errors="ignore")
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "timeout"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stream_url")
async def stream_url(url: str):
    """Return the direct HLS stream URL — fast (~1-2s), for browser HLS.js playback."""
    code, out, err = await ytdlp(
        url,
        "--get-url", "--format", "bestaudio/best",
        "--no-playlist", "--no-warnings", "--quiet",
        timeout=12,
    )
    if code != 0 or not out.strip():
        raise HTTPException(404, f"Cannot resolve stream URL: {err[:80]}")
    stream = out.strip().split("\n")[0]
    return {"url": stream}


@app.get("/search")
async def search(q: str, limit: int = 10):
    code, out, err = await ytdlp(
        f"scsearch{limit}:{q}",
        "--dump-json", "--flat-playlist",
        "--no-warnings", "--quiet",
        timeout=25,
    )
    if code != 0:
        return {"tracks": [], "error": err[:100]}

    tracks = []
    for line in out.strip().split("\n"):
        if not line.strip():
            continue
        try:
            d = json.loads(line)
            artwork = None
            for t in (d.get("thumbnails") or []):
                if t.get("id") in ["t300x300", "t500x500"]:
                    artwork = t["url"]
                    break
            if not artwork:
                thumbs = d.get("thumbnails") or []
                if thumbs:
                    artwork = thumbs[-1].get("url")

            tracks.append({
                "id": str(d.get("id", "")),
                "title": d.get("title", "Unknown"),
                "user": {"username": d.get("uploader") or d.get("channel") or "Unknown"},
                "duration": int((d.get("duration") or 0) * 1000),
                "artwork_url": artwork,
                "url": d.get("webpage_url") or d.get("url"),
            })
        except Exception:
            continue
    return {"tracks": tracks}


@app.get("/stream")
async def stream(url: str):
    key = cache_key(url)
    cached = find_file(key)

    # Serve from cache instantly
    if cached:
        return FileResponse(
            cached,
            media_type="audio/ogg",
            headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"},
        )

    # Download + stream simultaneously
    out_tmpl = os.path.join(CACHE_DIR, f"{key}.%(ext)s")
    proc = await asyncio.create_subprocess_exec(
        YT_DLP, url,
        "--format", "bestaudio/best",
        "--output", out_tmpl,
        "--no-playlist", "--no-part",
        "--no-warnings", "--quiet",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )

    # Wait up to 15s for file to appear and have some data
    file_path = None
    for _ in range(150):
        await asyncio.sleep(0.1)
        f = find_file(key)
        if f:
            file_path = f
            break

    if not file_path:
        # Wait for full download
        try:
            await asyncio.wait_for(proc.wait(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(404, "Download timeout")
        file_path = find_file(key)

    if not file_path:
        raise HTTPException(404, "Download failed")

    # Stream file while it's being written
    async def generate():
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(32768)
                if chunk:
                    yield chunk
                else:
                    if proc.returncode is not None:
                        # Finished — send any remaining bytes
                        rest = f.read()
                        if rest:
                            yield rest
                        break
                    await asyncio.sleep(0.05)

    return StreamingResponse(
        generate(),
        media_type="audio/ogg",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/preload")
async def preload(url: str):
    key = cache_key(url)
    if find_file(key):
        return {"status": "cached"}

    # Prune finished tasks
    for k in list(_preload_tasks.keys()):
        if _preload_tasks[k].done():
            del _preload_tasks[k]

    if key in _preload_tasks:
        return {"status": "downloading"}

    async def _dl():
        out_tmpl = os.path.join(CACHE_DIR, f"{key}.%(ext)s")
        await ytdlp(url,
            "--format", "bestaudio/best",
            "--output", out_tmpl,
            "--no-playlist", "--no-part",
            "--no-warnings", "--quiet",
            timeout=120,
        )

    _preload_tasks[key] = asyncio.create_task(_dl())
    return {"status": "started"}


if __name__ == "__main__":
    print("🎵 WaveBox server → http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
