import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, Easing, Image, Platform
} from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../store/player';
import { formatDuration } from '../services/soundcloud';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W = Math.min(400, SW - 24);

// ─── Animated waveform ────────────────────────────────────────────────────────
function WaveformViz({ isPlaying }) {
  const COUNT = 18;
  const bars = useRef(Array.from({ length: COUNT }, () => new Animated.Value(0.1))).current;
  const animRefs = useRef([]);

  useEffect(() => {
    animRefs.current.forEach(a => a?.stop());
    animRefs.current = [];
    if (!isPlaying) {
      bars.forEach(b => Animated.spring(b, { toValue: 0.1, useNativeDriver: false }).start());
      return;
    }
    bars.forEach((bar, i) => {
      let running = true;
      const animate = () => {
        if (!running) return;
        Animated.sequence([
          Animated.timing(bar, { toValue: Math.random() * 0.85 + 0.15, duration: 120 + Math.random() * 200, useNativeDriver: false }),
          Animated.timing(bar, { toValue: Math.random() * 0.2 + 0.04, duration: 120 + Math.random() * 200, useNativeDriver: false }),
        ]).start(({ finished }) => { if (finished && running) animate(); });
        animRefs.current[i] = { stop: () => { running = false; } };
      };
      setTimeout(animate, i * 30);
    });
    return () => animRefs.current.forEach(a => a?.stop());
  }, [isPlaying]);

  return (
    <View style={styles.waveform}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [2, 18] }),
          opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
        }]} />
      ))}
    </View>
  );
}

// ─── Compact EQ ───────────────────────────────────────────────────────────────
const EQ_BANDS = ['Bass', 'Low', 'Mid', 'High', 'Air'];
const EQ_PRESETS = {
  'Flat':    [0,  0,  0,  0,  0],
  'Bass+':   [8,  4,  0, -2, -1],
  'Treble+': [-2, -1,  0,  4,  7],
  'Vocal':   [-2,  2,  4,  2,  1],
  'Pop':     [-1,  2,  4,  2, -1],
  'Hip-Hop': [6,   3,  0,  1,  2],
};

