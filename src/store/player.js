import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const PlayerContext = createContext(null);
const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SERVER = process.env.EXPO_PUBLIC_API_URL ||
  (isLocal ? 'http://localhost:8888' : 'https://wavebox-w3ft.onrender.com');

// ── Web Audio Engine (HTML5) ────────────────────────────────────────────────
class WebAudio {
  constructor() {
    this.audio = null;
    this.onStatus = null;
  }

  async load(uri) {
    this.unload();
    this.audio = new Audio();
    // Do NOT set crossOrigin — SoundCloud CDN blocks it
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
      console.log('audio error', e);
      this.onStatus?.({ isLoaded: false, error: true });
    };

    return new Promise((resolve) => {
      // Resolve on canplay OR after 3s (some streams don't fire canplay)
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 3000);
      this.audio.oncanplay = done;
      this.audio.load();
    });
  }

  async play() { await this.audio?.play(); }
  async pause() { this.audio?.pause(); }
  async setPosition(ms) { if (this.audio) this.audio.currentTime = ms / 1000; }

  unload() {
    if (this.audio) {
      this.audio.pause();
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

// ── Native Audio Engine (expo-av) ──────────────────────────────────────────
class NativeAudio {
  constructor() { this.sound = null; }

  async load(uri, onStatus) {
    const { Audio } = require('expo-av');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
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

  unload() {
    this.sound?.unloadAsync();
    this.sound = null;
  }
}

// ── Resolve stream URL ─────────────────────────────────────────────────────
async function resolveStream(track) {
  if (!track?.url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(
      `${SERVER}/stream?url=${encodeURIComponent(track.url)}`,
      { signal: controller.signal }
    ).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const d = await res.json();
    return d.stream_url || null;
  } catch { return null; }
}

// ── Provider ───────────────────────────────────────────────────────────────
export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const engineRef = useRef(null);
  const currentTrackRef = useRef(null);
  const queueRef = useRef([]);

  // Keep refs in sync
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  function getEngine() {
    if (!engineRef.current) {
      engineRef.current = Platform.OS === 'web' ? new WebAudio() : new NativeAudio();
    }
    return engineRef.current;
  }

  function handleStatus(status) {
    if (!status.isLoaded) return;
    setProgress(status.positionMillis / 1000);
    setDuration(status.durationMillis / 1000 || 0);
    setIsPlaying(status.isPlaying ?? true);

    if (status.didJustFinish) {
      const q = queueRef.current;
      const cur = currentTrackRef.current;
      if (!cur || !q.length) return;
      const idx = q.findIndex(t => t.id === cur.id);
      if (idx < q.length - 1) playTrack(q[idx + 1], q);
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

    const q = newQueue.length ? newQueue : queueRef.current;
    if (newQueue.length) setQueue(newQueue);

    try {
      // Unload previous
      getEngine().unload();

      const streamUrl = await resolveStream(track);
      if (!streamUrl) {
        setError('Stream unavailable');
        setLoading(false);
        // Auto-skip to next
        const idx = q.findIndex(t => t.id === track.id);
        if (idx < q.length - 1) {
          setTimeout(() => playTrack(q[idx + 1], q), 300);
        }
        return;
      }

      const engine = getEngine();
      if (Platform.OS === 'web') {
        engine.onStatus = handleStatus;
        await engine.load(streamUrl);
        try {
          await engine.play();
        } catch (playErr) {
          // Autoplay might be blocked by browser — just show play button, don't skip
          console.log('play() blocked (autoplay policy):', playErr.message);
        }
      } else {
        await engine.load(streamUrl, handleStatus);
      }

      setIsPlaying(true);
      setLoading(false);
    } catch (e) {
      console.log('playTrack error:', e);
      setLoading(false);
      setError('Track unavailable');
      // Only auto-skip if stream truly failed (not just play() rejection)
    }
  }, []);

  const togglePlay = useCallback(async () => {
    const engine = getEngine();
    const status = engine.getStatus?.();
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
    if (idx < q.length - 1) playTrack(q[idx + 1], q);
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
      liked, playTrack, togglePlay, toggleLike, playNext, playPrev, seekTo,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
