import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import { usePlayer } from '../store/player';

const ALL_TRACKS = [
  { id: 1, title: 'Midnight Dreams', user: { username: 'lofi.beats' }, duration: 213000, stream_url: 'https://archive.org/download/testmp3testfile/mpthreetest.mp3' },
  { id: 2, title: 'Neon Lights', user: { username: 'synthwave_king' }, duration: 187000, stream_url: 'https://archive.org/download/testmp3testfile/mpthreetest.mp3' },
  { id: 5, title: 'Soul Fragment', user: { username: 'neo.soul.wav' }, duration: 198000, stream_url: 'https://archive.org/download/testmp3testfile/mpthreetest.mp3' },
  { id: 7, title: 'Ocean Floor', user: { username: 'chill.wave' }, duration: 267000, stream_url: 'https://archive.org/download/testmp3testfile/mpthreetest.mp3' },
];

const PLAYLISTS = [
  { id: 'p1', name: 'Late Night Drives', count: 12, icon: 'car-outline' },
  { id: 'p2', name: 'Work Focus', count: 24, icon: 'laptop-outline' },
  { id: 'p3', name: 'Morning Run', count: 8, icon: 'fitness-outline' },
  { id: 'p4', name: 'Deep Space', count: 16, icon: 'planet-outline' },
];

export default function LibraryScreen() {
  const { liked, playTrack } = usePlayer();
  const likedTracks = ALL_TRACKS.filter(t => liked.has(t.id));
  const fadeAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(80, fadeAnims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true })
    )).start();
  }, []);

  return (
    <View style={styles.screen}>
      <AnimatedBackground />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Library</Text>
        </View>

        {/* Quick cards */}
        <Animated.View style={[styles.quickRow, { opacity: fadeAnims[0] }]}>
          <QuickCard icon="heart" label="Liked" sub={`${liked.size} tracks`} />
          <QuickCard icon="radio" label="My Wave" sub="Endless radio" />
        </Animated.View>
        <Animated.View style={[styles.quickRow, { opacity: fadeAnims[1] }]}>
          <QuickCard icon="time-outline" label="Recent" sub="32 tracks" />
          <QuickCard icon="download-outline" label="Downloads" sub="Offline" />
        </Animated.View>

        {/* Playlists */}
        <Animated.View style={[styles.section, { opacity: fadeAnims[2] }]}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Playlists</Text>
            <TouchableOpacity style={styles.newBtn}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.newBtnText}>New</Text>
            </TouchableOpacity>
          </View>
          {PLAYLISTS.map(pl => (
            <TouchableOpacity key={pl.id} style={styles.playlistItem} activeOpacity={0.7}>
              <View style={styles.playlistArt}>
                <Ionicons name={pl.icon} size={18} color="rgba(255,255,255,0.5)" />
              </View>
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistName}>{pl.name}</Text>
                <Text style={styles.playlistCount}>{pl.count} tracks</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Liked tracks */}
        <Animated.View style={[styles.section, { opacity: fadeAnims[3] }]}>
          <Text style={styles.sectionTitle}>Liked tracks</Text>
          {likedTracks.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={36} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>Like tracks to see them here</Text>
            </View>
          ) : (
            likedTracks.map((t, i) => (
              <TrackCard key={t.id} track={t} index={i} onPress={() => playTrack(t, likedTracks)} />
            ))
          )}
        </Animated.View>

        <View style={{ height: 180 }} />
      </ScrollView>
    </View>
  );
}

function QuickCard({ icon, label, sub }) {
  return (
    <TouchableOpacity style={styles.quickCard} activeOpacity={0.75}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color="rgba(255,255,255,0.7)" />
      </View>
      <View>
        <Text style={styles.quickLabel}>{label}</Text>
        <Text style={styles.quickSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },
  header: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 20 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1 },

  quickRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  quickCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  quickSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },

  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingHorizontal: 4 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
  },
  newBtnText: { color: '#fff', fontSize: 13, fontWeight: '500' },

  playlistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  playlistArt: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  playlistInfo: { flex: 1 },
  playlistName: { color: '#fff', fontSize: 14, fontWeight: '500', marginBottom: 3 },
  playlistCount: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },

  empty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
});
