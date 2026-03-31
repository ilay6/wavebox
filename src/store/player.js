import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const PlayerContext = createContext(null);

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

// Build stream URL — server downloads & caches the audio file
function buildStreamUrl(trackUrl) {
  return `${SERVER}/stream?url=${encodeURIComponent(trackUrl)}`;
}

// Fire-and-forget preload (server caches for instant next play)
function preloadTrack(track) {
  if (!track?.url) return;
  fetch(`${SERVER}/preload?url=${encodeURIComponent(track.url)}`).catch(() => {});
}

// ── Web Audio Engine with 5-band EQ ──────────────────────────────────────────
class WebAudio {
  constructor() {
    this.audio = null;
    this.ctx = null;
    this.source = null;
    this.filters = [];   // 5 BiquadFilterNode
    this.eqGains = [0, 0, 0, 0, 0];
    this.onStatus = null;
  }

  _buildGraph() {
    if (!this.audio || !this.ctx) return;
    try { this.source?.disconnect(); } catch {}

    this.source = this.ctx.createMediaElementSource(this.audio);

    // 5-band EQ: Bass(60) Low(250) Mid(1k) High(4k) Air(14k)
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
      f.gain.value = this.eqGains[i];
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

  async load(uri) {
    this.unload();

    // Init AudioContext lazily
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous'; // required for Web Audio API; OK since we proxy via our server
    this.audio.preload = 'auto';
    this.audio.src = uri;

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
      this.onStatus?.({ isLoaded: false, error: true });
    };

    // Wait for enough data to play
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 5000); // give up waiting, try to play anyway
      this.audio.oncanplay = done;
      this.audio.load();
    });
  }

  async play() {
    if (!this.audio) return;

    // Resume context (may be suspended due to autoplay policy)
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});

    // Build Web Audio graph on first play (requires user gesture)
    if (this.ctx && !this.source) this._buildGraph();

    return this.audio.play().catch(e => {
      console.log('play() blocked:', e.message);
    });
  }

  async pause() { this.audio?.pause(); }

  async setPosition(ms) {
    if (this.audio) this.audio.currentTime = ms / 1000;
  }

  unload() {
    if (this.audio) {
      this.audio.pause();
      try { this.source?.disconnect(); } catch {}
      this.source = null;
      this.filters = [];
      this.audio.src = '';
      this.audio = null;
    }
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
      const engine = getEngine();
      engine.unload();

      const streamUri = buildStreamUrl(track.url);

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
      setEqBand, setEqPreset,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
