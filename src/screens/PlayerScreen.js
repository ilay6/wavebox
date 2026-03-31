import { View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar, Animated, Easing, Image, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { usePlayer } from '../store/player';
import { formatDuration } from '../services/soundcloud';

const { width, height } = Dimensions.get('window');

function ArtworkBlurBg({ uri }) {
  if (!uri) return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />;
  return (
    <>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} blurRadius={40} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.72)' }]} />
    </>
  );
}

function WaveformViz({ isPlaying }) {
  const COUNT = 32;
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
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [2, 24] }),
          opacity: bar.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.75] }),
        }]} />
      ))}
    </View>
  );
}

export default function PlayerScreen({ onClose }) {
  const { currentTrack, isPlaying, togglePlay, playNext, playPrev, toggleLike, liked, progress, duration, seekTo, loading } = usePlayer();
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const artScale = useRef(new Animated.Value(0.94)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
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

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>
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
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading...</Text>
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

        {/* Waveform + extras */}
        <View style={styles.extras}>
          <TouchableOpacity style={styles.extraBtn}>
            <Ionicons name="list-outline" size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          <WaveformViz isPlaying={isPlaying} />
          <TouchableOpacity style={styles.extraBtn}>
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const ART = width - 64;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 24, marginBottom: 24,
  },
  headerLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 2, fontWeight: '600' },

  artworkSection: { alignItems: 'center', paddingHorizontal: 32, marginBottom: 32 },
  artworkWrap: {
    width: ART, height: ART,
    borderRadius: 20,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 24, gap: 12,
  },
  infoText: { flex: 1 },
  trackTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  trackArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  likeBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  likeBtnFilled: { backgroundColor: '#fff', borderColor: '#fff' },

  progressSection: { paddingHorizontal: 24, marginBottom: 32 },
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
    paddingHorizontal: 28, marginBottom: 28,
  },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#fff', shadowRadius: 20, shadowOpacity: 0.15,
  },

  extras: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  extraBtn: { padding: 8 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 2.5, backgroundColor: '#fff', borderRadius: 1 },
});
