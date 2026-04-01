import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import Hls from 'hls.js';

const PlayerContext = createContext(null);

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

// Get audio URI — tries fast direct URL first, falls back to server download
async function getAudioUri(trackUrl) {
  try {
    // Try to get direct URL quickly (no download needed)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      `${SERVER}/stream_url?url=${encodeURIComponent(trackUrl)}`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch {}
  // Fallback: server downloads file and serves it
  return `${SERVER}/stream?url=${encodeURIComponent(trackUrl)}`;
}

// Unlock browser autoplay policy — must be called synchronously in a user gesture
let _audioUnlocked = false;
function unlockAudio() {
  if (_audioUnlocked || typeof window === 'undefined') return;
  _audioUnlocked = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const ctx = new AC(); ctx.resume().then(() => ctx.close()).catch(() => {}); }
  } catch {}
}

// ── URL cache: prefetch HLS URLs so playback starts instantly ─────────────────
const _urlCache = new Map(); // trackUrl → { hlsUrl, expires }
const URL_TTL = 8 * 60 * 1000; // 8 min (SoundCloud HLS URLs last ~10 min)

async function resolveHlsUrl(trackUrl) {
  const cached = _urlCache.get(trackUrl);
  if (cached && Date.now() < cached.expires) return cached.hlsUrl;
  try {
    const res = await fetch(`${SERVER}/stream_url?url=${encodeURIComponent(trackUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        _urlCache.set(trackUrl, { hlsUrl: data.url, expires: Date.now() + URL_TTL });
        return data.url;
      }
    }
  } catch {}
  return null;
}

export function prefetchTracks(tracks) {
  // Prefetch HLS URLs for the given tracks in background — makes playback instant
  if (Platform.OS !== 'web' || !tracks?.length) return;
  tracks.slice(0, 6).forEach(t => { if (t?.url) resolveHlsUrl(t.url); });
}

// Get the best playable URI for a track
async function getAudioUri(trackUrl) {
  const hlsUrl = await resolveHlsUrl(trackUrl);
  if (hlsUrl) return hlsUrl;
  return `${SERVER}/stream?url=${encodeURIComponent(trackUrl)}`;
}

// Fire-and-forget preload (server caches download for native)
function preloadTrack(track) {
  if (!track?.url) return;
  fetch(`${SERVER}/preload?url=${encodeURIComponent(track.url)}`).catch(() => {});
}

// ── Web Audio Engine with 5-band EQ ──────────────────────────────────────────
class WebAudio {
  constructor() {
    this.audio = null;
    this.hls = null;
    this.ctx = null;   // AudioContext — kept alive across track switches
    this.source = null;
    this.filters = [];
    this.eqGains = [0, 0, 0, 0, 0]; // persist across tracks
    this.onStatus = null;
  }

  _initCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { this.ctx = new AC(); this.ctx.resume().catch(() => {}); }
  }

  _buildGraph() {
    if (!this.audio || !this.ctx) return;
    try { this.source?.disconnect(); } catch {}
    try {
      this.source = this.ctx.createMediaElementSource(this.audio);
    } catch (e) {
      // Already connected or CORS — skip EQ silently
      console.log('EQ graph skipped:', e.message);
      return;
    }
    const BANDS = [
      { type: 'lowshelf',  freq: 60    },
      { type: 'peaking',   freq: 250   },
      { type: 'peaking',   freq: 1000  },
      { type: 'peaking',   freq: 4000  },
      { type: 'highshelf', freq: 14000 },
    ];
    this.filters = BANDS.map(({ type, freq }, i) => {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.gain.value = this.eqGains[i]; // restore current EQ settings
      f.Q.value = 1.0;
      return f;
    });
    let node = this.source;
    for (const f of this.filters) { node.connect(f); node = f; }
    node.connect(this.ctx.destination);
  }

  setEqBand(index, gainDb) {
    this.eqGains[index] = gainDb;
    if (this.filters[index]) this.filters[index].gain.value = gainDb;
  }

  _attachEvents() {
    this.audio.ontimeupdate = () => {
      if (!this.audio) return;
      this.onStatus?.({
        isLoaded: true,
        isPlaying: !this.audio.paused,
        positionMillis: this.audio.currentTime * 1000,
        durationMillis: (this.audio.duration || 0) * 1000,
        didJustFinish: false,
      });
    };
    this.audio.onended = () => {
      this.onStatus?.({ isLoaded: true, isPlaying: false, positionMillis: 0, durationMillis: 0, didJustFinish: true });
    };
    this.audio.onerror = (e) => {
      console.log('Audio error:', this.audio?.error?.message || e);
    };
  }

  async load(uri) {
    this.unload();
    this._initCtx();

    this.audio = new Audio();
    this.audio.preload = 'auto';
    this._attachEvents();

    const isHLS = uri.includes('.m3u8') || uri.includes('sndcdn.com');

    if (isHLS && Hls.isSupported()) {
      this.hls = new Hls({ enableWorker: false, lowLatencyMode: false });
      this.hls.loadSource(uri);
      this.hls.attachMedia(this.audio);
      // Build EQ graph after attaching (MSE-fed audio works with Web Audio API)
      this._buildGraph();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 8000);
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(timer); resolve(); });
        this.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { clearTimeout(timer); resolve(); } });
      });
    } else if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari: native HLS
      this.audio.src = uri;
      this._buildGraph();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 8000);
        this.audio.oncanplay = () => { clearTimeout(timer); resolve(); };
        this.audio.load();
      });
    } else {
      // Direct MP3/OGG (fallback stream from server)
      this.audio.crossOrigin = 'anonymous';
      this.audio.src = uri;
      this._buildGraph();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 8000);
        this.audio.oncanplay = () => { clearTimeout(timer); resolve(); };
        this.audio.load();
      });
    }
  }

  async play() {
    if (!this.audio) return;
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
    return this.audio.play().catch(e => console.log('play() blocked:', e.message));
  }

  async pause() { this.audio?.pause(); }

  async setPosition(ms) {
    if (this.audio) this.audio.currentTime = ms / 1000;
  }

  unload() {
    if (this.hls) { try { this.hls.destroy(); } catch {} this.hls = null; }
    if (this.audio) {
      this.audio.pause();
      try { this.source?.disconnect(); } catch {}
      this.source = null;
      this.filters = [];
      // eqGains intentionally kept — persists to next track
      this.audio.src = '';
      this.audio = null;
    }
    // ctx intentionally kept alive — avoids AudioContext limit
  }

  getStatus() {
    if (!this.audio) return { isLoaded: false };
    return {
      isLoaded: true,
      isPlaying: !this.audio.paused,
      positionMillis: this.audio.currentTime * 1000,
      durationMillis: (this.audio.duration || 0) * 1000,
    };
  }
}

// ── Native Audio Engine (expo-av) ─────────────────────────────────────────────
class NativeAudio {
  constructor() { this.sound = null; }

  async load(uri, onStatus) {
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, progressUpdateIntervalMillis: 500 },
      onStatus
    );
    this.sound = sound;
  }

  async play() { await this.sound?.playAsync(); }
  async pause() { await this.sound?.pauseAsync(); }
  async setPosition(ms) { await this.sound?.setPositionAsync(ms); }
  setEqBand() {}

  unload() {
    this.sound?.unloadAsync();
    this.sound = null;
  }

  getStatus() { return { isLoaded: false }; }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [eqGains, setEqGains] = useState([0, 0, 0, 0, 0]);

  const engineRef = useRef(null);
  const currentTrackRef = useRef(null);
  const queueRef = useRef([]);
  const preloadedIdRef = useRef(null);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  function getEngine() {
    if (!engineRef.current) {
      engineRef.current = Platform.OS === 'web' ? new WebAudio() : new NativeAudio();
    }
    return engineRef.current;
  }

  function handleStatus(status) {
    if (!status?.isLoaded) return;
    setProgress(status.positionMillis / 1000);
    setDuration(status.durationMillis / 1000 || 0);
    if (status.isPlaying !== undefined) setIsPlaying(status.isPlaying);

    // Preload next track when 30s remaining
    if (status.durationMillis > 0) {
      const remaining = (status.durationMillis - status.positionMillis) / 1000;
      if (remaining > 0 && remaining < 30) {
        const q = queueRef.current;
        const cur = currentTrackRef.current;
        if (cur) {
          const idx = q.findIndex(t => t.id === cur.id);
          if (idx >= 0 && idx < q.length - 1) {
            const next = q[idx + 1];
            if (next && next.id !== preloadedIdRef.current) {
              preloadedIdRef.current = next.id;
              preloadTrack(next);
            }
          }
        }
      }
    }

    if (status.didJustFinish) {
      const q = queueRef.current;
      const cur = currentTrackRef.current;
      if (!cur || !q.length) return;
      const idx = q.findIndex(t => t.id === cur.id);
      if (idx >= 0 && idx < q.length - 1) playTrack(q[idx + 1], q);
    }
  }

  const playTrack = useCallback(async (track, newQueue = []) => {
    if (!track) return;

    setCurrentTrack(track);
    setLoading(true);
    setError(null);
    setProgress(0);
    setDuration(0);
    setIsPlaying(false);
    preloadedIdRef.current = null;

    const q = newQueue.length ? newQueue : queueRef.current;
    if (newQueue.length) setQueue(newQueue);

    if (!track.url) {
      setLoading(false);
      setError('No URL');
      return;
    }

    try {
      unlockAudio(); // must be synchronous — unlocks autoplay before any awaits
      const engine = getEngine();
      engine.unload();

      const streamUri = await getAudioUri(track.url);

      if (Platform.OS === 'web') {
        engine.onStatus = handleStatus;
        await engine.load(streamUri);
        await engine.play();
        setIsPlaying(true);
      } else {
        await engine.load(streamUri, handleStatus);
        setIsPlaying(true);
      }

      setLoading(false);

      // Preload next track immediately in background
      const idx = q.findIndex(t => t.id === track.id);
      if (idx >= 0 && idx < q.length - 1) {
        const next = q[idx + 1];
        preloadedIdRef.current = next.id;
        preloadTrack(next);
      }
    } catch (e) {
      console.log('playTrack error:', e);
      setLoading(false);
      setError('Playback failed');
    }
  }, []);

  const togglePlay = useCallback(async () => {
    const engine = getEngine();
    if (isPlaying) {
      await engine.pause();
      setIsPlaying(false);
    } else {
      await engine.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback(async (seconds) => {
    await getEngine().setPosition(seconds * 1000);
    setProgress(seconds);
  }, []);

  const setEqBand = useCallback((index, gainDb) => {
    getEngine().setEqBand?.(index, gainDb);
    setEqGains(prev => {
      const next = [...prev];
      next[index] = gainDb;
      return next;
    });
  }, []);

  const setEqPreset = useCallback((gains) => {
    const engine = getEngine();
    gains.forEach((g, i) => engine.setEqBand?.(i, g));
    setEqGains([...gains]);
  }, []);

  const toggleLike = useCallback((id) => {
    setLiked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    const cur = currentTrackRef.current;
    if (!cur || !q.length) return;
    const idx = q.findIndex(t => t.id === cur.id);
    if (idx >= 0 && idx < q.length - 1) playTrack(q[idx + 1], q);
  }, [playTrack]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    const cur = currentTrackRef.current;
    if (!cur || !q.length) return;
    const idx = q.findIndex(t => t.id === cur.id);
    if (idx > 0) playTrack(q[idx - 1], q);
    else seekTo(0);
  }, [playTrack, seekTo]);

  return (
    <PlayerContext.Provider value={{
      currentTrack, queue, isPlaying, progress, duration, loading, error,
      liked, eqGains,
      playTrack, togglePlay, toggleLike, playNext, playPrev, seekTo,
      setEqBand, setEqPreset, prefetchTracks,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
