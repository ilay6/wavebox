// WaveBox music service — uses yt-dlp server
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

// ─── Timeout helper ───────────────────────────────────────────────────────────
function fetchWithTimeout(url, timeoutMs = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ─── Cache (session only — cleared on reload for fresh tracks) ───────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min within session only

async function cachedFetch(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (data?.length > 0) cache.set(key, { data, ts: now });
  return data || [];
}

// Pick a random item from array
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Core search (single artist/query) ───────────────────────────────────────
export async function searchTracks(query, limit = 5) {
  const url = `${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`server ${res.status}`);
    const data = await res.json();
    return data.tracks || [];
  } catch (e) {
    console.warn('[WaveBox] search failed:', query, e.message);
    return [];
  }
}

// ─── Search multiple artists in parallel, mix results ────────────────────────
async function searchMultiple(artists, limitEach = 3) {
  const results = await Promise.all(artists.map(a => searchTracks(a, limitEach)));
  // Interleave results: 1 from each artist, then 2nd from each, etc.
  const mixed = [];
  const max = Math.max(...results.map(r => r.length));
  for (let i = 0; i < max; i++) {
    for (const arr of results) {
      if (arr[i]) mixed.push(arr[i]);
    }
  }
  // Deduplicate by id
  const seen = new Set();
  return mixed.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

// ─── Home sections ────────────────────────────────────────────────────────────

// Artist-based queries — real artists give better results on SoundCloud
const TRENDING_QUERIES = ['Drake', 'Travis Scott', 'Kendrick Lamar', 'Metro Boomin', 'Future'];
const NEW_QUERIES = ['The Weeknd', 'Playboi Carti', 'Don Toliver', 'SZA', '21 Savage'];
const RU_QUERIES = ['Скриптонит', 'Miyagi', 'Макс Корж', 'FACE', 'Oxxxymiron'];
const CHILL_QUERIES = ['Lofi Girl', 'lo-fi beats', 'chillhop', 'nujabes'];

export async function getTrending(limit = 15) {
  const q = pick(TRENDING_QUERIES);
  return cachedFetch(`trending_${q}`, () => searchTracks(q, limit));
}

export async function getNewReleases(limit = 10) {
  const q = pick(NEW_QUERIES);
  return cachedFetch(`new_${q}`, () => searchTracks(q, limit));
}

export async function getRussianTracks(limit = 10) {
  const q = pick(RU_QUERIES);
  return cachedFetch(`ru_${q}`, () => searchTracks(q, limit));
}

export async function getChillTracks(limit = 10) {
  const q = pick(CHILL_QUERIES);
  return cachedFetch(`chill_${q}`, () => searchTracks(q, limit));
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    if (artists.length) return searchTracks(artists[0], 10);
  }
  const fallback = pick(['Drake', 'The Weeknd', 'Travis Scott', 'Kendrick Lamar', 'Скриптонит']);
  return cachedFetch(`rec_${fallback}`, () => searchTracks(fallback, 10));
}

export async function getTopTracks(genre = '', limit = 15) {
  if (genre) {
    return cachedFetch(`genre_${genre}`, () => searchTracks(genre, limit));
  }
  return getTrending(limit);
}

export async function getStreamUrl(track) {
  if (!track.url) return null;
  try {
    const res = await fetchWithTimeout(
      `${SERVER}/stream?url=${encodeURIComponent(track.url)}`,
      20000
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.stream_url || null;
  } catch (e) {
    console.log('stream error:', e.message);
    return null;
  }
}

export function formatDuration(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function formatCount(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}
