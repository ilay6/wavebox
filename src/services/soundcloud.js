// WaveBox music service — uses server with SoundCloud API
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

// Wake up Render server immediately on page load (free tier sleeps after 15min)
if (typeof window !== 'undefined') {
  fetch(`${SERVER}/health`).catch(() => {});
}

function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ─── Catalog: get ALL home sections in one request (~200ms) ─────────────────
let _catalogCache = null;
let _catalogTs = 0;
const CATALOG_TTL = 2 * 60 * 1000; // re-fetch after 2 min

export async function getCatalog() {
  const now = Date.now();
  if (_catalogCache && now - _catalogTs < CATALOG_TTL) return _catalogCache;
  try {
    const res = await fetchWithTimeout(`${SERVER}/catalog`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    // Only cache if we got actual tracks
    if (data.new?.length || data.trending?.length) {
      _catalogCache = data;
      _catalogTs = now;
    }
    return data;
  } catch (e) {
    console.warn('[WaveBox] catalog failed:', e.message);
    return { new: [], trending: [], russian: [], chill: [] };
  }
}

// ─── Core search (for genre buttons, wave, manual search) ───────────────────
const searchCache = new Map();
const SEARCH_CACHE_TTL = 2 * 60 * 1000;

export async function searchTracks(query, limit = 5) {
  const key = `${query}:${limit}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.ts < SEARCH_CACHE_TTL) return hit.data;

  const url = `${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`server ${res.status}`);
    const data = await res.json();
    const tracks = data.tracks || [];
    if (tracks.length > 0) searchCache.set(key, { data: tracks, ts: Date.now() });
    return tracks;
  } catch (e) {
    console.warn('[WaveBox] search failed:', query, e.message);
    return [];
  }
}

// ─── Genre buttons ──────────────────────────────────────────────────────────
function pickN(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

const GENRE_ARTISTS = {
  'Hip-Hop': [
    'Drake', 'Travis Scott', 'Kendrick Lamar', 'Playboi Carti', 'Future',
    'Kanye West', 'J. Cole', 'Tyler the Creator', '21 Savage', 'Metro Boomin',
    'Central Cee', 'Pop Smoke', 'A$AP Rocky', 'Lil Baby', 'Don Toliver',
  ],
  'Lo-Fi': [
    'Lofi Girl', 'nujabes', 'jinsang', 'idealism', 'tomppabeats',
    'Kupla', 'potsu', 'Joji', 'Clairo', 'keshi',
  ],
  'Synthwave': [
    'Kavinsky', 'The Midnight', 'FM-84', 'Carpenter Brut', 'Perturbator',
    'Timecop1983', 'Gunship', 'Lazerhawk', 'Dance With the Dead',
  ],
  'Ambient': [
    'Brian Eno', 'Aphex Twin', 'Nils Frahm', 'Boards of Canada',
    'Sigur Rós', 'Max Richter', 'Tim Hecker', 'Grouper',
  ],
  'Indie': [
    'Tame Impala', 'Arctic Monkeys', 'Glass Animals', 'Radiohead', 'The 1975',
    'Lana Del Rey', 'Bon Iver', 'Mitski', 'Phoebe Bridgers', 'TV Girl',
  ],
  'Techno': [
    'Amelie Lens', 'Charlotte de Witte', 'Nina Kraviz', 'Peggy Gou',
    'Fisher', 'Fred again', 'John Summit', 'Bicep', 'Gesaffelstein',
  ],
  'Jazz': [
    'FKJ', 'Tom Misch', 'Masego', 'BadBadNotGood', 'Robert Glasper',
    'Kamasi Washington', 'Yussef Dayes', 'Alfa Mist', 'Snarky Puppy',
  ],
};

export async function getTopTracks(genre = '', limit = 15) {
  const pool = GENRE_ARTISTS[genre];
  if (pool && pool.length >= 2) {
    const [a1, a2] = pickN(pool, 2);
    const [r1, r2] = await Promise.all([searchTracks(a1, 7), searchTracks(a2, 7)]);
    const mixed = [];
    const seen = new Set();
    for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
      for (const lst of [r1, r2]) {
        if (lst[i] && !seen.has(lst[i].id)) { seen.add(lst[i].id); mixed.push(lst[i]); }
      }
    }
    return mixed;
  }
  if (genre) return searchTracks(genre, limit);
  return searchTracks('trending music', limit);
}

// "My Wave" — search based on liked artists or random mix
export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    if (artists.length >= 2) {
      const [a1, a2] = pickN(artists, 2);
      const [r1, r2] = await Promise.all([searchTracks(a1, 5), searchTracks(a2, 5)]);
      const mixed = [];
      for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
        if (r1[i]) mixed.push(r1[i]);
        if (r2[i]) mixed.push(r2[i]);
      }
      return mixed;
    }
    if (artists.length === 1) return searchTracks(artists[0], 10);
  }
  const all = Object.values(GENRE_ARTISTS).flat();
  const [a1, a2] = pickN(all, 2);
  const [r1, r2] = await Promise.all([searchTracks(a1, 5), searchTracks(a2, 5)]);
  const mixed = [];
  for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
    if (r1[i]) mixed.push(r1[i]);
    if (r2[i]) mixed.push(r2[i]);
  }
  return mixed;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
export function formatDuration(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function formatCount(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}
