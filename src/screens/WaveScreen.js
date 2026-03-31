import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Dimensions, Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedBackground from '../components/AnimatedBackground';
import { getRecommended } from '../services/soundcloud';
import { usePlayer } from '../store/player';

const { width } = Dimensions.get('window');
const TAGS = ['Lo-Fi', 'Chillwave', 'Ambient', 'Indie', 'Soul', 'Underground', 'Rare', 'Deep cuts', 'Midnight', 'Atmospheric'];

// ─── CSS 3D куб (работает на вебе) ───────────────────────────────────────────
function Cube3D({ size = 110, isActive }) {
  const [rot, setRot] = useState({ y: 0, x: 18, float: 0 });

  useEffect(() => {
    let frame;
    const start = Date.now();
    const animate = () => {
      const t = Date.now() - start;
      const speed = isActive ? 1.6 : 0.45;
      setRot({
        y: (t * speed * 0.04) % 360,
        x: 18 + Math.sin(t * 0.0007) * 10,
        float: Math.sin(t * 0.0009) * 12,
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isActive]);

  const half = size / 2;

  if (Platform.OS !== 'web') {
    // Fallback для native — просто квадрат
    return (
      <View style={{ width: size, height: size, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 14 }} />
    );
  }

  const wrapStyle = {
    width: size * 2.2,
    height: size * 2.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: '500px',
  };

  const cubeStyle = {
    width: size,
    height: size,
    transformStyle: 'preserve-3d',
    transform: `translateY(${rot.float}px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
    position: 'relative',
  };

  const faceBase = {
    position: 'absolute',
    width: size,
    height: size,
    borderStyle: 'solid',
    borderRadius: '12px',
    boxSizing: 'border-box',
  };

  const faces = [
    { t: `translateZ(${half}px)`,              bg: 'rgba(255,255,255,0.08)', b: 'rgba(255,255,255,0.55)', shadow: `inset 0 0 30px rgba(255,255,255,0.06), 0 0 20px rgba(255,255,255,0.08)` },
    { t: `rotateY(180deg) translateZ(${half}px)`, bg: 'rgba(255,255,255,0.02)', b: 'rgba(255,255,255,0.15)' },
    { t: `rotateY(-90deg) translateZ(${half}px)`, bg: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.25)' },
    { t: `rotateY(90deg) translateZ(${half}px)`,  bg: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.3)' },
    { t: `rotateX(90deg) translateZ(${half}px)`,  bg: 'rgba(255,255,255,0.06)', b: 'rgba(255,255,255,0.4)', shadow: 'inset 0 0 20px rgba(255,255,255,0.05)' },
    { t: `rotateX(-90deg) translateZ(${half}px)`, bg: 'rgba(255,255,255,0.01)', b: 'rgba(255,255,255,0.1)' },
  ];

  return (
    <div style={wrapStyle}>
      {/* Glow под кубом */}
      <div style={{
        position: 'absolute',
        bottom: size * 0.1,
        width: size * 1.1, height: size * 0.12,
        borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.15)',
        filter: 'blur(16px)',
        transform: `scaleX(${0.7 + rot.float / 80})`,
        opacity: 0.6 - rot.float / 80,
      }} />
      <div style={cubeStyle}>
        {faces.map((f, i) => (
          <div key={i} style={{
            ...faceBase,
            transform: f.t,
            backgroundColor: f.bg,
            borderWidth: '1px',
            borderColor: f.b,
            boxShadow: f.shadow || 'none',
          }}>
            {/* Перекрестие на передней грани */}
            {i === 0 && (
              <>
                <div style={{ position: 'absolute', left: '50%', top: '15%', bottom: '15%', width: '1px', backgroundColor: 'rgba(255,255,255,0.12)', transform: 'translateX(-50%)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '15%', right: '15%', height: '1px', backgroundColor: 'rgba(255,255,255,0.12)', transform: 'translateY(-50%)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.4)', transform: 'translate(-50%,-50%)', boxShadow: '0 0 10px rgba(255,255,255,0.5)' }} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Волновые бары ────────────────────────────────────────────────────────────
function WaveBars({ isActive }) {
  const COUNT = 28;
  const bars = useRef(Array.from({ length: COUNT }, () => new Animated.Value(0.08))).current;
  const animRefs = useRef([]);

  useEffect(() => {
    animRefs.current.forEach(a => a && a.stop && a.stop());
    animRefs.current = [];

    if (!isActive) {
      bars.forEach(b => Animated.spring(b, { toValue: 0.08, useNativeDriver: false }).start());
      return;
    }

    bars.forEach((bar, i) => {
      let running = true;
      const animate = () => {
        if (!running) return;
        const anim = Animated.sequence([
          Animated.timing(bar, { toValue: Math.random() * 0.85 + 0.15, duration: 120 + Math.random() * 220, useNativeDriver: false }),
          Animated.timing(bar, { toValue: Math.random() * 0.2 + 0.04, duration: 120 + Math.random() * 220, useNativeDriver: false }),
        ]);
        anim.start(({ finished }) => { if (finished && running) animate(); });
        animRefs.current[i] = { stop: () => { running = false; anim.stop(); } };
      };
      setTimeout(animate, i * 35);
    });

    return () => { animRefs.current.forEach(a => a?.stop()); };
  }, [isActive]);

  return (
    <View style={styles.waveBars}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [3, 40] }),
          opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.75] }),
        }]} />
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WaveScreen() {
  const { playTrack, isPlaying, currentTrack, togglePlay, liked } = usePlayer();
  const [active, setActive] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [likedTracks, setLikedTracks] = useState([]);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const tagAnims = useRef(TAGS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    getRecommended([]).then(setTracks);
    Animated.stagger(55, tagAnims.map(a =>
      Animated.spring(a, { toValue: 1, tension: 70, friction: 13, useNativeDriver: true })
    )).start();
  }, []);

  useEffect(() => {
    Animated.spring(panelAnim, { toValue: active ? 1 : 0, tension: 55, friction: 14, useNativeDriver: true }).start();
  }, [active]);

  async function handleStart() {
    // Load wave based on liked tracks
    const likedArr = Array.from(liked).map(id => ({ id, user: { username: '' } }));
    const waveTracks = await getRecommended(likedArr);
    const shuffled = waveTracks.sort(() => Math.random() - 0.5);
    setTracks(shuffled); setActive(true); setCurrentIdx(0);
    if (shuffled.length) playTrack(shuffled[0], shuffled);
  }

  function handleSkip() {
    const next = currentIdx + 1;
    if (next < tracks.length) { setCurrentIdx(next); playTrack(tracks[next], tracks); }
  }

  const track = tracks[currentIdx];
  const panelY = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });

  return (
    <View style={styles.screen}>
      <AnimatedBackground />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Wave</Text>
          <Text style={styles.subtitle}>Personal AI radio</Text>
        </View>

        {/* Tags */}
        <View style={styles.tags}>
          {TAGS.map((tag, i) => (
            <Animated.View key={tag} style={{
              opacity: tagAnims[i],
              transform: [{ translateY: tagAnims[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            }}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* Cube + wave */}
        <View style={styles.centerSection}>
          <Cube3D size={110} isActive={active && isPlaying} />
          <WaveBars isActive={active && isPlaying} />
        </View>

        {/* Button or Panel */}
        {!active ? (
          <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.8}>
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.startBtnText}>Start My Wave</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View style={[styles.panel, { opacity: panelAnim, transform: [{ translateY: panelY }] }]}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.panelOverlay} />
            <View style={styles.panelBorder} />

            {/* Track info row */}
            <View style={styles.panelTrack}>
              <View style={styles.panelArtwork}>
                <View style={[styles.panelDot, isPlaying && styles.panelDotActive]} />
              </View>
              <View style={styles.panelInfo}>
                <Text style={styles.panelNowLabel}>NOW PLAYING</Text>
                <Text style={styles.panelTitle} numberOfLines={1}>{track?.title || '...'}</Text>
                <Text style={styles.panelArtist}>{track?.user?.username}</Text>
              </View>
            </View>

            {/* Controls */}
            <View style={styles.panelButtons}>
              <TouchableOpacity style={styles.pBtn} onPress={togglePlay}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.pBtn} onPress={handleSkip}>
                <Ionicons name="play-skip-forward" size={18} color="rgba(255,255,255,0.65)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.pBtn}>
                <Ionicons name="heart-outline" size={18} color="rgba(255,255,255,0.65)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.pBtn}>
                <Ionicons name="shuffle" size={18} color="rgba(255,255,255,0.65)" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity style={styles.pBtnStop} onPress={() => setActive(false)}>
                <Ionicons name="stop" size={15} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      <View style={{ height: 100 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },
  content: { flex: 1, paddingTop: 60, paddingHorizontal: 20, alignItems: 'center' },

  header: { alignItems: 'center', marginBottom: 24 },
  title: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 5 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 32, paddingHorizontal: 10 },
  tag: {
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  tagText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '500' },

  centerSection: { alignItems: 'center', gap: 20, marginBottom: 36 },

  waveBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 44 },
  waveBar: { width: 3, backgroundColor: '#fff', borderRadius: 2 },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 32, paddingVertical: 16, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Panel
  panel: {
    width: '100%', borderRadius: 22, overflow: 'hidden',
    shadowColor: '#000', shadowRadius: 30, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 10 },
  },
  panelOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,12,12,0.75)' },
  panelBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  panelTrack: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  panelArtwork: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  panelDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)' },
  panelDotActive: { backgroundColor: '#fff', shadowColor: '#fff', shadowRadius: 8, shadowOpacity: 0.6 },
  panelInfo: { flex: 1 },
  panelNowLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  panelTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  panelArtist: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  panelButtons: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingBottom: 18,
  },
  pBtn: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  pBtnStop: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
});
