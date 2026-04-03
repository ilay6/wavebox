import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const PlayerContext = createContext(null);

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

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

// Build stream URL — server handles caching, no need for client-side URL cache
function getStreamUrl(trackUrl) {
  return `${SERVER}/stream?url=${encodeURIComponent(trackUrl)}`;
}

// Warm up server URL cache — ~1.5s, eliminates yt-dlp wait on playback
function resolveTrack(track) {
  if (!track?.url) return;
  fetch(`${SERVER}/resolve?url=${encodeURIComponent(track.url)}`).catch(() => {});
}

// Tell server to fully download and cache a track in background
function preloadTrack(track) {
  if (!track?.url) return;
  fetch(`${SERVER}/preload?url=${encodeURIComponent(track.url)}`).catch(() => {});
}

// Batch resolve — warms server cache for all tracks at once
function batchResolve(tracks) {
  const urls = tracks.map(t => t.url).filter(Boolean);
  if (!urls.length) return;
  fetch(`${SERVER}/batch-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(urls.slice(0, 10)),
  }).catch(() => {});
}

// Called when a track list loads — resolve URLs for all visible tracks,
// fully preload the first 3 so they play instantly
export function prefetchTracks(tracks) {
  if (Platform.OS !== 'web' || !tracks?.length) return;
  // Batch resolve all track URLs on server (single request)
  batchResolve(tracks);
  // Fully download first 3
  tracks.slice(0, 3).forEach(t => preloadTrack(t));
}

// ── Web Audio Engine with 5-band EQ + Analyser ───────────────────────────────
class WebAudio {
  constructor() {
    this.audio = null;
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.filters = [];
    this.eqGains = [0, 0, 0, 0, 0]; // persist across tracks
    this.onStatus = null;
    this._freqData = null;
    this._graphConnected = false;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { this.ctx = new AC(); this.ctx.resume().catch(() => {}); }
  }

  // Build full graph: source → analyser → eq filters → destination
  _buildGraph() {
    if (!this.audio || !this.ctx || this._graphConnected) return;
    try {
      this.source = this.ctx.createMediaElementSource(this.audio);
    } catch { return; }
    this._graphConnected = true;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
    this._freqData = new Uint8Array(this.analyser.frequencyBinCount);

    const BANDS = [
      { type: 'lowshelf',  freq: 60 },
      { type: 'peaking',   freq: 250 },
      { type: 'peaking',   freq: 1000 },
      { type: 'peaking',   freq: 4000 },
      { type: 'highshelf', freq: 14000 },
    ];
    this.filters = BANDS.map(({ type, freq }, i) => {
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      f.gain.value = this.eqGains[i]; f.Q.value = 1.0;
      return f;
    });

    // source → analyser → filter1..5 → destination
    this.source.connect(this.analyser);
    let node = this.analyser;
    for (const f of this.filters) { node.connect(f); node = f; }
    node.connect(this.ctx.destination);
  }

  setEqBand(index, gainDb) {
    this.eqGains[index] = gainDb;
    if (this.filters[index]) this.filters[index].gain.value = gainDb;
  }

  getFrequencyData() {
    if (!this.analyser || !this._freqData) return null;
    this.analyser.getByteFrequencyData(this._freqData);
    return this._freqData;
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
      console.warn('Audio error:', this.audio?.error?.message || e);
      this.onError?.('Audio failed to load');
    };
  }

  load(uri) {
    this.unload();

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this._attachEvents();

    // Build audio graph for analyser/EQ
    this._ensureCtx();
    this._buildGraph();

    this.audio.src = uri;
    this.audio.load();
  }

  // Wait for audio to be ready then play — handles slow streaming
  async play() {
    if (!this.audio) return;
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});

    // If audio has enough data, play immediately
    if (this.audio.readyState >= 2) {
      return this.audio.play().catch(e => console.warn('play():', e.message));
    }

    // Otherwise wait for canplay event (server is resolving stream)
    return new Promise((resolve) => {
      const onReady = () => {
        this.audio?.removeEventListener('canplay', onReady);
        this.audio?.play().then(resolve).catch(e => {
          console.warn('play():', e.message);
          resolve();
        });
      };
      this.audio.addEventListener('canplay', onReady);

      // Timeout — don't wait forever
      setTimeout(() => {
        this.audio?.removeEventListener('canplay', onReady);
        this.audio?.play().then(resolve).catch(() => resolve());
      }, 30000);
    });
  }

  async pause() { this.audio?.pause(); }

  async setPosition(ms) {
    if (this.audio) this.audio.currentTime = ms / 1000;
  }

  setVolume(v) {
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, v));
  }

  unload() {
    if (this.audio) {
      this.audio.pause();
      if (this._graphConnected) {
        try { this.source?.disconnect(); } catch {}
        try { this.analyser?.disconnect(); } catch {}
        this.filters.forEach(f => { try { f?.disconnect(); } catch {} });
        this.source = null;
        this.analyser = null;
        this._freqData = null;
        this.filters = [];
        this._graphConnected = false;
      }
      this.audio.src = '';
      this.audio = null;
    }
    // ctx and eqGains stay alive across tracks
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
  setVolume() {}

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

    // Preload next tracks when 20s remaining
    if (status.durationMillis > 0) {
      const remaining = (status.durationMillis - status.positionMillis) / 1000;
      if (remaining > 0 && remaining < 20) {
        const q = queueRef.current;
        const cur = currentTrackRef.current;
        if (cur) {
          const idx = q.findIndex(t => t.id === cur.id);
          if (idx >= 0) {
            const next = q[idx + 1];
            if (next && next.id !== preloadedIdRef.current) {
              preloadedIdRef.current = next.id;
              preloadTrack(next);
              const next2 = q[idx + 2];
              if (next2) resolveTrack(next2);
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
      unlockAudio();

      const engine = getEngine();
      const streamUri = getStreamUrl(track.url);

      if (Platform.OS === 'web') {
        engine.onStatus = handleStatus;
        engine.onError = (msg) => { setError(msg); setLoading(false); };
        engine.load(streamUri);
        await engine.play(); // waits for canplay — handles slow server
        setIsPlaying(true);
      } else {
        await engine.load(streamUri, handleStatus);
        setIsPlaying(true);
      }

      setLoading(false);

      // Preload next 3 tracks immediately — so switching is instant
      const idx = q.findIndex(t => t.id === track.id);
      if (idx >= 0) {
        for (let i = 1; i <= 3; i++) {
          const next = q[idx + i];
          if (next) {
            if (i <= 2) preloadTrack(next);  // fully download next 2
            else resolveTrack(next);          // just resolve URL for 3rd
          }
        }
      }
    } catch (e) {
      console.log('playTrack error:', e);
      setLoading(false);
      setError('Playback failed');
    }
  }, []);

  const togglePlay = useCallback(async () => {
    unlockAudio();
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

  const setVolume = useCallback((v) => {
    getEngine().setVolume?.(v);
  }, []);

  const getFrequencyData = useCallback(() => {
    return engineRef.current?.getFrequencyData?.() ?? null;
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
      playTrack, togglePlay, toggleLike, playNext, playPrev, seekTo, setVolume, getFrequencyData,
      setEqBand, setEqPreset, prefetchTracks,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