function EQPanel({ gains, onChangeBand, onChangePreset }) {
  const [activePreset, setActivePreset] = useState('Flat');

  function applyPreset(name) {
    setActivePreset(name);
    onChangePreset(EQ_PRESETS[name]);
  }
  function handleBand(i, g) {
    setActivePreset('Custom');
    onChangeBand(i, g);
  }

  return (
    <View style={eqStyles.panel}>
      {/* Preset chips */}
      <View style={eqStyles.presets}>
        {Object.keys(EQ_PRESETS).map(name => (
          <TouchableOpacity
            key={name}
            style={[eqStyles.chip, activePreset === name && eqStyles.chipActive]}
            onPress={() => applyPreset(name)}
          >
            <Text style={[eqStyles.chipText, activePreset === name && eqStyles.chipTextActive]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Sliders */}
      <View style={eqStyles.sliders}>
        {EQ_BANDS.map((label, i) => (
          <View key={label} style={eqStyles.sliderCol}>
            <Text style={eqStyles.gainText}>{gains[i] > 0 ? `+${gains[i]}` : `${gains[i]}`}</Text>
            {Platform.OS === 'web' ? (
              <input
                type="range" min="-12" max="12" step="1" value={gains[i]}
                style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 70, width: 24, cursor: 'pointer', accentColor: '#fff' }}
                onChange={e => handleBand(i, Number(e.target.value))}
              />
            ) : (
              <View style={{ gap: 3 }}>
                <TouchableOpacity onPress={() => handleBand(i, Math.min(12, gains[i] + 1))} style={eqStyles.nativeBtn}>
                  <Ionicons name="chevron-up" size={12} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
                <View style={[eqStyles.nativeBar, { height: Math.max(2, ((gains[i] + 12) / 24) * 50) }]} />
                <TouchableOpacity onPress={() => handleBand(i, Math.max(-12, gains[i] - 1))} style={eqStyles.nativeBtn}>
                  <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            )}
            <Text style={eqStyles.bandLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main Player ──────────────────────────────────────────────────────────────
export default function PlayerScreen({ onClose }) {
  const {
    currentTrack, isPlaying, togglePlay, playNext, playPrev,
    toggleLike, liked, progress, duration, seekTo, loading,
    eqGains, setEqBand, setEqPreset,
  } = usePlayer();

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const artScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.spring(artScale, { toValue: 1, tension: 55, friction: 11, useNativeDriver: true }).start();
  }, [currentTrack?.id]);

  useEffect(() => {
    Animated.spring(artScale, {
      toValue: isPlaying ? 1 : 0.9,
      tension: 60, friction: 12, useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  const progressPct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const progressBarWidth = CARD_W - 48;

  const handleProgressPress = useCallback((e) => {
    const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressBarWidth));
    seekTo?.(pct * duration);
  }, [duration, seekTo, progressBarWidth]);

  if (!currentTrack) return null;
  const isLiked = liked.has(currentTrack.id);
  const artwork = currentTrack.artwork_url;

  return (
    <View style={styles.card}>
      {/* Blurred background */}
      {artwork && <Image source={{ uri: artwork }} style={styles.bgArt} blurRadius={40} resizeMode="cover" />}
      <View style={styles.bgOverlay} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-down" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <Text style={styles.headerLabel}>NOW PLAYING</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Artwork + Info row */}
      <View style={styles.topRow}>
        <Animated.View style={[styles.artWrap, { transform: [{ scale: artScale }] }]}>
          {artwork
            ? <Image source={{ uri: artwork }} style={styles.artImg} resizeMode="cover" />
            : <View style={styles.artPlaceholder}><Ionicons name="musical-note" size={36} color="rgba(255,255,255,0.12)" /></View>
          }
          {loading && (
            <View style={styles.artLoading}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>...</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.infoCol}>
          <Text style={styles.title} numberOfLines={2}>{currentTrack.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{currentTrack.user?.username}</Text>
          <View style={styles.infoActions}>
            <WaveformViz isPlaying={isPlaying} />
            <TouchableOpacity
              style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
              onPress={() => toggleLike(currentTrack.id)}
            >
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? '#000' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressWrap}>
        <TouchableOpacity style={styles.progressTrack} onPress={handleProgressPress} activeOpacity={1}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]}>
            <View style={styles.progressThumb} />
          </View>
        </TouchableOpacity>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatDuration(progress * 1000)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration * 1000)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setShuffle(s => !s)}>
          <Ionicons name="shuffle" size={20} color={shuffle ? '#fff' : 'rgba(255,255,255,0.25)'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={playPrev}>
          <Ionicons name="play-skip-back" size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={playNext}>
          <Ionicons name="play-skip-forward" size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setRepeat(r => !r)}>
          <Ionicons name="repeat" size={20} color={repeat ? '#fff' : 'rgba(255,255,255,0.25)'} />
        </TouchableOpacity>
      </View>

      {/* EQ — always visible, compact */}
      <EQPanel gains={eqGains} onChangeBand={setEqBand} onChangePreset={setEqPreset} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#0d0d0d',
    borderRadius: 24,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  bgArt: { ...StyleSheet.absoluteFillObject, opacity: 0.25 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,8,0.78)' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700' },

  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, gap: 16, marginBottom: 14,
  },
  artWrap: {
    width: 100, height: 100, borderRadius: 14,
    overflow: 'hidden', flexShrink: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16,
  },
  artImg: { width: '100%', height: '100%' },
  artPlaceholder: { width: '100%', height: '100%', backgroundColor: '#1c1c1c', alignItems: 'center', justifyContent: 'center' },
  artLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  infoCol: { flex: 1, gap: 4 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  artist: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  infoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 2, backgroundColor: '#fff', borderRadius: 1 },
  likeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  likeBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },

  progressWrap: { paddingHorizontal: 20, marginBottom: 12 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  progressThumb: { position: 'absolute', right: -5, top: -4.5, width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '500' },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, marginBottom: 14,
  },
  playBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fff', shadowRadius: 16, shadowOpacity: 0.15,
  },
});

const eqStyles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  presets: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500' },
  chipTextActive: { color: '#000', fontWeight: '700' },
  sliders: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  sliderCol: { alignItems: 'center', gap: 4, flex: 1 },
  gainText: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  bandLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '500' },
  nativeBtn: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5,
  },
  nativeBar: { width: 3, backgroundColor: '#fff', borderRadius: 2, alignSelf: 'center' },
});
