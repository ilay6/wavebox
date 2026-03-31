import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { formatDuration } from '../services/soundcloud';
import { usePlayer } from '../store/player';
import { usePlayerModal } from '../../App';

const ARTWORK_BG = [
  '#111111','#0e0e0e','#131313','#0d0d0d','#121212','#101010',
];

export default function TrackCard({ track, onPress, showIndex, index }) {
  const { currentTrack, isPlaying, toggleLike, liked } = usePlayer();
  const { open: openPlayer } = usePlayerModal();
  const isActive = currentTrack?.id === track.id;
  const isLiked = liked.has(track.id);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 15 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 15 }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.container, isActive && styles.containerActive, { transform: [{ scale: scaleAnim }] }]}>
        {showIndex ? (
          <View style={styles.indexWrap}>
            {isActive && isPlaying ? (
              <PlayingIndicator />
            ) : (
              <Text style={[styles.index, isActive && { color: '#fff' }]}>
                {(index + 1).toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        ) : null}

        {/* Artwork */}
        <View style={[styles.artwork, { backgroundColor: ARTWORK_BG[track.id % ARTWORK_BG.length] }]}>
          {track.artwork_url ? (
            <Image source={{ uri: track.artwork_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name="musical-note" size={18} color="rgba(255,255,255,0.2)" />
          )}
          {isActive && (
            <View style={styles.activeOverlay}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#fff" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
            {track.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.artist} numberOfLines={1}>{track.user?.username}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
          </View>
        </View>

        {/* Like */}
        <TouchableOpacity
          style={styles.likeBtn}
          onPress={() => toggleLike(track.id)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={18}
            color={isLiked ? '#fff' : 'rgba(255,255,255,0.2)'}
          />
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
}

function PlayingIndicator() {
  const bars = [useRef(new Animated.Value(0.4)).current, useRef(new Animated.Value(0.8)).current, useRef(new Animated.Value(0.5)).current];

  bars.forEach((bar, i) => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: 300 + i * 100, useNativeDriver: false }),
        Animated.timing(bar, { toValue: 0.3, duration: 300 + i * 100, useNativeDriver: false }),
      ])
    ).start();
  });

  return (
    <View style={styles.playIndicator}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.playBar, {
          height: bar.interpolate({ inputRange: [0, 1], outputRange: [4, 14] })
        }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    gap: 12, borderRadius: 12, marginHorizontal: 8, marginVertical: 2,
  },
  containerActive: { backgroundColor: 'rgba(255,255,255,0.04)' },
  indexWrap: { width: 22, alignItems: 'center' },
  index: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.3)' },
  playIndicator: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  playBar: { width: 2.5, backgroundColor: '#fff', borderRadius: 2 },
  artwork: {
    width: 50, height: 50, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  title: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500', marginBottom: 3 },
  titleActive: { color: '#fff', fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  artist: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  dot: { color: 'rgba(255,255,255,0.2)', fontSize: 10 },
  duration: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  likeBtn: { padding: 4 },
});
