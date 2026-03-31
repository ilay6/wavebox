import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Image, Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../store/player';

export default function MiniPlayer({ onPress }) {
  const { currentTrack, isPlaying, togglePlay, playNext, progress, duration, loading } = usePlayer();
  const slideAnim = useRef(new Animated.Value(100)).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (currentTrack) {
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 12, useNativeDriver: true }).start();
    }
  }, [!!currentTrack]);

  // Пульсирующая точка
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    } else {
      dotScale.stopAnimation();
      Animated.timing(dotScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isPlaying]);

  if (!currentTrack) return null;

  const progressPct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const artwork = currentTrack.artwork_url;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideAnim }] }]}>
      {/* Progress bar на самом верху */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
      </View>

      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.92}>
        {/* Artwork */}
        <View style={styles.artworkWrap}>
          {artwork ? (
            <Image source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />
          ) : (
            <View style={[styles.artwork, styles.artworkFallback]}>
              <Ionicons name="musical-note" size={18} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          {/* Живая точка */}
          <Animated.View style={[styles.liveDot, { transform: [{ scale: dotScale }] }]} />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>
            {loading ? 'Loading...' : currentTrack.user?.username}
          </Text>
        </View>

        {/* Controls */}
        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={(e) => { e.stopPropagation?.(); togglePlay(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={(e) => { e.stopPropagation?.(); playNext(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="play-skip-forward" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 84,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(22,22,22,0.97)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  progressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  progressFill: { height: '100%', backgroundColor: '#fff' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },

  artworkWrap: { position: 'relative' },
  artwork: { width: 46, height: 46, borderRadius: 10 },
  artworkFallback: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  liveDot: {
    position: 'absolute',
    bottom: -2, right: -2,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#161616',
  },

  info: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  artist: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },

  ctrlBtn: { padding: 4 },
});
