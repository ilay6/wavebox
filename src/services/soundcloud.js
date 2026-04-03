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

// ─── Cache (session only) ────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min — server caches too

async function cachedFetch(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (data?.length > 0) cache.set(key, { data, ts: now });
  return data || [];
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pick2(arr) {
  const i = Math.floor(Math.random() * arr.length);
  let j = Math.floor(Math.random() * (arr.length - 1));
  if (j >= i) j++;
  return [arr[i], arr[j]];
}
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ─── Core search ─────────────────────────────────────────────────────────────
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

// Search 2 queries in parallel, interleave and shuffle for variety
async function search2Mix(q1, q2, limitEach = 5) {
  const [r1, r2] = await Promise.all([
    searchTracks(q1, limitEach),
    searchTracks(q2, limitEach),
  ]);
  // Interleave
  const mixed = [];
  const max = Math.max(r1.length, r2.length);
  for (let i = 0; i < max; i++) {
    if (r1[i]) mixed.push(r1[i]);
    if (r2[i]) mixed.push(r2[i]);
  }
  // Deduplicate
  const seen = new Set();
  return mixed.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

// ─── Home sections — 2 artists per section for variety ───────────────────────

const TRENDING_ARTISTS = [
  'Drake', 'Travis Scott', 'Kendrick Lamar', 'Future', 'Metro Boomin',
  'Playboi Carti', 'Lil Uzi Vert', 'Don Toliver', '21 Savage', 'Kanye West',
  'Post Malone', 'Lil Baby', 'Gunna', 'Tyler the Creator', 'J. Cole',
];

const NEW_ARTISTS = [
  'The Weeknd', 'SZA', 'Doja Cat', 'Bad Bunny', 'Billie Eilish',
  'Dua Lipa', 'Jack Harlow', 'Ice Spice', 'Central Cee', 'Offset',
  'Frank Ocean', 'Daniel Caesar', 'Steve Lacy', 'Dominic Fike', 'Tame Impala',
];

const RU_ARTISTS = [
  'Скриптонит', 'Miyagi', 'Макс Корж', 'FACE', 'Oxxxymiron',
  'Элджей', 'Yanix', 'Boulevard Depo', 'Моргенштерн', 'Платина',
  'Егор Крид', 'Тимати', 'Баста', 'Noize MC', 'Хаски',
];

const CHILL_ARTISTS = [
  'Lofi Girl', 'nujabes', 'jinsang', 'idealism', 'tomppabeats',
  'lo-fi beats', 'chillhop', 'jazz hop', 'Øneheart', 'Reidenshi',
  'Shiloh Dynasty', 'bsd.u', 'Kupla', 'Mondo Loops', 'softy',
];

export async function getTrending(limit = 10) {
  const [a1, a2] = pick2(TRENDING_ARTISTS);
  return cachedFetch(`trending_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getNewReleases(limit = 10) {
  const [a1, a2] = pick2(NEW_ARTISTS);
  return cachedFetch(`new_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getRussianTracks(limit = 10) {
  const [a1, a2] = pick2(RU_ARTISTS);
  return cachedFetch(`ru_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getChillTracks(limit = 10) {
  const [a1, a2] = pick2(CHILL_ARTISTS);
  return cachedFetch(`chill_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    if (artists.length >= 2) {
      const [a1, a2] = pick2(artists);
      return search2Mix(a1, a2, 5);
    }
    if (artists.length === 1) return searchTracks(artists[0], 10);
  }
  // Diverse fallback — mix genres
  const [a1, a2] = pick2([
    ...TRENDING_ARTISTS.slice(0, 5),
    ...CHILL_ARTISTS.slice(0, 3),
    ...RU_ARTISTS.slice(0, 3),
  ]);
  return cachedFetch(`rec_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getTopTracks(genre = '', limit = 15) {
  if (genre) {
    return cachedFetch(`genre_${genre}`, () => searchTracks(genre, limit));
  }
  return getTrending(limit);
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
