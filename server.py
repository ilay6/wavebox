"""
WaveBox server — SoundCloud direct API + yt-dlp fallback
Searches via SoundCloud API (~200ms) instead of yt-dlp subprocess (7-32s)
"""
import os, asyncio, json, hashlib, tempfile, time, re, random
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

# ── SoundCloud client_id management ──────────────────────────────────────────
_sc_client_id: str | None = None
_sc_client_id_ts: float = 0
SC_CLIENT_ID_TTL = 3600  # refresh every hour

async def _extract_client_id() -> str | None:
    """Extract client_id from SoundCloud's JS bundles."""
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get("https://soundcloud.com", timeout=aiohttp.ClientTimeout(total=15)) as r:
                html = await r.text()
            scripts = re.findall(r'src="(https://a-v2\.sndcdn\.com/assets/[^"]+\.js)"', html)
            # Check last 5 scripts (client_id is usually in one of the last bundles)
            for script_url in reversed(scripts[-6:]):
                try:
                    async with s.get(script_url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                        js = await r.text()
                    m = re.search(r'client_id\s*[:=]\s*"([a-zA-Z0-9]{20,40})"', js)
                    if m:
                        return m.group(1)
                except Exception:
                    continue
    except Exception as e:
        print(f"[SC] client_id extraction failed: {e}")
    return None


async def get_client_id() -> str | None:
    global _sc_client_id, _sc_client_id_ts
    if _sc_client_id and time.time() - _sc_client_id_ts < SC_CLIENT_ID_TTL:
        return _sc_client_id
    cid = await _extract_client_id()
    if cid:
        _sc_client_id = cid
        _sc_client_id_ts = time.time()
        print(f"[SC] Got client_id: {cid[:8]}...")
    return _sc_client_id


# ── SoundCloud direct API search ─────────────────────────────────────────────
async def sc_api_search(query: str, limit: int = 10) -> list:
    """Search SoundCloud via API — ~200ms vs 7-32s with yt-dlp."""
    cid = await get_client_id()
    if not cid:
        return []
    url = (f"https://api-v2.soundcloud.com/search/tracks"
           f"?q={query}&client_id={cid}&limit={limit}&offset=0")
    async with aiohttp.ClientSession() as s:
        async with s.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status != 200:
                return []
            data = await r.json()
    tracks = []
    for item in data.get("collection", []):
        artwork = item.get("artwork_url") or ""
        if artwork:
            artwork = artwork.replace("-large", "-t500x500")
        purl = item.get("permalink_url", "")
        if not purl:
            continue
        tracks.append({
            "id": str(item.get("id", "")),
            "title": item.get("title", "Unknown"),
            "user": {"username": (item.get("user") or {}).get("username", "Unknown")},
            "duration": item.get("duration", 0),
            "artwork_url": artwork,
            "url": purl,
        })
    return tracks


async def sc_api_resolve(track_url: str) -> str | None:
    """Resolve SoundCloud track URL → direct stream URL via API."""
    cid = await get_client_id()
    if not cid:
        return None
    try:
        async with aiohttp.ClientSession() as s:
            # Resolve track URL to track data
            resolve = f"https://api-v2.soundcloud.com/resolve?url={track_url}&client_id={cid}"
            async with s.get(resolve, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return None
                data = await r.json()
            # Get stream URL from transcodings
            transcodings = (data.get("media") or {}).get("transcodings") or []
            # Prefer progressive (direct MP3), then HLS
            progressive = None
            hls = None
            for t in transcodings:
                proto = (t.get("format") or {}).get("protocol", "")
                if proto == "progressive":
                    progressive = t
                elif proto == "hls":
                    hls = t
            transcoding = progressive or hls
            if not transcoding:
                return None
            stream_api = transcoding["url"] + f"?client_id={cid}"
            async with s.get(stream_api, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return None
                stream_data = await r.json()
            return stream_data.get("url")
    except Exception as e:
        print(f"[SC] resolve failed: {e}")
        return None


# ── Caching ──────────────────────────────────────────────────────────────────
_url_cache: dict = {}       # track_url → (media_url, expires_at)
URL_TTL = 30 * 60

_search_cache: dict = {}    # query:limit → (tracks, expires_at)
SEARCH_TTL = 10 * 60

_resolve_futures: dict = {} # dedup concurrent resolves

_dl_tasks: dict = {}


def cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def find_cached(key: str):
    p = os.path.join(CACHE_DIR, f"{key}.mp3")
    return p if os.path.exists(p) and os.path.getsize(p) > 10240 else None


# ── URL resolution (API first, yt-dlp fallback) ─────────────────────────────
async def resolve_url(url: str) -> str | None:
    cached = _url_cache.get(url)
    if cached and time.time() < cached[1]:
        return cached[0]

    if url in _resolve_futures:
        return await asyncio.shield(_resolve_futures[url])

    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    _resolve_futures[url] = fut

    try:
        # Try SoundCloud API first (~300ms)
        media_url = await sc_api_resolve(url)

        # Fallback to yt-dlp if API fails
        if not media_url:
            fmt = "http_mp3_0_0/hls_mp3_0_0/bestaudio[ext=mp3]/bestaudio"
            proc = await asyncio.create_subprocess_exec(
                YT_DLP, url, "--get-url", "--format", fmt,
                "--no-playlist", "--no-warnings", "--quiet",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode == 0 and out.strip():
                    media_url = out.decode(errors="ignore").strip().split("\n")[0]
            except asyncio.TimeoutError:
                proc.kill()

        if media_url:
            _url_cache[url] = (media_url, time.time() + URL_TTL)
            fut.set_result(media_url)
            return media_url

        fut.set_result(None)
        return None
    except Exception as e:
        try:
            fut.set_result(None)
        except Exception:
            pass
        return None
    finally:
        _resolve_futures.pop(url, None)


async def _bg_resolve(url: str):
    try:
        await resolve_url(url)
    except Exception:
        pass


# ── HLS helper ───────────────────────────────────────────────────────────────
async def get_hls_segments(hls_url: str) -> list:
    async with aiohttp.ClientSession() as s:
        async with s.get(hls_url) as r:
            text = await r.text()
    return [line.strip() for line in text.splitlines()
            if line.strip() and not line.startswith("#")]


# ── Artist pools for catalog ─────────────────────────────────────────────────
POOLS = {
    "new": [
        'Drake', 'The Weeknd', 'SZA', 'Dua Lipa', 'Bad Bunny', 'Billie Eilish',
        'Olivia Rodrigo', 'Harry Styles', 'Ariana Grande', 'Post Malone',
        'Doja Cat', 'Travis Scott', 'Rihanna', 'Bruno Mars', 'Sabrina Carpenter',
        'Tyla', 'Rema', 'Charli XCX', 'NewJeans', 'Tems',
        'BTS', 'BLACKPINK', 'Rosalía', 'Karol G', 'Anitta',
    ],
    "trending": [
        'Kendrick Lamar', 'Playboi Carti', 'Future', 'Metro Boomin', 'Kanye West',
        'Don Toliver', '21 Savage', 'Lil Baby', 'Tyler the Creator', 'J. Cole',
        'A$AP Rocky', 'Central Cee', 'Ice Spice', 'Gunna', 'Jack Harlow',
        'Baby Keem', 'Stormzy', 'Dave', 'PinkPantheress', 'Fred again',
        'Skrillex', 'Flume', 'Disclosure', 'Kaytranada', 'Peggy Gou',
    ],
    "russian": [
        'Скриптонит', 'Miyagi', 'Макс Корж', 'Oxxxymiron', 'Элджей',
        'Pharaoh', 'Платина', 'Big Baby Tape', 'Mayot', 'OG Buda',
        'Баста', 'Хаски', 'Noize MC', 'FACE', 'Markul',
        'Jony', 'Rauf Faik', 'MACAN', 'Xcho', 'Три дня дождя',
        'Земфира', 'Molchat Doma', 'IC3PEAK', 'Кино', 'Монеточка',
    ],
    "chill": [
        'Joji', 'nujabes', 'Lofi Girl', 'Khruangbin', 'Mac DeMarco',
        'Clairo', 'Rex Orange County', 'boy pablo', 'Men I Trust', 'FKJ',
        'Tom Misch', 'Bonobo', 'Tycho', 'ODESZA', 'Toro y Moi',
        'keshi', 'Still Woozy', 'Cuco', 'beabadoobee', 'Masego',
        'Jordan Rakei', 'BadBadNotGood', 'Nils Frahm', 'Sampha', 'Bon Iver',
    ],
}

# ── Catalog system ───────────────────────────────────────────────────────────
_catalog = {"new": [], "trending": [], "russian": [], "chill": [], "ts": 0}
_catalog_building = False


async def _build_section(key: str) -> list:
    """Build one catalog section: search 2 random artists, interleave results."""
    pool = POOLS.get(key, [])
    if len(pool) < 2:
        return []
    a1, a2 = random.sample(pool, 2)
    r1, r2 = await asyncio.gather(
        sc_api_search(a1, 5),
        sc_api_search(a2, 5),
    )
    # Interleave and dedupe
    mixed = []
    seen = set()
    for i in range(max(len(r1), len(r2))):
        for lst in (r1, r2):
            if i < len(lst) and lst[i]["id"] not in seen:
                seen.add(lst[i]["id"])
                mixed.append(lst[i])
    return mixed


async def build_catalog():
    """Build full catalog — all 4 sections. ~1-2s total with API."""
    global _catalog, _catalog_building
    if _catalog_building:
        return
    _catalog_building = True
    try:
        for key in ["new", "trending", "russian", "chill"]:
            try:
                tracks = await _build_section(key)
                if tracks:
                    _catalog[key] = tracks
                    # Pre-resolve all track URLs in background
                    for t in tracks:
                        url = t.get("url")
                        if url and url not in _url_cache and url not in _resolve_futures:
                            asyncio.create_task(_bg_resolve(url))
            except Exception as e:
                print(f"[Catalog] {key} failed: {e}")
        _catalog["ts"] = time.time()
        print(f"[Catalog] Built: {sum(len(_catalog[k]) for k in POOLS)} tracks")
    finally:
        _catalog_building = False


async def catalog_refresh_loop():
    """Refresh catalog every 5 minutes."""
    # Initial build
    await build_catalog()
    while True:
        await asyncio.sleep(5 * 60)
        await build_catalog()


@app.on_event("startup")
async def on_startup():
    # Extract client_id and build catalog immediately
    asyncio.create_task(catalog_refresh_loop())


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/catalog")
async def get_catalog():
    """Return pre-built catalog — instant response."""
    return _catalog


@app.get("/search")
async def search(q: str, limit: int = 10):
    cache_k = f"{q}:{limit}"
    cached = _search_cache.get(cache_k)
    if cached and time.time() < cached[1]:
        return {"tracks": cached[0]}

    # Try SoundCloud API first
    tracks = await sc_api_search(q, limit)

    # Fallback to yt-dlp if API returns nothing
    if not tracks:
        try:
            proc = await asyncio.create_subprocess_exec(
                YT_DLP, f"scsearch{limit}:{q}",
                "--dump-json", "--flat-playlist", "--no-warnings", "--quiet",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            out, err = await asyncio.wait_for(proc.communicate(), timeout=45)
            if proc.returncode == 0 and out.strip():
                tracks = _parse_ytdlp_tracks(out.decode(errors="ignore"))
        except Exception:
            pass

    if tracks:
        _search_cache[cache_k] = (tracks, time.time() + SEARCH_TTL)
        # Auto-resolve URLs in background
        for t in tracks:
            url = t.get("url")
            if url and url not in _url_cache and url not in _resolve_futures:
                asyncio.create_task(_bg_resolve(url))

    return {"tracks": tracks}


def _parse_ytdlp_tracks(out: str) -> list:
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
    return tracks


@app.get("/resolve")
async def resolve_endpoint(url: str):
    media_url = await resolve_url(url)
    return {"ok": bool(media_url)}


@app.post("/batch-resolve")
async def batch_resolve(urls: list[str]):
    async def _one(u):
        try:
            return await resolve_url(u)
        except Exception:
            return None
    results = await asyncio.gather(*[_one(u) for u in urls[:10]])
    return {"resolved": sum(1 for r in results if r)}


@app.get("/stream")
async def stream(url: str):
    key = cache_key(url)

    cached = find_cached(key)
    if cached:
        return FileResponse(cached, media_type="audio/mpeg",
                            headers={"Accept-Ranges": "bytes",
                                     "Cache-Control": "public, max-age=3600"})

    media_url = await resolve_url(url)
    if not media_url:
        raise HTTPException(404, "Cannot get stream URL")

    cache_path = os.path.join(CACHE_DIR, f"{key}.mp3")
    tmp_path = cache_path + ".part"
    is_hls = ".m3u8" in media_url or "/m3u8" in media_url

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
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return StreamingResponse(generate(), media_type="audio/mpeg",
                             headers={"Cache-Control": "no-cache",
                                      "X-Content-Type-Options": "nosniff"})


@app.get("/preload")
async def preload(url: str):
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
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    _dl_tasks[key] = asyncio.create_task(_dl())
    return {"status": "started"}


if __name__ == "__main__":
    print("WaveBox server -> http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
