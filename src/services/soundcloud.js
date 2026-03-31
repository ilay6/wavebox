// WaveBox music service — uses yt-dlp server
const SERVER = process.env.EXPO_PUBLIC_API_URL || 'https://wavebox-w3ft.onrender.com';

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

// Wake up Render server (free tier sleeps after inactivity)
export async function pingServer() {
  try {
    await fetch(`${SERVER}/health`, { signal: AbortSignal.timeout(8000) });
  } catch {}
}

// ─── Core search ─────────────────────────────────────────────────────────────
export async function searchTracks(query, limit = 20) {
  try {
    const res = await fetch(
      `${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: AbortSignal.timeout(25000) }
    );
    if (!res.ok) throw new Error('server error');
    const data = await res.json();
    return data.tracks || [];
  } catch (e) {
    console.log('search error:', e);
    return [];
  }
}

// ─── Home sections — fixed diverse queries ───────────────────────────────────

// Trending: popular US hip-hop / rap
export async function getTrending(limit = 15) {
  return cachedFetch('trending', () =>
    searchTracks('Drake Travis Scott Future Don Toliver', limit)
  );
}

// New releases: recent hits
export async function getNewReleases(limit = 10) {
  return cachedFetch('new_releases', () =>
    searchTracks('The Weeknd Post Malone Playboi Carti 2024', limit)
  );
}

// Russian section
export async function getRussianTracks(limit = 10) {
  return cachedFetch('russian', () =>
    searchTracks('Моргенштерн Скриптонит FACE Miyagi', limit)
  );
}

// Chill / lofi
export async function getChillTracks(limit = 10) {
  return cachedFetch('chill', () =>
    searchTracks('lofi hip hop chill beats study', limit)
  );
}

// Recommended: based on liked or default popular mix
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

// Genre search with cache
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
    const res = await fetch(
      `${SERVER}/stream?url=${encodeURIComponent(track.url)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.stream_url || null;
  } catch (e) {
    console.log('stream error:', e);
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
