"""
WaveBox server v3 — SoundCloud direct API, pre-resolved CDN URLs, instant playback
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

# ── SoundCloud client_id ─────────────────────────────────────────────────────
_sc_client_id: str | None = None
_sc_client_id_ts: float = 0

async def _extract_client_id() -> str | None:
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get("https://soundcloud.com", timeout=aiohttp.ClientTimeout(total=15)) as r:
                html = await r.text()
            scripts = re.findall(r'src="(https://a-v2\.sndcdn\.com/assets/[^"]+\.js)"', html)
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
    if _sc_client_id and time.time() - _sc_client_id_ts < 3600:
        return _sc_client_id
    cid = await _extract_client_id()
    if cid:
        _sc_client_id = cid
        _sc_client_id_ts = time.time()
        print(f"[SC] Got client_id: {cid[:8]}...")
    return _sc_client_id


# ── SoundCloud API ───────────────────────────────────────────────────────────
async def sc_api_search(query: str, limit: int = 10) -> list:
    cid = await get_client_id()
    if not cid:
        return []
    url = f"https://api-v2.soundcloud.com/search/tracks?q={query}&client_id={cid}&limit={limit}&offset=0"
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return []
                data = await r.json()
    except Exception:
        return []
    tracks = []
    for item in data.get("collection", []):
        artwork = item.get("artwork_url") or ""
        if artwork:
            artwork = artwork.replace("-large", "-t500x500")
        purl = item.get("permalink_url", "")
        dur = item.get("duration", 0)
        # Quality filter: need artwork + URL + at least 30s
        if not purl or not artwork or dur < 30000:
            continue
        tracks.append({
            "id": str(item.get("id", "")),
            "title": item.get("title", "Unknown"),
            "user": {"username": (item.get("user") or {}).get("username", "Unknown")},
            "duration": dur,
            "artwork_url": artwork,
            "url": purl,
            "plays": item.get("playback_count", 0) or 0,
        })
    # Sort by play count — most popular first
    tracks.sort(key=lambda t: t["plays"], reverse=True)
    return tracks


async def sc_api_resolve(track_url: str) -> str | None:
    cid = await get_client_id()
    if not cid:
        return None
    try:
        async with aiohttp.ClientSession() as s:
            resolve = f"https://api-v2.soundcloud.com/resolve?url={track_url}&client_id={cid}"
            async with s.get(resolve, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    return None
                data = await r.json()
            transcodings = (data.get("media") or {}).get("transcodings") or []
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
_url_cache: dict = {}
URL_TTL = 30 * 60
_search_cache: dict = {}
SEARCH_TTL = 10 * 60
_resolve_futures: dict = {}
_dl_tasks: dict = {}

def cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()

def find_cached(key: str):
    p = os.path.join(CACHE_DIR, f"{key}.mp3")
    return p if os.path.exists(p) and os.path.getsize(p) > 10240 else None


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
        media_url = await sc_api_resolve(url)
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
    except Exception:
        try: fut.set_result(None)
        except: pass
        return None
    finally:
        _resolve_futures.pop(url, None)


async def _bg_resolve(url: str):
    try: await resolve_url(url)
    except: pass


async def get_hls_segments(hls_url: str) -> list:
    async with aiohttp.ClientSession() as s:
        async with s.get(hls_url) as r:
            text = await r.text()
    return [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]


# ── Artist pools (7 sections, 30 artists each) ──────────────────────────────
POOLS = {
    "new": [
        'Drake', 'The Weeknd', 'SZA', 'Dua Lipa', 'Bad Bunny', 'Billie Eilish',
        'Olivia Rodrigo', 'Ariana Grande', 'Post Malone', 'Doja Cat',
        'Travis Scott', 'Bruno Mars', 'Sabrina Carpenter', 'Tyla', 'Rema',
        'Charli XCX', 'Tems', 'Rosalía', 'Karol G', 'Anitta',
        'Lana Del Rey', 'Hozier', 'Troye Sivan', 'Raye', 'Chappell Roan',
        'Rihanna', 'Ed Sheeran', 'Justin Bieber', 'Shawn Mendes', 'Taylor Swift',
    ],
    "trending": [
        'Kendrick Lamar', 'Playboi Carti', 'Future', 'Metro Boomin', 'Kanye West',
        'Don Toliver', '21 Savage', 'Tyler the Creator', 'J. Cole', 'A$AP Rocky',
        'Central Cee', 'Ice Spice', 'Baby Keem', 'Gunna', 'Lil Baby',
        'Stormzy', 'Dave', 'PinkPantheress', 'Jack Harlow', 'Lil Nas X',
        'Pop Smoke', 'Roddy Ricch', 'Polo G', 'NLE Choppa', 'Juice WRLD',
        'XXXTentacion', 'Lil Uzi Vert', 'Young Thug', 'Offset', 'Nicki Minaj',
    ],
    "russian": [
        'Скриптонит', 'Miyagi', 'Макс Корж', 'Oxxxymiron', 'Элджей',
        'Pharaoh', 'Платина', 'Big Baby Tape', 'Mayot', 'OG Buda',
        'Баста', 'Хаски', 'Noize MC', 'FACE', 'Markul',
        'Jony', 'Rauf Faik', 'MACAN', 'Xcho', 'Три дня дождя',
        'Земфира', 'Molchat Doma', 'IC3PEAK', 'Кино', 'Монеточка',
        'Слава Марлов', 'Тима Белорусских', 'Мот', 'Andro', 'Ramil',
    ],
    "chill": [
        'Joji', 'nujabes', 'Lofi Girl', 'Khruangbin', 'Mac DeMarco',
        'Clairo', 'Rex Orange County', 'boy pablo', 'Men I Trust', 'FKJ',
        'Tom Misch', 'Bonobo', 'Tycho', 'ODESZA', 'Toro y Moi',
        'keshi', 'Still Woozy', 'Cuco', 'beabadoobee', 'Masego',
        'Jordan Rakei', 'BadBadNotGood', 'Nils Frahm', 'Sampha', 'Bon Iver',
        'Cigarettes After Sex', 'Beach House', 'Phoebe Bridgers', 'Mitski', 'Japanese Breakfast',
    ],
    "rnb": [
        'Frank Ocean', 'Daniel Caesar', 'Steve Lacy', 'Brent Faiyaz', 'H.E.R.',
        'Khalid', 'Summer Walker', 'Jhené Aiko', 'Bryson Tiller', 'PartyNextDoor',
        'Omar Apollo', 'Kali Uchis', 'Kehlani', 'Giveon', 'Ari Lennox',
        'Victoria Monét', 'Tinashe', 'Anderson .Paak', '6LACK', 'Lucky Daye',
        'Snoh Aalegra', 'Ravyn Lenae', 'Dominic Fike', 'Ty Dolla Sign', 'dvsn',
        'Sabrina Claudio', 'Solange', 'Blood Orange', 'James Blake', 'FKA twigs',
    ],
    "electronic": [
        'Skrillex', 'Flume', 'Fred again', 'Disclosure', 'Kaytranada',
        'Peggy Gou', 'Gesaffelstein', 'Porter Robinson', 'Madeon', 'Deadmau5',
        'ZHU', 'Rezz', 'RÜFÜS DU SOL', 'Bicep', 'Four Tet',
        'Jamie xx', 'Caribou', 'Jon Hopkins', 'Aphex Twin', 'Burial',
        'Fisher', 'Chris Lake', 'John Summit', 'Dom Dolla', 'Illenium',
        'Kavinsky', 'The Midnight', 'M83', 'Grimes', 'Justice',
    ],
    "indie": [
        'Tame Impala', 'Arctic Monkeys', 'Glass Animals', 'Radiohead', 'The 1975',
        'Gorillaz', 'Cage the Elephant', 'Foster the People', 'MGMT', 'Hozier',
        'Alvvays', 'Snail Mail', 'Soccer Mommy', 'Faye Webster', 'TV Girl',
        'The Neighbourhood', 'Wallows', 'Peach Pit', 'Current Joys', 'Surf Curse',
        'King Krule', 'Mac DeMarco', 'Alex G', 'Dijon', 'Mk.gee',
        'Slowdive', 'My Bloody Valentine', 'Cocteau Twins', 'The Cure', 'Joy Division',
    ],
}

SECTION_KEYS = list(POOLS.keys())

# ── Catalog ──────────────────────────────────────────────────────────────────
_catalog = {k: [] for k in SECTION_KEYS}
_catalog["ts"] = 0
_catalog_building = False


async def _build_section(key: str) -> list:
    """Search 4 random artists, 6 results each, interleave → ~20 unique tracks."""
    pool = POOLS.get(key, [])
    if len(pool) < 4:
        return []
    artists = random.sample(pool, 4)
    results = await asyncio.gather(*[sc_api_search(a, 6) for a in artists])
    mixed = []
    seen = set()
    max_len = max((len(r) for r in results), default=0)
    for i in range(max_len):
        for r in results:
            if i < len(r) and r[i]["id"] not in seen:
                seen.add(r[i]["id"])
                mixed.append(r[i])
    return mixed[:20]  # max 20 per section


async def _resolve_catalog_tracks(tracks: list):
    """Resolve all track URLs and add media_url to each track."""
    async def _resolve_one(t):
        url = t.get("url")
        if not url:
            return
        media = await resolve_url(url)
        if media:
            t["media_url"] = media
    # Resolve up to 5 at a time to not overwhelm
    for i in range(0, len(tracks), 5):
        batch = tracks[i:i+5]
        await asyncio.gather(*[_resolve_one(t) for t in batch])


async def build_catalog():
    global _catalog, _catalog_building
    if _catalog_building:
        return
    _catalog_building = True
    try:
        for key in SECTION_KEYS:
            try:
                tracks = await _build_section(key)
                if tracks:
                    _catalog[key] = tracks
            except Exception as e:
                print(f"[Catalog] {key} failed: {e}")
        _catalog["ts"] = time.time()
        total = sum(len(_catalog[k]) for k in SECTION_KEYS)
        print(f"[Catalog] Built: {total} tracks across {len(SECTION_KEYS)} sections, resolving URLs...")

        # Pre-resolve all track URLs (adds media_url for direct CDN playback)
        all_tracks = []
        for k in SECTION_KEYS:
            all_tracks.extend(_catalog[k])
        await _resolve_catalog_tracks(all_tracks)
        resolved = sum(1 for t in all_tracks if t.get("media_url"))
        print(f"[Catalog] Resolved: {resolved}/{len(all_tracks)} tracks ready for instant playback")
    finally:
        _catalog_building = False


async def catalog_refresh_loop():
    await build_catalog()
    while True:
        await asyncio.sleep(5 * 60)
        await build_catalog()


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(catalog_refresh_loop())


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/catalog")
async def get_catalog():
    return _catalog


@app.get("/search")
async def search(q: str, limit: int = 10):
    cache_k = f"{q}:{limit}"
    cached = _search_cache.get(cache_k)
    if cached and time.time() < cached[1]:
        return {"tracks": cached[0]}
    tracks = await sc_api_search(q, limit)
    if not tracks:
        try:
            proc = await asyncio.create_subprocess_exec(
                YT_DLP, f"scsearch{limit}:{q}",
                "--dump-json", "--flat-playlist", "--no-warnings", "--quiet",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=45)
            if proc.returncode == 0 and out.strip():
                tracks = _parse_ytdlp_tracks(out.decode(errors="ignore"))
        except Exception:
            pass
    if tracks:
        _search_cache[cache_k] = (tracks, time.time() + SEARCH_TTL)
        for t in tracks:
            u = t.get("url")
            if u and u not in _url_cache and u not in _resolve_futures:
                asyncio.create_task(_bg_resolve(u))
    return {"tracks": tracks}


def _parse_ytdlp_tracks(out: str) -> list:
    tracks = []
    for line in out.strip().split("\n"):
        if not line.strip(): continue
        try:
            d = json.loads(line)
            artwork = None
            for t in (d.get("thumbnails") or []):
                if t.get("id") in ["t300x300", "t500x500"]:
                    artwork = t["url"]; break
            if not artwork:
                thumbs = d.get("thumbnails") or []
                if thumbs: artwork = thumbs[-1].get("url")
            tracks.append({
                "id": str(d.get("id", "")),
                "title": d.get("title", "Unknown"),
                "user": {"username": d.get("uploader") or d.get("channel") or "Unknown"},
                "duration": int((d.get("duration") or 0) * 1000),
                "artwork_url": artwork,
                "url": d.get("webpage_url") or d.get("url"),
            })
        except Exception: continue
    return tracks


@app.get("/resolve")
async def resolve_endpoint(url: str):
    media_url = await resolve_url(url)
    return {"ok": bool(media_url), "media_url": media_url}


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
                                    f.write(chunk); yield chunk
                    else:
                        async with s.get(media_url) as r:
                            async for chunk in r.content.iter_chunked(65536):
                                f.write(chunk); yield chunk
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
    key = cache_key(url)
    if find_cached(key): return {"status": "cached"}
    for k in list(_dl_tasks):
        if _dl_tasks[k].done(): del _dl_tasks[k]
    if key in _dl_tasks: return {"status": "downloading"}

    async def _dl():
        media_url = await resolve_url(url)
        if not media_url: return
        p = os.path.join(CACHE_DIR, f"{key}.mp3")
        tmp = p + ".part"
        is_hls = ".m3u8" in media_url or "/m3u8" in media_url
        try:
            async with aiohttp.ClientSession() as s:
                with open(tmp, "wb") as f:
                    if is_hls:
                        for su in await get_hls_segments(media_url):
                            async with s.get(su) as r: f.write(await r.read())
                    else:
                        async with s.get(media_url) as r:
                            async for c in r.content.iter_chunked(65536): f.write(c)
            os.rename(tmp, p)
        except:
            try: os.unlink(tmp)
            except: pass

    _dl_tasks[key] = asyncio.create_task(_dl())
    return {"status": "started"}


if __name__ == "__main__":
    print("WaveBox server -> http://localhost:8888")
    uvicorn.run(app, host="0.0.0.0", port=8888)
