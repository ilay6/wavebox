import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBackground from '../components/AnimatedBackground';
import { colors } from '../theme';
import { getRecommended } from '../services/soundcloud';
import { usePlayer } from '../store/player';

const TAGS = ['Lo-Fi','Chillwave','Ambient','Indie','Soul','Underground','Rare','Deep cuts','Midnight','Atmospheric'];

// ── 3 CSS 3D cubes — web only ────────────────────────────────────────────────
function ThreeCubes({ isActive }) {
  const [t, setT] = useState(0);

  useEffect(() => {
    let frame;
    const start = Date.now();
    const loop = () => { setT(Date.now() - start); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{
            width: i === 1 ? 70 : 50, height: i === 1 ? 70 : 50,
            borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, opacity: i === 1 ? 1 : 0.45,
          }} />
        ))}
      </View>
    );
  }

  const speed = isActive ? 1.5 : 0.55;
  const rotY  = (t * speed * 0.04) % 360;
  const rotX  = 22 + Math.sin(t * 0.0007) * 9;
  const float = Math.sin(t * 0.001) * 12;

  const spread = 26 + Math.sin(t * 0.0012) * 20;
  const sideRotY = (t * speed * 0.025) % 360;

  const makeCube = (size, ry, rx, tx, ty, opacity = 1) => {
    const half = size / 2;
    const faces = [
      { tr: `translateZ(${half}px)`,                  bg: 'rgba(255,255,255,0.09)', b: 'rgba(255,255,255,0.62)', isFront: true },
      { tr: `rotateY(180deg) translateZ(${half}px)`,  bg: 'rgba(255,255,255,0.02)', b: 'rgba(255,255,255,0.14)' },
      { tr: `rotateY(-90deg) translateZ(${half}px)`,  bg: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.28)' },
      { tr: `rotateY(90deg) translateZ(${half}px)`,   bg: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.24)' },
      { tr: `rotateX(90deg) translateZ(${half}px)`,   bg: 'rgba(255,255,255,0.06)', b: 'rgba(255,255,255,0.38)' },
      { tr: `rotateX(-90deg) translateZ(${half}px)`,  bg: 'rgba(255,255,255,0.01)', b: 'rgba(255,255,255,0.10)' },
    ];
    return (
      <div style={{
        position: 'relative',
        width: size, height: size,
        transformStyle: 'preserve-3d',
        transform: `translateX(${tx}px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg)`,
        opacity,
      }}>
        {faces.map((f, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: size, height: size,
            transform: f.tr,
            backgroundColor: f.bg,
            border: `1px solid ${f.b}`,
            borderRadius: '12px',
            boxSizing: 'border-box',
            boxShadow: f.isFront
              ? `inset 0 0 22px rgba(255,255,255,0.06), 0 0 28px rgba(255,255,255,0.10)`
              : 'none',
          }}>
            {f.isFront && (
              <>
                <div style={{ position:'absolute', left:'50%', top:'18%', bottom:'18%', width:'1px', background:'rgba(255,255,255,0.14)', transform:'translateX(-50%)' }} />
                <div style={{ position:'absolute', top:'50%', left:'18%', right:'18%', height:'1px', background:'rgba(255,255,255,0.14)', transform:'translateY(-50%)' }} />
                <div style={{ position:'absolute', top:'50%', left:'50%', width:'7px', height:'7px', borderRadius:'50%', background:'rgba(255,255,255,0.95)', transform:'translate(-50%,-50%)', boxShadow:`0 0 14px rgba(255,255,255,0.9)` }} />
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: '600px',
    width: 340,
    height: 270,
    position: 'relative',
  };

  const glowStyle = {
    position: 'absolute',
    bottom: 28,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 90, height: 14,
    borderRadius: '50%',
    background: `rgba(255,255,255,0.18)`,
    filter: 'blur(12px)',
    opacity: 0.45 + Math.sin(t * 0.001) * 0.18,
  };

  return (
    <div style={containerStyle}>
      <div style={glowStyle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0px', transformStyle: 'preserve-3d' }}>
        {makeCube(52, sideRotY * -1, rotX * 0.7, -spread, float * 0.6, 0.5)}
        {makeCube(88, rotY, rotX, 0, float, 1)}
        {makeCube(52, sideRotY, rotX * 0.7, spread, float * 0.6, 0.5)}
      </div>
    </div>
  );
}

// ── Wave bars ─────────────────────────────────────────────────────────────────
const BAR_W = 3;
const BAR_GAP = 3;

function WaveBars({ isActive }) {
  const { getFrequencyData } = usePlayer();
  const [containerW, setContainerW] = useState(0);
  const [bars, setBars] = useState([]);
  const barsRef = useRef([]);
  const smoothRef = useRef([]);
  const frameRef = useRef(null);
  const nativeAnimRefs = useRef([]);

  // Rebuild bar array when container width changes
  useEffect(() => {
    if (!containerW) return;
    const count = Math.max(1, Math.floor(containerW / (BAR_W + BAR_GAP)));
    // Reuse existing Animated.Values to avoid flicker on resize
    const newBars = Array.from({ length: count }, (_, i) =>
      barsRef.current[i] ?? new Animated.Value(0.06)
    );
    barsRef.current = newBars;
    smoothRef.current = new Array(count).fill(0.06);
    setBars([...newBars]);
  }, [containerW]);

  useEffect(() => {
    if (!bars.length) return;

    // Stop everything first
    cancelAnimationFrame(frameRef.current);
    nativeAnimRefs.current.forEach(a => a?.stop?.());
    nativeAnimRefs.current = [];

    if (!isActive) {
      barsRef.current.forEach(b =>
        Animated.spring(b, { toValue: 0.06, useNativeDriver: false }).start()
      );
      return;
    }

    if (Platform.OS !== 'web') {
      // Native: random animation fallback
      barsRef.current.forEach((bar, i) => {
        let running = true;
        const go = () => {
          if (!running) return;
          Animated.sequence([
            Animated.timing(bar, { toValue: Math.random() * 0.88 + 0.12, duration: 100 + Math.random() * 200, useNativeDriver: false }),
            Animated.timing(bar, { toValue: Math.random() * 0.15 + 0.04, duration: 100 + Math.random() * 200, useNativeDriver: false }),
          ]).start(({ finished }) => { if (finished && running) go(); });
          nativeAnimRefs.current[i] = { stop: () => { running = false; } };
        };
        setTimeout(go, i * 25);
      });
      return () => nativeAnimRefs.current.forEach(a => a?.stop?.());
    }

    // Web: drive bars from real frequency data
    let fallbackPhase = 0; // used when audio graph not ready yet

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const freqData = getFrequencyData?.();
      const N = barsRef.current.length;
      if (!N) return;

      for (let i = 0; i < N; i++) {
        let raw = 0;

        if (freqData) {
          // Log-scale mapping: each bar covers an exponentially growing range of bins
          const binCount = freqData.length;
          const t0 = Math.pow(binCount, i / N);
          const t1 = Math.pow(binCount, (i + 1) / N);
          const start = Math.floor(t0);
          const end = Math.min(binCount - 1, Math.ceil(t1));
          let sum = 0, cnt = 0;
          for (let k = start; k <= end; k++) { sum += freqData[k]; cnt++; }
          raw = cnt > 0 ? sum / cnt / 255 : 0;
        } else {
          // Fallback: animated sine wave until analyser is ready
          raw = 0.08 + 0.07 * Math.sin(fallbackPhase + i * 0.4);
        }

        // Attack fast, decay slow — gives musical "bounce"
        const prev = smoothRef.current[i] ?? 0;
        const next = raw > prev
          ? prev * 0.4 + raw * 0.6
          : prev * 0.72 + raw * 0.28;
        smoothRef.current[i] = next;
        barsRef.current[i]?.setValue(next);
      }
      fallbackPhase += 0.06;
    };

    tick();
    return () => cancelAnimationFrame(frameRef.current);
  }, [isActive, bars, getFrequencyData]);

  return (
    <View
      style={S.waveBars}
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}
    >
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[S.waveBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [3, 42] }),
          opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.82] }),
        }]} />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function WaveScreen() {
  const { playTrack, isPlaying, liked } = usePlayer();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const tagAnims  = useRef(TAGS.map(() => new Animated.Value(0))).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getRecommended([]).then(() => {});
    Animated.stagger(40, tagAnims.map(a =>
      Animated.spring(a, { toValue: 1, tension: 70, friction: 13, useNativeDriver: true })
    )).start();
  }, []);

  useEffect(() => {
    if (!active) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    }
  }, [active]);

  useEffect(() => {
    Animated.spring(panelAnim, { toValue: active ? 1 : 0, tension: 55, friction: 14, useNativeDriver: true }).start();
  }, [active]);

  async function handleStart() {
    setLoading(true);
    try {
      // Get tracks from 3 separate searches for maximum variety
      const likedArr = Array.from(liked).map(id => ({ id, user: { username: '' } }));
      const [r1, r2, r3] = await Promise.all([
        getRecommended(likedArr),
        getRecommended([]),
        getRecommended([]),
      ]);
      // Merge and dedupe
      const seen = new Set();
      const all = [];
      for (const t of [...r1, ...r2, ...r3]) {
        if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
      }
      // Shuffle ensuring no consecutive same artist
      const shuffled = [];
      const pool = [...all];
      while (pool.length > 0) {
        const lastArtist = shuffled.length ? shuffled[shuffled.length - 1].user?.username : null;
        const candidates = pool.filter(t => t.user?.username !== lastArtist);
        const pick = candidates.length > 0 ? candidates : pool;
        const idx = Math.floor(Math.random() * pick.length);
        const track = pick[idx];
        shuffled.push(track);
        pool.splice(pool.indexOf(track), 1);
      }
      setActive(true);
      if (shuffled.length) playTrack(shuffled[0], shuffled);
    } finally {
      setLoading(false);
    }
  }

  const panelY = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });

  return (
    <View style={S.screen}>
      <AnimatedBackground />

      <View style={S.content}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.title}>My Wave</Text>
          <Text style={S.subtitle}>AI radio tuned to your taste</Text>
        </View>

        {/* Tags */}
        <View style={S.tags}>
          {TAGS.map((tag, i) => (
            <Animated.View key={tag} style={{
              opacity: tagAnims[i],
              transform: [{ translateY: tagAnims[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }}>
              <View style={S.tag}>
                <Text style={S.tagTxt}>{tag}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* 3 Cubes */}
        <View style={S.cubeWrap}>
          <ThreeCubes isActive={active && isPlaying} />
        </View>

        {/* Wave bars */}
        <WaveBars isActive={active && isPlaying} />

        {/* Start / Active */}
        {!active ? (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity onPress={handleStart} disabled={loading} activeOpacity={0.8} style={S.startBtn}>
              {loading
                ? <Ionicons name="hourglass-outline" size={17} color="rgba(255,255,255,0.7)" />
                : <Ionicons name="play" size={17} color="#fff" />
              }
              <Text style={S.startTxt}>{loading ? 'Loading...' : 'Start My Wave'}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View style={[S.activeRow, { opacity: panelAnim, transform: [{ translateY: panelY }] }]}>
            <View style={[S.liveDot, isPlaying && S.liveDotOn]} />
            <Text style={S.activeTxt}>{isPlaying ? 'Playing your wave' : 'Wave paused'}</Text>
            <TouchableOpacity onPress={() => setActive(false)} style={S.stopBtn}>
              <Ionicons name="stop-circle-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      <View style={{ height: 100 }} />
    </View>
  );
}

const S = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingTop: 60, paddingHorizontal: 20, alignItems: 'center' },

  header:   { alignItems: 'center', marginBottom: 20 },
  title:    { color: colors.white, fontSize: 36, fontWeight: '800', letterSpacing: -1.2 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 5, letterSpacing: 0.2 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginBottom: 24, paddingHorizontal: 8 },
  tag: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
  },
  tagTxt: { color: colors.textSub, fontSize: 11, fontWeight: '500' },

  cubeWrap: { marginBottom: 4 },

  waveBars: { flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP, height: 46, marginBottom: 30, width: '100%', paddingHorizontal: 2 },
  waveBar:  { width: BAR_W, borderRadius: 2, backgroundColor: colors.accent },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 36, paddingVertical: 17,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
  },
  startTxt: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },

  activeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 18,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.border,
    width: '100%',
  },
  liveDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  liveDotOn: { backgroundColor: colors.accent, shadowColor: colors.accent, shadowRadius: 6, shadowOpacity: 0.9 },
  activeTxt: { flex: 1, color: colors.textSub, fontSize: 13 },
  stopBtn:   { padding: 4 },
});
