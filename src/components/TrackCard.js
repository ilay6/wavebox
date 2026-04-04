import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme';
import { formatDuration } from '../services/soundcloud';
import { usePlayer } from '../store/player';

export default function TrackCard({ track, onPress, showIndex, index }) {
  const { currentTrack, isPlaying, toggleLike, liked } = usePlayer();
  const isActive = currentTrack?.id === track.id;
  const isLiked  = liked.has(track.id);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn  = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 15 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 15 }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
      <Animated.View style={[styles.container, isActive && styles.containerActive, { transform: [{ scale: scaleAnim }] }]}>
        {/* Active accent bar */}
        {isActive && (
          <View style={styles.accentBar} />
        )}

        {showIndex && (
          <View style={styles.indexWrap}>
            {isActive && isPlaying ? <PlayingIndicator /> : (
              <Text style={[styles.index, isActive && { color: colors.accent }]}>
                {(index + 1).toString().padStart(2, '0')}
              </Text>
            )}
          </View>
        )}

        <View style={styles.artwork}>
          {track.artwork_url
            ? <Image source={{ uri: track.artwork_url }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
            : <Ionicons name="musical-note" size={18} color={colors.textMuted} />
          }
          {isActive && (
            <View style={styles.activeOverlay}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={14} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.info}>
          <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>{track.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.artist} numberOfLines={1}>{track.user?.username}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.likeBtn}
          onPress={() => toggleLike(track.id)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={17}
            color={isLiked ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
}

function PlayingIndicator() {
  const bar0 = useRef(new Animated.Value(0.4)).current;
  const bar1 = useRef(new Animated.Value(0.8)).current;
  const bar2 = useRef(new Animated.Value(0.5)).current;
  const bars = [bar0, bar1, bar2];
  useEffect(() => {
    bars.forEach((bar, i) => {
      Animated.loop(Animated.sequence([
        Animated.timing(bar, { toValue: 1,   duration: 300 + i * 100, useNativeDriver: true }),
        Animated.timing(bar, { toValue: 0.2, duration: 300 + i * 100, useNativeDriver: true }),
      ])).start();
    });
  }, []);
  return (
    <View style={styles.playIndicator}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.playBar, {
          height: 14,
          backgroundColor: colors.accent,
          transform: [{ scaleY: bar }],
        }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingHorizontal: 16,
    gap: 12, borderRadius: 14,
    marginHorizontal: 8, marginVertical: 1,
  },
  containerActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  accentBar: { position: 'absolute', left: 8, top: 10, bottom: 10, width: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },

  indexWrap: { width: 22, alignItems: 'center' },
  index: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  playIndicator: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  playBar: { width: 2.5, borderRadius: 2 },

  artwork: {
    width: 48, height: 48, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: colors.border,
  },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },

  info: { flex: 1 },
  title: { color: colors.textSub, fontSize: 14, fontWeight: '500', marginBottom: 3 },
  titleActive: { color: colors.white, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  artist: { color: colors.textMuted, fontSize: 12 },
  dot:    { color: colors.textMuted, fontSize: 10 },
  duration: { color: colors.textMuted, fontSize: 12 },
  likeBtn: { padding: 4 },
});
