"""
WaveBox local music server
Searches and streams audio via yt-dlp (SoundCloud)
Run: /opt/homebrew/bin/python3.11 server.py
"""

import os
import asyncio
import tempfile
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

YT_DLP = os.environ.get("YTDLP_PATH", "/opt/homebrew/bin/yt-dlp")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "wavebox_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Track ongoing preload tasks
_preload_tasks: dict = {}


async def run_ytdlp(*args, timeout=30):
    proc = await asyncio.create_subprocess_exec(
        YT_DLP, *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, stdout.decode(errors="ignore"), stderr.decode(errors="ignore")
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "timeout"


async def _download_to_cache(url: str, cache_key: str):
    """Download a track and store in cache directory."""
    output_template = os.path.join(CACHE_DIR, f"{cache_key}.%(ext)s")
    await run_ytdlp(
        url,
        "--format", "bestaudio/best",
        "--output", output_template,
        "--no-playlist",
        "--no-part",
        "--no-warnings",
        "--quiet",
        timeout=90,
    )


def find_cached(cache_key: str):
    """Return cached file path if exists, else None."""
    for ext in ["mp3", "m4a", "webm", "opus", "aac", "ogg"]:
        path = os.path.join(CACHE_DIR, f"{cache_key}.{ext}")
        if os.path.exists(path):
            return path
    return None


@app.get("/health")
async def health():
    return {"status": "ok", "ytdlp": YT_DLP}


@app.get("/search")
async def search(q: str, limit: int = 10):
    """Search tracks on SoundCloud."""
    code, stdout, stderr = await run_ytdlp(
        f"scsearch{limit}:{q}",
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        "--quiet",
        timeout=25,
    )
    if code != 0:
        return JSONResponse({"tracks": [], "error": stderr[:200]})

    tracks = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            d = json.loads(line)
            artwork = None
            thumbs = d.get("thumbnails") or []
            for tid in ["t300x300", "t500x500", "crop", "large", "t67x67"]:
                for t in thumbs:
                    if t.get("id") == tid:
                        artwork = t["url"]
                        break
                if artwork:
                    break
            if not artwork and thumbs:
                artwork = thumbs[-1].get("url")

            tracks.append({
                "id": d.get("id", ""),
                "title": d.get("title", "Unknown"),
                "user": {"username": d.get("uploader") or d.get("channel") or "Unknown"},
                "duration": int((d.get("duration") or 0) * 1000),
                "artwork_url": artwork,
                "url": d.get("url") or d.get("webpage_url"),
                "playback_count": d.get("view_count", 0),
                "genre": d.get("genre", ""),
            })
        except Exception:
            continue
    return {"tracks": tracks}


@app.get("/stream")
async def stream(url: str):
    """Stream audio — serves cached file instantly, downloads on first request."""
    cache_key = str(abs(hash(url)))

    # Serve from cache instantly
    cached = find_cached(cache_key)
    if cached:
        return FileResponse(cached, media_type="audio/mpeg",
                            headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"})

    # Download then serve
    await _download_to_cache(url, cache_key)

    cached = find_cached(cache_key)
    if cached:
        return FileResponse(cached, media_type="audio/mpeg",
                            headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"})

    raise HTTPException(status_code=404, detail="Download failed")


@app.get("/stream_url")
async def stream_url(url: str):
    """Try to get a direct stream URL quickly (faster than full download)."""
    code, stdout, _ = await run_ytdlp(
        url, "--get-url", "--format", "bestaudio/best",
        "--no-warnings", "--quiet", timeout=10,
    )
    if code == 0 and stdout.strip():
        direct = stdout.strip().split("\n")[0]
        return {"url": direct}
    return {"url": None}


@app.get("/preload")
async def preload(url: str):
    """Start background download for instant future /stream response."""
    cache_key = str(abs(hash(url)))

    # Already cached?
    if find_cached(cache_key):
        return {"status": "cached"}

    # Prune finished tasks
    done = [k for k, t in _preload_tasks.items() if t.done()]
    for k in done:
        del _preload_tasks[k]

    # Already downloading?
    if cache_key in _preload_tasks:
        return {"status": "downloading"}

    # Start background download
    task = asyncio.create_task(_download_to_cache(url, cache_key))
    _preload_tasks[cache_key] = task
    return {"status": "started"}


if __name__ == "__main__":
    print("🎵 WaveBox server starting on http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
