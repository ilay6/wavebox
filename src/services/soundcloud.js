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
  try {
    const res = await fetchWithTimeout(
      `${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!res.ok) throw new Error('server error');
    const data = await res.json();
    return data.tracks || [];
  } catch (e) {
    console.log('search error:', e.message);
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

// Pools of artists — random subset each session for variety
const TRENDING_POOLS = [
  ['Drake', 'Travis Scott', 'Future', 'Don Toliver'],
  ['Lil Baby', 'Gunna', 'Young Thug', 'Lil Uzi Vert'],
  ['Drake', 'Kendrick Lamar', 'Future', 'Metro Boomin'],
  ['Travis Scott', 'Playboi Carti', 'Don Toliver', 'Nav'],
];

const NEW_POOLS = [
  ['The Weeknd', 'Post Malone', 'Playboi Carti'],
  ['SZA', 'Frank Ocean', 'Daniel Caesar'],
  ['21 Savage', 'Offset', 'Quavo'],
  ['The Weeknd', 'Post Malone', 'Jack Harlow'],
];

const RU_POOLS = [
  ['Моргенштерн', 'Скриптонит', 'Miyagi'],
  ['FACE', 'Макс Корж', 'Элджей'],
  ['Скриптонит', 'Yanix', 'Oxxxymiron'],
  ['Моргенштерн', 'FACE', 'Boulevard Depo'],
];

const CHILL_POOLS = [
  ['lofi hip hop', 'chillwave study', 'jazz cafe'],
  ['ambient beats', 'lo fi chill', 'peaceful piano'],
  ['lofi girl', 'study beats', 'chill hop'],
  ['synthwave chill', 'dream pop', 'bedroom pop'],
];

export async function getTrending(limit = 15) {
  const pool = pick(TRENDING_POOLS);
  return cachedFetch(`trending_${pool[0]}`, () => searchMultiple(pool, 3));
}

export async function getNewReleases(limit = 10) {
  const pool = pick(NEW_POOLS);
  return cachedFetch(`new_${pool[0]}`, () => searchMultiple(pool, 3));
}

export async function getRussianTracks(limit = 10) {
  const pool = pick(RU_POOLS);
  return cachedFetch(`ru_${pool[0]}`, () => searchMultiple(pool, 3));
}

export async function getChillTracks(limit = 10) {
  const pool = pick(CHILL_POOLS);
  return cachedFetch(`chill_${pool[0]}`, () => searchMultiple(pool, 3));
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    return searchMultiple(artists.slice(0, 4), 4);
  }
  const fallback = pick([
    ['Kendrick Lamar', 'Tyler the Creator', 'J. Cole'],
    ['SZA', 'Frank Ocean', 'H.E.R.'],
    ['Metro Boomin', 'Pharrell', 'Kanye West'],
  ]);
  return cachedFetch(`rec_${fallback[0]}`, () => searchMultiple(fallback, 4));
}

// Genre
const GENRE_ARTISTS = {
  'Lo-Fi':     ['lofi hip hop', 'lofi chill beats', 'study lofi', 'calm lofi'],
  'Synthwave': ['synthwave', 'retrowave', 'outrun synthwave', 'Kavinsky'],
  'Ambient':   ['ambient', 'dark ambient', 'atmospheric music', 'drone ambient'],
  'Hip-Hop':   ['Drake', 'Kendrick Lamar', 'J. Cole', 'Travis Scott'],
  'Indie':     ['indie pop', 'bedroom pop', 'indie folk', 'indie rock'],
  'Techno':    ['techno', 'dark techno', 'underground techno', 'minimal techno'],
  'Jazz':      ['jazz', 'neo soul', 'smooth jazz', 'jazz piano'],
};

export async function getTopTracks(genre = '', limit = 15) {
  if (genre && GENRE_ARTISTS[genre]) {
    return cachedFetch(`genre_${genre}`, () =>
      searchMultiple(GENRE_ARTISTS[genre], 4)
    );
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
