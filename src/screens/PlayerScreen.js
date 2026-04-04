import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, Easing, Image, Platform
} from 'react-native';
import React, { useState, useRef, useEffect, useCallback } from 'react';

const isWeb = Platform.OS === 'web';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../store/player';
import { formatDuration } from '../services/soundcloud';

const { width: SW } = Dimensions.get('window');
const CARD_W  = Math.min(380, SW - 24);
const ART_SIZE = Math.min(180, CARD_W - 60);

// ── EQ ────────────────────────────────────────────────────────────────────────
const EQ_BANDS = ['Bass', 'Low', 'Mid', 'High', 'Air'];
const EQ_PRESETS = {
  'Flat':    [0,  0,  0,  0,  0],
  'Bass+':   [8,  4,  0, -2, -1],
  'Vocal':   [-2, 2,  4,  2,  1],
  'Pop':     [-1, 2,  4,  2, -1],
  'Hip-Hop': [6,  3,  0,  1,  2],
  'Treble+': [-2,-1,  0,  4,  7],
};

function EQPanel({ gains, onChangeBand, onChangePreset }) {
  const [active, setActive] = useState('Flat');

  function applyPreset(name) { setActive(name); onChangePreset(EQ_PRESETS[name]); }
  function handleBand(i, g) { setActive('Custom'); onChangeBand(i, g); }

  return (
    <View style={eqS.wrap}>
      <View style={eqS.presets}>
        {Object.keys(EQ_PRESETS).map(name => (
          <TouchableOpacity key={name} onPress={() => applyPreset(name)}
            style={[eqS.chip, active === name && eqS.chipActive]}>
            <Text style={[eqS.chipTxt, active === name && eqS.chipTxtActive]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={eqS.sliders}>
        {EQ_BANDS.map((label, i) => (
          <View key={label} style={eqS.col}>
            <Text style={eqS.gainTxt}>{gains[i] > 0 ? `+${gains[i]}` : `${gains[i]}`}</Text>
            {Platform.OS === 'web' ? (
              <input type="range" min="-12" max="12" step="1" value={gains[i]}
                onChange={e => handleBand(i, Number(e.target.value))}
                style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 60, width: 22,
                  cursor: 'pointer', accentColor: '#fff' }} />
            ) : (
              <View style={{ gap: 3 }}>
                <TouchableOpacity onPress={() => handleBand(i, Math.min(12, gains[i] + 1))} style={eqS.nBtn}>
                  <Ionicons name="chevron-up" size={10} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
                <View style={[eqS.nBar, { height: Math.max(2, ((gains[i]+12)/24)*46) }]} />
                <TouchableOpacity onPress={() => handleBand(i, Math.max(-12, gains[i] - 1))} style={eqS.nBtn}>
                  <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            )}
            <Text style={eqS.label}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Player ────────────────────────────────────────────────────────────────────
export default function PlayerScreen({ onClose }) {
  const {
    currentTrack, isPlaying, togglePlay, playNext, playPrev,
    toggleLike, liked, progress, duration, seekTo, setVolume, loading,
    eqGains, setEqBand, setEqPreset,
  } = usePlayer();

  const [repeat, setRepeat] = useState('off');
  const [volume, setVolumeLocal] = useState(1);

  const artScale   = useRef(new Animated.Value(0.88)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef(null);
  const fadeIn     = useRef(new Animated.Value(0)).current;
  const slideIn    = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideIn, { toValue: 0, tension: 70, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.spring(artScale, { toValue: 1, tension: 55, friction: 11, useNativeDriver: true }).start();
  }, [currentTrack?.id]);

  useEffect(() => {
    Animated.spring(artScale, { toValue: isPlaying ? 1 : 0.92, tension: 60, friction: 12, useNativeDriver: true }).start();
    if (isPlaying) {
      rotateLoop.current = Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true })
      );
      rotateLoop.current.start();
    } else {
      rotateLoop.current?.stop();
    }
  }, [isPlaying]);

  const handleVolume = useCallback((v) => {
    setVolumeLocal(v);
    setVolume(v);
  }, [setVolume]);

  const progressPct  = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const progressBarW = CARD_W - 48;

  const handleSeek = useCallback((e) => {
    const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressBarW));
    seekTo?.(pct * duration);
  }, [duration, seekTo, progressBarW]);

  const cycleRepeat = () => setRepeat(r => r === 'off' ? 'one' : r === 'one' ? 'all' : 'off');

  if (!currentTrack) return null;
  const isLiked = liked.has(currentTrack.id);
  const artwork = currentTrack.artwork_url;
  const rotate  = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[S.card, { opacity: fadeIn, transform: [{ translateY: slideIn }] }]}>
      {/* Blurred artwork bg */}
      {artwork && (isWeb
        ? React.createElement('img', { src: artwork, style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(60px)' } })
        : <Image source={{ uri: artwork }} style={S.bgArt} blurRadius={60} resizeMode="cover" />)}
      <View style={S.bgOverlay} />
      {Platform.OS === 'web' && <View style={S.webBlur} />}

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
        <Text style={S.headerLabel}>NOW PLAYING</Text>
        <TouchableOpacity onPress={() => toggleLike(currentTrack.id)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18}
            color={isLiked ? '#fff' : 'rgba(255,255,255,0.35)'} />
        </TouchableOpacity>
      </View>

      {/* Artwork disc */}
      <View style={S.artContainer}>
        <Animated.View style={[S.artWrap, { transform: [{ scale: artScale }, { rotate }] }]}>
          <View style={S.discRing} />
          {artwork
            ? (isWeb
                ? React.createElement('img', { src: artwork, style: { width: ART_SIZE, height: ART_SIZE, borderRadius: ART_SIZE / 2, objectFit: 'cover', display: 'block' } })
                : <Image source={{ uri: artwork }} style={S.artImg} resizeMode="cover" />)
            : <View style={S.artFallback}><Ionicons name="musical-note" size={36} color="rgba(255,255,255,0.15)" /></View>
          }
          <View style={S.discHole} />
          {loading && <View style={S.artLoading} />}
        </Animated.View>
      </View>

      {/* Info */}
      <View style={S.infoBlock}>
        <Text style={S.title} numberOfLines={1}>{currentTrack.title}</Text>
        <Text style={S.artist} numberOfLines={1}>{currentTrack.user?.username}</Text>
      </View>

      {/* Progress */}
      <View style={S.progressWrap}>
        {Platform.OS === 'web' ? (
          <View style={{ position: 'relative', height: 18, justifyContent: 'center', marginBottom: 6 }}>
            <View style={S.progressTrack}>
              <View style={[S.progressFill, { width: `${progressPct * 100}%` }]}>
                <View style={S.thumb} />
              </View>
            </View>
            <input
              type="range" min="0" max={duration || 1} step="0.5"
              value={progress}
              onChange={e => seekTo(Number(e.target.value))}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, cursor: 'pointer', margin: 0 }}
            />
          </View>
        ) : (
          <TouchableOpacity style={S.progressTouchTarget} onPress={handleSeek} activeOpacity={1}>
            <View style={S.progressTrack}>
              <View style={[S.progressFill, { width: `${progressPct * 100}%` }]}>
                <View style={S.thumb} />
              </View>
            </View>
          </TouchableOpacity>
        )}
        <View style={S.timeRow}>
          <Text style={S.timeText}>{formatDuration(progress * 1000)}</Text>
          <Text style={S.timeText}>{formatDuration(duration * 1000)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={S.controls}>
        <TouchableOpacity onPress={() => {}}>
          <Ionicons name="shuffle" size={18} color="rgba(255,255,255,0.25)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={playPrev}>
          <Ionicons name="play-skip-back" size={24} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity style={S.playBtn} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color="rgba(0,0,0,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={playNext}>
          <Ionicons name="play-skip-forward" size={24} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={cycleRepeat}>
          <View>
            <Ionicons name="repeat" size={18}
              color={repeat === 'off' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)'} />
            {repeat === 'one' && <Text style={S.repeatOne}>1</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {/* Volume */}
      {Platform.OS === 'web' && (
        <View style={S.volumeRow}>
          <Ionicons name="volume-low"  size={13} color="rgba(255,255,255,0.25)" />
          <View style={S.volumeTrack}>
            <input type="range" min="0" max="1" step="0.02" value={volume}
              onChange={e => handleVolume(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fff', cursor: 'pointer' }} />
          </View>
          <Ionicons name="volume-high" size={13} color="rgba(255,255,255,0.25)" />
        </View>
      )}

      {/* EQ */}
      <EQPanel gains={eqGains} onChangeBand={setEqBand} onChangePreset={setEqPreset} />
    </Animated.View>
  );
}

const S = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: 'rgba(8,8,8,0.88)',
    borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingBottom: 14,
  },
  bgArt:    { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  bgOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,8,0.78)' },
  webBlur: Platform.OS === 'web' ? {
    ...StyleSheet.absoluteFillObject,
    backdropFilter: 'blur(48px)', WebkitBackdropFilter: 'blur(48px)',
  } : {},

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },
  headerLabel: { color: 'rgba(255,255,255,0.25)', fontSize: 9, letterSpacing: 2.5, fontWeight: '700' },

  artContainer: { alignItems: 'center', paddingVertical: 12 },
  artWrap: {
    width: ART_SIZE, height: ART_SIZE, borderRadius: ART_SIZE / 2,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  discRing: {
    ...StyleSheet.absoluteFillObject, borderRadius: ART_SIZE / 2,
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.06)',
  },
  artImg:     { width: ART_SIZE, height: ART_SIZE, borderRadius: ART_SIZE / 2 },
  artFallback:{ width: ART_SIZE, height: ART_SIZE, borderRadius: ART_SIZE / 2, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  discHole: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(6,6,8,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  artLoading: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },

  infoBlock: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 14, gap: 3 },
  title:  { color: 'rgba(255,255,255,0.95)', fontSize: 16, fontWeight: '700', letterSpacing: -0.2, textAlign: 'center' },
  artist: { color: 'rgba(255,255,255,0.38)', fontSize: 13, textAlign: 'center' },

  progressWrap: { paddingHorizontal: 22, marginBottom: 14 },
  progressTouchTarget: { height: 18, justifyContent: 'center', marginBottom: 6 },
  progressTrack:{ height: 2, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 2 },
  thumb: {
    position: 'absolute', right: -5, top: -4,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#fff',
    shadowColor: '#fff', shadowRadius: 4, shadowOpacity: 0.6,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: '500' },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 26, marginBottom: 12,
  },
  playBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fff', shadowRadius: 12, shadowOpacity: 0.18,
  },
  repeatOne: { position: 'absolute', bottom: -4, right: -3, fontSize: 8, color: '#fff', fontWeight: '800' },

  volumeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, marginBottom: 12,
  },
  volumeTrack: { flex: 1 },
});

const eqS = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.28)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } : {}),
  },
  chipTxt:    { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '500' },
  chipTxtActive: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sliders: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  col:   { alignItems: 'center', gap: 3, flex: 1 },
  gainTxt: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '600', minWidth: 22, textAlign: 'center' },
  label:   { color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: '500' },
  nBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5 },
  nBar: { width: 3, borderRadius: 2, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
});
