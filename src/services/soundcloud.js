// WaveBox music service — uses yt-dlp server
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

function fetchWithTimeout(url, timeoutMs = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Short cache — server has its own 10min cache, client just dedupes within session
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000;

async function cachedFetch(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (data?.length > 0) cache.set(key, { data, ts: now });
  return data || [];
}

function pickN(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
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

// ═══════════════════════════════════════════════════════════════════════════════
// MASSIVE ARTIST DATABASE — 500+ artists
// ═══════════════════════════════════════════════════════════════════════════════

const HIPHOP = [
  // US Rap
  'Drake', 'Travis Scott', 'Kendrick Lamar', 'Future', 'Metro Boomin',
  'Playboi Carti', 'Lil Uzi Vert', 'Don Toliver', '21 Savage', 'Kanye West',
  'Post Malone', 'Lil Baby', 'Gunna', 'Tyler the Creator', 'J. Cole',
  'A$AP Rocky', 'Juice WRLD', 'XXXTentacion', 'Pop Smoke', 'Lil Durk',
  'Young Thug', 'Offset', 'Quavo', 'Roddy Ricch', 'DaBaby',
  'Polo G', 'NLE Choppa', 'Lil Tecca', 'Jack Harlow', 'Lil Nas X',
  'Doja Cat', 'Megan Thee Stallion', 'Cardi B', 'Nicki Minaj', 'Ice Spice',
  'GloRilla', 'Sexyy Red', 'Flo Milli', 'City Girls', 'Saweetie',
  'Eminem', 'Jay-Z', '50 Cent', 'Nas', 'Snoop Dogg',
  'Mac Miller', 'Kid Cudi', 'Childish Gambino', 'Logic', 'Denzel Curry',
  'JID', 'Cordae', 'Baby Keem', 'Vince Staples', 'Isaiah Rashad',
  'ScHoolboy Q', 'Ab-Soul', 'Freddie Gibbs', 'Pusha T', 'Conway the Machine',
  'Westside Gunn', 'Boldy James', 'Earl Sweatshirt', 'Joey Badass', 'Flatbush Zombies',
  // UK Rap
  'Central Cee', 'Dave', 'Stormzy', 'Skepta', 'slowthai',
  'AJ Tracey', 'Headie One', 'Tion Wayne', 'Digga D', 'Aitch',
  'Little Simz', 'Knucks', 'Loyle Carner', 'Jorja Smith', 'Ella Mai',
];

const POP = [
  'The Weeknd', 'SZA', 'Billie Eilish', 'Dua Lipa', 'Harry Styles',
  'Olivia Rodrigo', 'Ariana Grande', 'Taylor Swift', 'Bad Bunny', 'Rosalía',
  'Rihanna', 'Bruno Mars', 'Justin Bieber', 'Ed Sheeran', 'Shawn Mendes',
  'Anitta', 'Karol G', 'Ozuna', 'J Balvin', 'Rauw Alejandro',
  'Tyla', 'Tems', 'Ayra Starr', 'Burna Boy', 'Wizkid',
  'Rema', 'Asake', 'Fireboy DML', 'CKay', 'Omah Lay',
  'Daft Punk', 'The Chainsmokers', 'Marshmello', 'Calvin Harris', 'Kygo',
  'Sabrina Carpenter', 'Chappell Roan', 'Gracie Abrams', 'Madison Beer', 'Dove Cameron',
  'Charli XCX', 'Kim Petras', 'Rina Sawayama', 'Troye Sivan', 'Conan Gray',
  'BTS', 'BLACKPINK', 'NewJeans', 'Stray Kids', 'aespa',
  'XG', 'ATEEZ', 'SEVENTEEN', 'IVE', 'LE SSERAFIM',
];

const RNB_SOUL = [
  'Frank Ocean', 'Daniel Caesar', 'Steve Lacy', 'Brent Faiyaz', 'H.E.R.',
  'Khalid', 'Summer Walker', 'Jhené Aiko', 'Bryson Tiller', 'PartyNextDoor',
  'Dominic Fike', 'Omar Apollo', 'Ravyn Lenae', 'Kali Uchis', 'Kehlani',
  'Snoh Aalegra', 'Lucky Daye', 'Giveon', 'Ari Lennox', 'Victoria Monét',
  'Chloe Bailey', 'Tinashe', 'Ty Dolla Sign', 'Anderson .Paak', '6LACK',
  'dvsn', 'PARTYNEXTDOOR', 'Sabrina Claudio', 'Alina Baraz', 'Mahalia',
  'Solange', 'Blood Orange', 'Sampha', 'James Blake', 'FKA twigs',
  'Syd', 'Kelela', 'Jai Paul', 'SiR', 'Emotional Oranges',
];

const RUSSIAN = [
  // Хип-хоп / рэп
  'Скриптонит', 'Miyagi', 'Макс Корж', 'FACE', 'Oxxxymiron',
  'Элджей', 'Yanix', 'Boulevard Depo', 'Моргенштерн', 'Платина',
  'Pharaoh', 'Lizer', 'Кизару', 'Thomas Mraz', 'Feduk',
  'Джизус', 'GONE.Fludd', 'OG Buda', 'Mayot', 'Bushido Zho',
  'Guf', 'Big Baby Tape', 'Markul', 'ATL', 'Смоки Мо',
  'Хаски', 'Noize MC', 'Баста', 'Loc-Dog', 'Anacondaz',
  // Поп / электроника
  'Егор Крид', 'Тимати', 'Мот', 'Jony', 'Andro',
  'HammAli & Navai', 'Rauf & Faik', 'Zivert', 'Niletto', 'Slava Marlow',
  'MACAN', 'Ramil', 'Xcho', 'Леша Свик', 'Тима Белорусских',
  'Три дня дождя', 'Джарахов', 'Ицык Цыпер', 'Artik & Asti', 'Елена Темникова',
  // Рок / альт / инди
  'Земфира', 'Кино', 'Molchat Doma', 'IC3PEAK', 'Аигел',
  'Дайте танк (!)', 'Пошлая Молли', 'ssshhhiiittt!', 'Shortparis', 'Дельфин',
  'Мумий Тролль', 'Сплин', 'Би-2', 'ДДТ', 'Ленинград',
  'Монеточка', 'Cream Soda', 'Буерак', 'Пасош', 'Sirotkin',
];

const CHILL_LOFI = [
  // Lo-fi producers
  'Lofi Girl', 'nujabes', 'jinsang', 'idealism', 'tomppabeats',
  'bsd.u', 'Kupla', 'Mondo Loops', 'softy', 'drkmnd',
  'Øneheart', 'Reidenshi', 'Shiloh Dynasty', 'potsu', 'in love with a ghost',
  'Saib', 'Philanthrope', 'Eevee', 'Aso', 'SwuM',
  'Wun Two', 'Nymano', 'Quickly Quickly', 'Harris Cole', 'Vanilla',
  'mt. fujitive', 'keshi', 'Rei Brown', 'No Face', 'Jazzinuf',
  // Chill / bedroom pop
  'Joji', 'Clairo', 'Mac DeMarco', 'Men I Trust', 'boy pablo',
  'Still Woozy', 'Wallows', 'Rex Orange County', 'Cuco', 'Gus Dapperton',
  'mxmtoon', 'Conan Gray', 'Cavetown', 'beabadoobee', 'Dayglow',
  // Jazz-hop / neo-soul
  'FKJ', 'Tom Misch', 'Jordan Rakei', 'Masego', 'Alfa Mist',
  'Kiefer', 'BadBadNotGood', 'Snarky Puppy', 'Robert Glasper', 'Kamasi Washington',
  'Yussef Dayes', 'Ezra Collective', 'GoGo Penguin', 'Makaya McCraven', 'Nubya Garcia',
  // Ambient / atmospheric
  'Khruangbin', 'Bonobo', 'Tycho', 'ODESZA', 'Boards of Canada',
  'Toro y Moi', 'Washed Out', 'Com Truise', 'Macroblank', 'Nils Frahm',
];

const ELECTRONIC = [
  // EDM / Bass
  'Skrillex', 'Diplo', 'Flume', 'Porter Robinson', 'Madeon',
  'Deadmau5', 'Zedd', 'Illenium', 'Seven Lions', 'Excision',
  'RL Grime', 'Baauer', 'Mr. Carmack', 'What So Not', 'Alison Wonderland',
  'Subtronics', 'Sullivan King', 'SVDDEN DEATH', 'Liquid Stranger', 'Tipper',
  // House / Disco
  'Kaytranada', 'Disclosure', 'Jamie xx', 'Four Tet', 'Caribou',
  'Peggy Gou', 'Fisher', 'Chris Lake', 'John Summit', 'Dom Dolla',
  'Fred again', 'Skream', 'Mall Grab', 'Ross From Friends', 'Palms Trax',
  // Techno
  'Amelie Lens', 'Charlotte de Witte', 'Adam Beyer', 'Enrico Sangiuliano', 'ANNA',
  'Kobosil', 'Dax J', 'I Hate Models', 'FJAAK', 'Blawan',
  'Nina Kraviz', 'Ben Klock', 'Marcel Dettmann', 'Richie Hawtin', 'Jeff Mills',
  // Synthwave / Retro
  'Kavinsky', 'The Midnight', 'FM-84', 'Carpenter Brut', 'Perturbator',
  'Timecop1983', 'Gunship', 'Lazerhawk', 'Power Glove', 'Dance With the Dead',
  // Experimental
  'Rezz', 'ZHU', 'Gesaffelstein', 'Boys Noize', 'Justice',
  'Grimes', 'Crystal Castles', 'M83', 'Cigarettes After Sex', 'Beach House',
  'Jon Hopkins', 'Aphex Twin', 'Burial', 'Floating Points', 'Bicep',
];

const INDIE_ALT = [
  'Tame Impala', 'Arctic Monkeys', 'Radiohead', 'The Strokes', 'Gorillaz',
  'Glass Animals', 'Cage the Elephant', 'Foster the People', 'MGMT', 'Empire of the Sun',
  'The 1975', 'Hozier', 'Bon Iver', 'Phoebe Bridgers', 'Mitski',
  'Lana Del Rey', 'Lorde', 'Solange', 'Blood Orange', 'King Krule',
  'Alvvays', 'Japanese Breakfast', 'Snail Mail', 'Soccer Mommy', 'Faye Webster',
  'Weyes Blood', 'Big Thief', 'Turnstile', 'Fontaines D.C.', 'Black Midi',
  'TV Girl', 'PinkPantheress', 'Amaarae', 'Raye', 'Rina Sawayama',
  'Deftones', 'System of a Down', 'Bring Me the Horizon', 'Polyphia', 'Chon',
  'The Neighbourhood', 'Wallows', 'Peach Pit', 'Current Joys', 'Surf Curse',
  'Car Seat Headrest', 'Alex G', 'Mk.gee', 'Dijon', 'Bartees Strange',
  'Interpol', 'The National', 'Depeche Mode', 'New Order', 'The Cure',
  'Joy Division', 'Slowdive', 'My Bloody Valentine', 'Cocteau Twins', 'Mazzy Star',
];

// ═══════════════════════════════════════════════════════════════════════════════
// HOME SECTIONS — always different artists each time
// ═══════════════════════════════════════════════════════════════════════════════

// "New Releases" — mix of pop, R&B, hip-hop (mainstream fresh)
export async function getNewReleases() {
  const pool = [...POP, ...RNB_SOUL, ...pickN(HIPHOP, 10)];
  const [a1, a2] = pickN(pool, 2);
  return cachedFetch(`new_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

// "Trending" — mix of everything popular
export async function getTrending() {
  const pool = [...HIPHOP.slice(0, 30), ...POP.slice(0, 20), ...ELECTRONIC.slice(0, 10), ...INDIE_ALT.slice(0, 10)];
  const [a1, a2] = pickN(pool, 2);
  return cachedFetch(`trend_${a1}_${a2}`, () => search2Mix(a1, a2, 7));
}

// "Russian Hits"
export async function getRussianTracks() {
  const [a1, a2] = pickN(RUSSIAN, 2);
  return cachedFetch(`ru_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

// "Chill & Lo-Fi"
export async function getChillTracks() {
  const [a1, a2] = pickN(CHILL_LOFI, 2);
  return cachedFetch(`chill_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

// "My Wave" — ultra diverse, mixes ALL genres
export async function getRecommended(likedTracks = []) {
  if (likedTracks.length > 0) {
    const artists = [...new Set(likedTracks.map(t => t.user?.username).filter(Boolean))];
    if (artists.length >= 2) return search2Mix(...pickN(artists, 2), 5);
    if (artists.length === 1) return searchTracks(artists[0], 10);
  }
  const megaPool = [
    ...pickN(HIPHOP, 5), ...pickN(POP, 5), ...pickN(RNB_SOUL, 3),
    ...pickN(RUSSIAN, 4), ...pickN(CHILL_LOFI, 4),
    ...pickN(ELECTRONIC, 3), ...pickN(INDIE_ALT, 3),
  ];
  const [a1, a2] = pickN(megaPool, 2);
  return cachedFetch(`rec_${a1}_${a2}`, () => search2Mix(a1, a2, 5));
}

// ─── Genre buttons ───────────────────────────────────────────────────────────

const GENRE_POOLS = {
  'Hip-Hop':   HIPHOP,
  'Lo-Fi':     CHILL_LOFI,
  'Synthwave': ELECTRONIC.slice(40, 50),
  'Ambient':   ['Brian Eno', 'Aphex Twin', 'Stars of the Lid', 'Tim Hecker', 'Grouper', 'William Basinski', 'Nils Frahm', 'Ólafur Arnalds', 'Max Richter', 'Sigur Rós', 'Boards of Canada', 'Gas', 'Fennesz'],
  'Indie':     INDIE_ALT,
  'Techno':    ELECTRONIC.slice(20, 35),
  'Jazz':      CHILL_LOFI.slice(40, 55),
};

export async function getTopTracks(genre = '', limit = 15) {
  const pool = GENRE_POOLS[genre];
  if (pool && pool.length >= 2) {
    const [a1, a2] = pickN(pool, 2);
    return cachedFetch(`g_${genre}_${a1}_${a2}`, () => search2Mix(a1, a2, 7));
  }
  if (genre) return cachedFetch(`g_${genre}`, () => searchTracks(genre, limit));
  return getTrending();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
