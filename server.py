"""
WaveBox server — SoundCloud via yt-dlp, streams MP3 directly
Run: /opt/homebrew/bin/python3.11 server.py
"""
import os, asyncio, json, hashlib, tempfile, time
import aiohttp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import uvicorn

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

YT_DLP = os.environ.get("YTDLP_PATH", "yt-dlp")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "wavebox_v4")
os.makedirs(CACHE_DIR, exist_ok=True)

_dl_tasks: dict = {}

# Server-side URL cache: track_url → (media_url, expires_at)
# Avoids 1.5s yt-dlp wait on every /stream call for already-resolved tracks
_url_cache: dict = {}
URL_TTL = 8 * 60  # seconds (SoundCloud signed URLs last ~10 min)

# Dedup concurrent resolves: if two requests hit the same track simultaneously,
# only one yt-dlp process runs; both wait on the same Future
_resolve_futures: dict = {}


def cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def find_cached(key: str):
    p = os.path.join(CACHE_DIR, f"{key}.mp3")
    return p if os.path.exists(p) and os.path.getsize(p) > 10240 else None


async def ytdlp(*args, timeout=20):
    proc = await asyncio.create_subprocess_exec(YT_DLP, *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return proc.returncode, out.decode(errors="ignore"), err.decode(errors="ignore")
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", "timeout"


FORMAT = "http_mp3_0_0/hls_mp3_0_0/bestaudio[ext=mp3]/bestaudio"


async def resolve_url(url: str) -> str | None:
    """Resolve SoundCloud URL → direct CDN URL. Uses in-memory cache to skip yt-dlp."""
    # Check memory cache
    cached = _url_cache.get(url)
    if cached and time.time() < cached[1]:
        return cached[0]

    # Dedup: if another coroutine is already resolving this URL, wait on it
    if url in _resolve_futures:
        return await asyncio.shield(_resolve_futures[url])

    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    _resolve_futures[url] = fut

    try:
        code, out, _ = await ytdlp(url, "--get-url", "--format", FORMAT,
                                    "--no-playlist", "--no-warnings", "--quiet", timeout=15)
        if code == 0 and out.strip():
            media_url = out.strip().split("\n")[0]
            _url_cache[url] = (media_url, time.time() + URL_TTL)
            fut.set_result(media_url)
            return media_url
        fut.set_result(None)
        return None
    except Exception as e:
        fut.set_exception(e)
        return None
    finally:
        _resolve_futures.pop(url, None)


async def get_hls_segments(hls_url: str) -> list:
    async with aiohttp.ClientSession() as s:
        async with s.get(hls_url) as r:
            text = await r.text()
    return [line.strip() for line in text.splitlines()
            if line.strip() and not line.startswith("#")]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/search")
async def search(q: str, limit: int = 10):
    try:
        code, out, err = await ytdlp(f"scsearch{limit}:{q}",
            "--dump-json", "--flat-playlist", "--no-warnings", "--quiet", timeout=25)
    except Exception as e:
        return {"tracks": [], "error": f"ytdlp failed: {str(e)[:100]}"}
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
                    artwork = t["url"]; break
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


@app.get("/resolve")
async def resolve_endpoint(url: str):
    """Warm up the URL cache — call this for upcoming tracks to eliminate yt-dlp wait."""
    media_url = await resolve_url(url)
    return {"ok": bool(media_url)}


@app.get("/stream")
async def stream(url: str):
    key = cache_key(url)

    # 1. Serve from file cache instantly (FileResponse, ~10ms)
    cached = find_cached(key)
    if cached:
        return FileResponse(cached, media_type="audio/mpeg",
                            headers={"Accept-Ranges": "bytes",
                                     "Cache-Control": "public, max-age=3600"})

    # 2. Resolve URL — instant if cached in memory, else ~1.5s via yt-dlp
    media_url = await resolve_url(url)
    if not media_url:
        raise HTTPException(404, "Cannot get stream URL")

    cache_path = os.path.join(CACHE_DIR, f"{key}.mp3")
    tmp_path = cache_path + ".part"
    is_hls = ".m3u8" in media_url or "/m3u8" in media_url

    # 3. Stream to browser while saving to file cache
    async def generate():
        try:
            async with aiohttp.ClientSession() as s:
                with open(tmp_path, "wb") as f:
                    if is_hls:
                        segs = await get_hls_segments(media_url)
                        for seg_url in segs:
                            async with s.get(seg_url) as r:
                                async for chunk in r.content.iter_chunked(65536):
                                    f.write(chunk)
                                    yield chunk
                    else:
                        async with s.get(media_url) as r:
                            async for chunk in r.content.iter_chunked(65536):
                                f.write(chunk)
                                yield chunk
            if os.path.exists(tmp_path):
                os.rename(tmp_path, cache_path)
        except Exception:
            try: os.unlink(tmp_path)
            except: pass

    return StreamingResponse(generate(), media_type="audio/mpeg",
                             headers={"Cache-Control": "no-cache",
                                      "X-Content-Type-Options": "nosniff"})


@app.get("/preload")
async def preload(url: str):
    """Download and cache a track fully in the background."""
    key = cache_key(url)
    if find_cached(key):
        return {"status": "cached"}

    for k in list(_dl_tasks):
        if _dl_tasks[k].done():
            del _dl_tasks[k]

    if key in _dl_tasks:
        return {"status": "downloading"}

    async def _dl():
        media_url = await resolve_url(url)
        if not media_url:
            return
        cache_path = os.path.join(CACHE_DIR, f"{key}.mp3")
        tmp_path = cache_path + ".part"
        is_hls = ".m3u8" in media_url or "/m3u8" in media_url
        try:
            async with aiohttp.ClientSession() as s:
                with open(tmp_path, "wb") as f:
                    if is_hls:
                        segs = await get_hls_segments(media_url)
                        for seg_url in segs:
                            async with s.get(seg_url) as r:
                                f.write(await r.read())
                    else:
                        async with s.get(media_url) as r:
                            async for chunk in r.content.iter_chunked(65536):
                                f.write(chunk)
            os.rename(tmp_path, cache_path)
        except Exception:
            try: os.unlink(tmp_path)
            except: pass

    _dl_tasks[key] = asyncio.create_task(_dl())
    return {"status": "started"}


if __name__ == "__main__":
    print("WaveBox server -> http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
