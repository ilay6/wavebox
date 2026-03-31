import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  StatusBar, Animated, Easing, Image, Platform, ScrollView
} from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../store/player';
import { formatDuration } from '../services/soundcloud';

const { width } = Dimensions.get('window');
const ART = Math.min(width - 80, 280);

// ─── Blurred artwork background ───────────────────────────────────────────────
function ArtworkBlurBg({ uri }) {
  if (!uri) return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />;
  return (
    <>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} blurRadius={40} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.72)' }]} />
    </>
  );
}

// ─── Animated waveform ────────────────────────────────────────────────────────
function WaveformViz({ isPlaying }) {
  const COUNT = 28;
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
      setTimeout(animate, i * 25);
    });
    return () => animRefs.current.forEach(a => a?.stop());
  }, [isPlaying]);

  return (
    <View style={styles.waveform}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [2, 22] }),
          opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] }),
        }]} />
      ))}
    </View>
  );
}

// ─── 5-Band Equalizer Panel ───────────────────────────────────────────────────
const EQ_BANDS = ['Bass', 'Low', 'Mid', 'High', 'Air'];
const EQ_PRESETS = {
  'Flat':       [0,  0,  0,  0,  0],
  'Bass+':      [8,  4,  0, -2, -1],
  'Treble+':    [-2, -1,  0,  4,  7],
  'Vocal':      [-2,  2,  4,  2,  1],
  'Pop':        [-1,  2,  4,  2, -1],
  'Hip-Hop':    [6,   3,  0,  1,  2],
};

