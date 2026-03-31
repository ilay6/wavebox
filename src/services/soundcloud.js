// WaveBox music service — uses yt-dlp server
const SERVER = process.env.EXPO_PUBLIC_API_URL || 'https://wavebox-w3ft.onrender.com';

// ─── Timeout helper (AbortSignal.timeout not universally supported) ───────────
function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Simple in-memory cache ───────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function cachedFetch(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (data && data.length > 0) cache.set(key, { data, ts: now });
  return data;
}

// ─── Core search ─────────────────────────────────────────────────────────────
export async function searchTracks(query, limit = 20) {
  try {
    const res = await fetchWithTimeout(
      `${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      55000 // Render cold start can take up to 50s
    );
    if (!res.ok) throw new Error('server error');
    const data = await res.json();
    return data.tracks || [];
  } catch (e) {
    console.log('search error:', e.message);
    return [];
  }
}

// ─── Home sections — fixed diverse queries ───────────────────────────────────
export async function getTrending(limit = 15) {
  return cachedFetch('trending', () =>
    searchTracks('Drake Travis Scott Future Don Toliver', limit)
  );
}

export async function getNewReleases(limit = 10) {
  return cachedFetch('new_releases', () =>
    searchTracks('The Weeknd Post Malone Playboi Carti 2024', limit)
  );
}

export async function getRussianTracks(limit = 10) {
  return cachedFetch('russian', () =>
    searchTracks('Моргенштерн Скриптонит FACE Miyagi', limit)
  );
}

export async function getChillTracks(limit = 10) {
  return cachedFetch('chill', () =>
    searchTracks('lofi hip hop chill beats study', limit)
  );
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    const q = artists.slice(0, 3).join(' ');
    return searchTracks(q, 20);
  }
  return cachedFetch('recommended', () =>
    searchTracks('Kendrick Lamar Metro Boomin Nav', 20)
  );
}

const GENRE_QUERIES = {
  'Lo-Fi': 'lofi hip hop chill beats study',
  'Synthwave': 'synthwave retrowave outrun 80s',
  'Ambient': 'ambient atmospheric dark drone',
  'Hip-Hop': 'Drake Travis Scott Kendrick Lamar',
  'Indie': 'indie alternative bedroom pop',
  'Techno': 'techno underground dark club',
  'Jazz': 'jazz neo soul smooth cafe',
};

export async function getTopTracks(genre = '', limit = 15) {
  if (genre && GENRE_QUERIES[genre]) {
    return cachedFetch(`genre_${genre}`, () =>
      searchTracks(GENRE_QUERIES[genre], limit)
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
