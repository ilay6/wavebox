import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Image, Platform } from 'react-native';
import React, { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';

const isWeb = Platform.OS === 'web';

import { colors } from '../theme';
import { usePlayer } from '../store/player';

export default function MiniPlayer({ onPress }) {
  const { currentTrack, isPlaying, togglePlay, playNext, progress, duration, loading } = usePlayer();
  const slideAnim = useRef(new Animated.Value(120)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef(null);

  useEffect(() => {
    if (currentTrack) {
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 13, useNativeDriver: true }).start();
    }
  }, [!!currentTrack]);

  useEffect(() => {
    if (isPlaying) {
      rotateLoop.current = Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
      );
      rotateLoop.current.start();
    } else {
      rotateLoop.current?.stop();
    }
  }, [isPlaying]);

  if (!currentTrack) return null;

  const progressPct = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const artwork = currentTrack.artwork_url;
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideAnim }] }]}>
      {/* Glass background */}
      <View style={styles.glassBg} />
      {Platform.OS === 'web' && <View style={styles.webBlur} />}

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
      </View>

      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.9}>
        {/* Rotating artwork */}
        <Animated.View style={[styles.artWrap, { transform: [{ rotate }] }]}>
          {artwork
            ? (isWeb
                ? <View style={{ width: 42, height: 42, borderRadius: 21, backgroundImage: `url(${artwork})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                : <Image source={{ uri: artwork }} style={styles.artwork} resizeMode="cover" />)
            : <View style={[styles.artwork, styles.artFallback]}>
                <Ionicons name="musical-note" size={16} color={colors.textMuted} />
              </View>
          }
        </Animated.View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>
            {loading ? 'Loading...' : currentTrack.user?.username}
          </Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={e => { e.stopPropagation?.(); togglePlay(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={22} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={e => { e.stopPropagation?.(); playNext(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="play-skip-forward" size={18} color={colors.textSub} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute', bottom: 88, left: 12, right: 12,
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  glassBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,14,22,0.92)',
  },
  webBlur: Platform.OS === 'web' ? {
    ...StyleSheet.absoluteFillObject,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
  } : {},

  progressTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.06)' },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.55)' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 12,
  },

  artWrap: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  artwork: { width: 42, height: 42, borderRadius: 21 },
  artFallback: { backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  info: { flex: 1 },
  title:  { color: colors.white,   fontSize: 13, fontWeight: '600', marginBottom: 2 },
  artist: { color: colors.textSub, fontSize: 11 },

  btn: { padding: 4 },
});
