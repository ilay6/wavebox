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
const CACHE_TTL = 10 * 60 * 1000;

async function cachedFetch(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (data?.length > 0) cache.set(key, { data, ts: now });
  return data || [];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

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

// Search 2 queries, interleave results for variety
async function search2Mix(q1, q2, limitEach = 5) {
  const [r1, r2] = await Promise.all([
    searchTracks(q1, limitEach),
    searchTracks(q2, limitEach),
  ]);
  const mixed = [];
  const max = Math.max(r1.length, r2.length);
  for (let i = 0; i < max; i++) {
    if (r1[i]) mixed.push(r1[i]);
    if (r2[i]) mixed.push(r2[i]);
  }
  const seen = new Set();
  return mixed.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

// ─── Massive artist pools — like Spotify/Yandex Music ────────────────────────

const HIPHOP_RAP = [
  'Drake', 'Travis Scott', 'Kendrick Lamar', 'Future', 'Metro Boomin',
  'Playboi Carti', 'Lil Uzi Vert', 'Don Toliver', '21 Savage', 'Kanye West',
  'Post Malone', 'Lil Baby', 'Gunna', 'Tyler the Creator', 'J. Cole',
  'A$AP Rocky', 'Juice WRLD', 'XXXTentacion', 'Pop Smoke', 'Lil Durk',
  'Young Thug', 'Migos', 'Offset', 'Quavo', 'Takeoff',
  'Roddy Ricch', 'DaBaby', 'Polo G', 'NLE Choppa', 'Lil Tecca',
  'Jack Harlow', 'Central Cee', 'Dave', 'Stormzy', 'Skepta',
  'Ice Spice', 'GloRilla', 'Megan Thee Stallion', 'Cardi B', 'Nicki Minaj',
  'Eminem', 'Jay-Z', '50 Cent', 'Nas', 'Snoop Dogg',
  'Mac Miller', 'Kid Cudi', 'Childish Gambino', 'Logic', 'Denzel Curry',
];

const POP_RNB = [
  'The Weeknd', 'SZA', 'Doja Cat', 'Bad Bunny', 'Billie Eilish',
  'Dua Lipa', 'Harry Styles', 'Olivia Rodrigo', 'Ariana Grande', 'Taylor Swift',
  'Frank Ocean', 'Daniel Caesar', 'Steve Lacy', 'Brent Faiyaz', 'H.E.R.',
  'Khalid', 'Summer Walker', 'Jhené Aiko', 'Bryson Tiller', 'PartyNextDoor',
  'Rihanna', 'Bruno Mars', 'Justin Bieber', 'Ed Sheeran', 'Shawn Mendes',
  'Rosalía', 'Anitta', 'Karol G', 'Ozuna', 'J Balvin',
  'Tyla', 'Tems', 'Ayra Starr', 'Burna Boy', 'Wizkid',
  'Daft Punk', 'The Chainsmokers', 'Marshmello', 'Calvin Harris', 'Kygo',
  'Dominic Fike', 'Omar Apollo', 'Ravyn Lenae', 'Kali Uchis', 'Kehlani',
  'Sabrina Carpenter', 'Chappell Roan', 'Gracie Abrams', 'Addison Rae', 'Madison Beer',
];

const RUSSIAN = [
  'Скриптонит', 'Miyagi', 'Макс Корж', 'FACE', 'Oxxxymiron',
  'Элджей', 'Yanix', 'Boulevard Depo', 'Моргенштерн', 'Платина',
  'Егор Крид', 'Тимати', 'Баста', 'Noize MC', 'Хаски',
  'Pharaoh', 'Lizer', 'Кизару', 'Thomas Mraz', 'Feduk',
  'Джизус', 'GONE.Fludd', 'OG Buda', 'Mayot', 'Bushido Zho',
  'Три дня дождя', 'Мот', 'Jony', 'Andro', 'HammAli & Navai',
  'Rauf & Faik', 'Zivert', 'Niletto', 'Slava Marlow', 'MACAN',
  'Ramil', 'Xcho', 'Ицык Цыпер', 'Markul', 'ATL',
  'Земфира', 'Кино', 'Molchat Doma', 'IC3PEAK', 'Аигел',
  'Guf', 'Тима Белорусских', 'Леша Свик', 'Джарахов', 'Big Baby Tape',
];

const CHILL_LOFI = [
  'Lofi Girl', 'nujabes', 'jinsang', 'idealism', 'tomppabeats',
  'bsd.u', 'Kupla', 'Mondo Loops', 'softy', 'drkmnd',
  'Øneheart', 'Reidenshi', 'Shiloh Dynasty', 'potsu', 'in love with a ghost',
  'Saib', 'j\'san', 'Philanthrope', 'Eevee', 'Aso',
  'Wun Two', 'Swum', 'Joji', 'Rei Brown', 'Clairo',
  'Mac DeMarco', 'Men I Trust', 'boy pablo', 'Still Woozy', 'Wallows',
  'Khruangbin', 'Bonobo', 'Tycho', 'ODESZA', 'Boards of Canada',
  'Toro y Moi', 'Washed Out', 'Neon Indian', 'Com Truise', 'Macroblank',
  'FKJ', 'Tom Misch', 'Jordan Rakei', 'Masego', 'Alfa Mist',
  'Kiefer', 'BadBadNotGood', 'Snarky Puppy', 'Robert Glasper', 'Kamasi Washington',
];

const ELECTRONIC = [
  'Skrillex', 'Diplo', 'Flume', 'Porter Robinson', 'Madeon',
  'Deadmau5', 'Zedd', 'Illenium', 'Seven Lions', 'Excision',
  'RL Grime', 'Baauer', 'Mr. Carmack', 'Kaytranada', 'Disclosure',
  'Jamie xx', 'Four Tet', 'Caribou', 'Jon Hopkins', 'Aphex Twin',
  'Burial', 'Floating Points', 'Bicep', 'Fred again', 'Skream',
  'Rezz', 'ZHU', 'Gesaffelstein', 'Boys Noize', 'Justice',
  'Kavinsky', 'The Midnight', 'FM-84', 'Carpenter Brut', 'Perturbator',
  'Grimes', 'Crystal Castles', 'M83', 'Cigarettes After Sex', 'Beach House',
];

const INDIE_ALT = [
  'Tame Impala', 'Arctic Monkeys', 'Radiohead', 'The Strokes', 'Gorillaz',
  'Glass Animals', 'Cage the Elephant', 'Foster the People', 'MGMT', 'Empire of the Sun',
  'The 1975', 'Hozier', 'Bon Iver', 'Phoebe Bridgers', 'Mitski',
  'Lana Del Rey', 'Lorde', 'FKA twigs', 'Solange', 'Blood Orange',
  'King Krule', 'Daniel Avery', 'Arca', 'Sophie', 'AG Cook',
  'Alvvays', 'Japanese Breakfast', 'Snail Mail', 'Soccer Mommy', 'Faye Webster',
  'Weyes Blood', 'Big Thief', 'Turnstile', 'Fontaines D.C.', 'Black Midi',
  'TV Girl', 'Beabadoobee', 'PinkPantheress', 'Baby Keem', 'Amaarae',
];

// ─── Home sections — pick 2 random artists from huge pools ──────────────────

export async function getTrending(limit = 10) {
  const [a1, a2] = pickN(HIPHOP_RAP, 2);
  return cachedFetch(`trending_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getNewReleases(limit = 10) {
  const [a1, a2] = pickN(POP_RNB, 2);
  return cachedFetch(`new_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getRussianTracks(limit = 10) {
  const [a1, a2] = pickN(RUSSIAN, 2);
  return cachedFetch(`ru_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getChillTracks(limit = 10) {
  const [a1, a2] = pickN(CHILL_LOFI, 2);
  return cachedFetch(`chill_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    if (artists.length >= 2) {
      const [a1, a2] = pickN(artists, 2);
      return search2Mix(a1, a2, 5);
    }
    if (artists.length === 1) return searchTracks(artists[0], 10);
  }
  // Mix from ALL pools for max variety
  const allArtists = [
    ...pickN(HIPHOP_RAP, 3),
    ...pickN(POP_RNB, 3),
    ...pickN(RUSSIAN, 2),
    ...pickN(CHILL_LOFI, 2),
    ...pickN(ELECTRONIC, 2),
    ...pickN(INDIE_ALT, 2),
  ];
  const [a1, a2] = pickN(allArtists, 2);
  return cachedFetch(`rec_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

// ─── Genre sections ──────────────────────────────────────────────────────────

const GENRE_POOLS = {
  'Hip-Hop': HIPHOP_RAP,
  'Lo-Fi':   CHILL_LOFI,
  'Synthwave': ['Kavinsky', 'The Midnight', 'FM-84', 'Carpenter Brut', 'Perturbator', 'Com Truise', 'Timecop1983', 'Gunship', 'Lazerhawk', 'Power Glove'],
  'Ambient':   ['Brian Eno', 'Aphex Twin', 'Stars of the Lid', 'Tim Hecker', 'Grouper', 'William Basinski', 'Nils Frahm', 'Ólafur Arnalds', 'Max Richter', 'Sigur Rós'],
  'Indie':     INDIE_ALT,
  'Techno':    ['Amelie Lens', 'Charlotte de Witte', 'Adam Beyer', 'Enrico Sangiuliano', 'ANNA', 'Kobosil', 'Dax J', 'I Hate Models', 'FJAAK', 'Blawan'],
  'Jazz':      ['Robert Glasper', 'Kamasi Washington', 'Snarky Puppy', 'Alfa Mist', 'BadBadNotGood', 'Yussef Dayes', 'Nubya Garcia', 'Ezra Collective', 'GoGo Penguin', 'Makaya McCraven'],
};

export async function getTopTracks(genre = '', limit = 15) {
  const pool = GENRE_POOLS[genre];
  if (pool) {
    const [a1, a2] = pickN(pool, 2);
    return cachedFetch(`genre_${genre}_${a1}_${a2}`, () => search2Mix(a1, a2, 7));
  }
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
