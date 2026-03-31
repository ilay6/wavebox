"""
WaveBox local music server
Searches and streams audio via yt-dlp (SoundCloud)
Run: python3.11 server.py
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

YT_DLP = os.environ.get("YTDLP_PATH", "yt-dlp")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "wavebox_cache")
os.makedirs(CACHE_DIR, exist_ok=True)


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


@app.get("/search")
async def search(q: str, limit: int = 20):
    """Search tracks on SoundCloud"""
    code, stdout, stderr = await run_ytdlp(
        f"scsearch{limit}:{q}",
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        "--quiet",
        timeout=20,
    )
    if code != 0:
        return JSONResponse({"tracks": [], "error": stderr[:200]})

    tracks = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            d = json.loads(line)
            # Get best artwork — t300x300 or t500x500
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
    """Get direct audio stream URL for a track"""
    code, stdout, stderr = await run_ytdlp(
        url,
        "--format", "bestaudio/best",
        "--get-url",
        "--no-warnings",
        "--quiet",
        timeout=15,
    )
    if code != 0 or not stdout.strip():
        raise HTTPException(status_code=404, detail="Stream not found")

    stream_url = stdout.strip().split("\n")[0]
    return {"stream_url": stream_url}


@app.get("/download")
async def download(url: str):
    """Download and cache a track, return file"""
    # Use URL hash as cache key
    cache_key = str(abs(hash(url)))
    cached = os.path.join(CACHE_DIR, f"{cache_key}.m4a")

    if os.path.exists(cached):
        return FileResponse(cached, media_type="audio/mp4", filename="track.m4a")

    output_template = os.path.join(CACHE_DIR, f"{cache_key}.%(ext)s")
    code, stdout, stderr = await run_ytdlp(
        url,
        "--format", "140/251/bestaudio/best",
        "--output", output_template,
        "--no-playlist",
        "--extractor-args", "youtube:player_client=web",
        timeout=60,
    )

    # Find downloaded file
    for ext in ["m4a", "webm", "mp3", "opus"]:
        path = os.path.join(CACHE_DIR, f"{cache_key}.{ext}")
        if os.path.exists(path):
            return FileResponse(path, media_type="audio/mp4", filename=f"track.{ext}")

    raise HTTPException(status_code=500, detail="Download failed")


@app.get("/health")
async def health():
    return {"status": "ok", "ytdlp": YT_DLP}


if __name__ == "__main__":
    print("🎵 WaveBox server starting on http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