function EQSlider({ label, gain, onChange }) {
  if (Platform.OS === 'web') {
    return (
      <View style={eqStyles.sliderWrap}>
        <Text style={eqStyles.gainText}>{gain > 0 ? `+${gain}` : `${gain}`}</Text>
        <input
          type="range" min="-12" max="12" step="1" value={gain}
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
            height: 90,
            width: 28,
            cursor: 'pointer',
            accentColor: '#fff',
          }}
          onChange={e => onChange(Number(e.target.value))}
        />
        <Text style={eqStyles.bandLabel}>{label}</Text>
      </View>
    );
  }
  // Native fallback: simple tap buttons
  return (
    <View style={eqStyles.sliderWrap}>
      <Text style={eqStyles.gainText}>{gain > 0 ? `+${gain}` : `${gain}`}</Text>
      <View style={{ gap: 4 }}>
        <TouchableOpacity onPress={() => onChange(Math.min(12, gain + 1))} style={eqStyles.nativeBtn}>
          <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View style={[eqStyles.nativeBar, { height: Math.max(2, ((gain + 12) / 24) * 60) }]} />
        <TouchableOpacity onPress={() => onChange(Math.max(-12, gain - 1))} style={eqStyles.nativeBtn}>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
      <Text style={eqStyles.bandLabel}>{label}</Text>
    </View>
  );
}

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
      <Text style={eqStyles.title}>Equalizer</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={eqStyles.presets}>
        {Object.keys(EQ_PRESETS).map(name => (
          <TouchableOpacity
            key={name}
            style={[eqStyles.chip, activePreset === name && eqStyles.chipActive]}
            onPress={() => applyPreset(name)}
          >
            <Text style={[eqStyles.chipText, activePreset === name && eqStyles.chipTextActive]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={eqStyles.sliders}>
        {EQ_BANDS.map((label, i) => (
          <EQSlider key={label} label={label} gain={gains[i]} onChange={g => handleBand(i, g)} />
        ))}
      </View>
    </View>
  );
}

// ─── Main Player Screen ───────────────────────────────────────────────────────
export default function PlayerScreen({ onClose }) {
  const {
    currentTrack, isPlaying, togglePlay, playNext, playPrev,
    toggleLike, liked, progress, duration, seekTo, loading,
    eqGains, setEqBand, setEqPreset,
  } = usePlayer();

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [showEQ, setShowEQ] = useState(false);
  const artScale = useRef(new Animated.Value(0.94)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.spring(artScale, { toValue: 1, tension: 55, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [currentTrack?.id]);

  useEffect(() => {
    Animated.spring(artScale, {
      toValue: isPlaying ? 1 : 0.92,
      tension: 60, friction: 12, useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  const progressPct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const progressBarWidth = width - 48;

  const handleProgressPress = useCallback((e) => {
    const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressBarWidth));
    seekTo?.(pct * duration);
  }, [duration, seekTo, progressBarWidth]);

  if (!currentTrack) return null;
  const isLiked = liked.has(currentTrack.id);
  const artwork = currentTrack.artwork_url;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ArtworkBlurBg uri={artwork} />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <Text style={styles.headerLabel}>NOW PLAYING</Text>
          <TouchableOpacity hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>

        {/* Artwork */}
        <View style={styles.artworkSection}>
          <Animated.View style={[styles.artworkWrap, { transform: [{ scale: artScale }] }]}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={styles.artworkImg} resizeMode="cover" />
            ) : (
              <View style={styles.artworkPlaceholder}>
                <Ionicons name="musical-note" size={80} color="rgba(255,255,255,0.12)" />
              </View>
            )}
            {loading && (
              <View style={styles.artworkLoadingOverlay}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading...</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Info + like */}
        <View style={styles.infoRow}>
          <View style={styles.infoText}>
            <Text style={styles.trackTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{currentTrack.user?.username}</Text>
          </View>
          <TouchableOpacity
            style={[styles.likeBtn, isLiked && styles.likeBtnFilled]}
            onPress={() => toggleLike(currentTrack.id)}
          >
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#000' : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <TouchableOpacity
            style={styles.progressTrack}
            onPress={handleProgressPress}
            activeOpacity={1}
          >
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
            <Ionicons name="shuffle" size={22} color={shuffle ? '#fff' : 'rgba(255,255,255,0.3)'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={playPrev}>
            <Ionicons name="play-skip-back" size={30} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity onPress={playNext}>
            <Ionicons name="play-skip-forward" size={30} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setRepeat(r => !r)}>
            <Ionicons name="repeat" size={22} color={repeat ? '#fff' : 'rgba(255,255,255,0.3)'} />
          </TouchableOpacity>
        </View>

        {/* Extras: waveform + EQ toggle */}
        <View style={styles.extras}>
          <TouchableOpacity style={styles.extraBtn}>
            <Ionicons name="list-outline" size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          <WaveformViz isPlaying={isPlaying} />
          <TouchableOpacity
            style={[styles.extraBtn, showEQ && styles.extraBtnActive]}
            onPress={() => setShowEQ(s => !s)}
          >
            <Ionicons name="options-outline" size={20} color={showEQ ? '#000' : 'rgba(255,255,255,0.4)'} />
          </TouchableOpacity>
        </View>

        {/* EQ Panel */}
        {showEQ && (
          <EQPanel
            gains={eqGains}
            onChangeBand={setEqBand}
            onChangePreset={setEqPreset}
          />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 8, paddingHorizontal: 24, marginBottom: 10,
  },
  headerLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 2, fontWeight: '600' },

  artworkSection: { alignItems: 'center', paddingHorizontal: 32, marginBottom: 16 },
  artworkWrap: {
    width: ART, height: ART, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 40,
    overflow: 'hidden',
  },
  artworkImg: { width: '100%', height: '100%' },
  artworkPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  artworkLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 12, gap: 12,
  },
  infoText: { flex: 1 },
  trackTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  trackArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  likeBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  likeBtnFilled: { backgroundColor: '#fff', borderColor: '#fff' },

  progressSection: { paddingHorizontal: 24, marginBottom: 16 },
  progressTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2, position: 'relative' },
  progressThumb: {
    position: 'absolute', right: -6, top: -5,
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff',
    shadowColor: '#fff', shadowRadius: 6, shadowOpacity: 0.4,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '500' },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 28, marginBottom: 14,
  },
  playBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fff', shadowRadius: 20, shadowOpacity: 0.15,
  },

  extras: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, marginBottom: 8,
  },
  extraBtn: {
    padding: 8, borderRadius: 10,
  },
  extraBtnActive: {
    backgroundColor: '#fff',
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 2.5, backgroundColor: '#fff', borderRadius: 1 },
});

const eqStyles = StyleSheet.create({
  panel: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: 'rgba(255,255,255,0.5)', fontSize: 11,
    fontWeight: '700', letterSpacing: 1.5,
    marginBottom: 12, textAlign: 'center',
  },
  presets: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: '#000', fontWeight: '700' },
  sliders: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  sliderWrap: { alignItems: 'center', gap: 6, flex: 1 },
  gainText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '600', minWidth: 28, textAlign: 'center' },
  bandLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '500' },
  nativeBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 6,
  },
  nativeBar: { width: 4, backgroundColor: '#fff', borderRadius: 2, alignSelf: 'center' },
});
