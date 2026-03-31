// WaveBox music service — uses local yt-dlp server
const SERVER = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8888';

export async function searchTracks(query, limit = 20) {
  try {
    const res = await fetch(`${SERVER}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error('server error');
    const data = await res.json();
    return data.tracks || [];
  } catch (e) {
    console.log('search error:', e);
    return getMockTracks();
  }
}

export async function getStreamUrl(track) {
  // If track has a direct URL — ask server for stream
  if (!track.url) return null;
  try {
    const res = await fetch(`${SERVER}/stream?url=${encodeURIComponent(track.url)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.stream_url || null;
  } catch (e) {
    console.log('stream error:', e);
    return null;
  }
}

const POPULAR_QUERIES = [
  'Drake', 'Travis Scott', 'The Weeknd', 'Kendrick Lamar', 'Post Malone',
  'Playboi Carti', 'Future', 'Nav', 'Don Toliver', 'Metro Boomin',
];

const POPULAR_RU = [
  'Моргенштерн', 'FACE', 'Скриптонит', 'Miyagi', 'Элджей', 'Макс Корж',
];

const GENRE_QUERIES = {
  'Lo-Fi': 'lofi hip hop chill beats',
  'Synthwave': 'synthwave retrowave 80s',
  'Ambient': 'ambient atmospheric dark',
  'Hip-Hop': 'Drake Travis Scott Kendrick',
  'Indie': 'indie alternative bedroom pop',
  'Techno': 'techno underground dark',
  'Jazz': 'jazz neo soul smooth',
  'Trap': 'trap dark rap 808',
};

export async function getTopTracks(genre = '', limit = 20) {
  if (genre && GENRE_QUERIES[genre]) {
    return searchTracks(GENRE_QUERIES[genre], limit);
  }
  // Mix popular EN + RU artists
  const all = [...POPULAR_QUERIES, ...POPULAR_RU];
  const q = all[Math.floor(Math.random() * all.length)];
  return searchTracks(q, limit);
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length === 0) {
    // Default: popular mix
    const q = POPULAR_QUERIES[Math.floor(Math.random() * POPULAR_QUERIES.length)];
    return searchTracks(q, 20);
  }
  // Based on liked artists
  const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
  const q = artists[Math.floor(Math.random() * artists.length)];
  return searchTracks(q, 30);
}

export async function getNewReleases(limit = 10) {
  const popular = [
    'Drake 2024', 'Travis Scott new', 'The Weeknd 2024',
    'Моргенштерн 2024', 'Скриптонит новое',
  ];
  const q = popular[Math.floor(Math.random() * popular.length)];
  return searchTracks(q, limit);
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

// Fallback mock data when server is offline
function getMockTracks() {
  return [
    { id: 1, title: 'Server offline — start server.py', user: { username: 'wavebox' }, duration: 0, artwork_url: null, url: null },
  ];
}
