import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Image, ActivityIndicator
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import {
  getTrending, getNewReleases, getRussianTracks,
  getChillTracks, getTopTracks
} from '../services/soundcloud';
import { usePlayer } from '../store/player';

const { width } = Dimensions.get('window');

const GENRES = ['All', 'Hip-Hop', 'Lo-Fi', 'Synthwave', 'Ambient', 'Indie', 'Techno', 'Jazz'];

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonBox({ width: w, height: h, borderRadius = 8, style }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[{
      width: w, height: h, borderRadius,
      backgroundColor: 'rgba(255,255,255,0.1)', opacity: anim,
    }, style]} />
  );
}

function HorizontalSkeleton() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={{ marginRight: 12 }}>
          <SkeletonBox width={140} height={140} borderRadius={14} />
          <SkeletonBox width={110} height={12} borderRadius={6} style={{ marginTop: 10 }} />
          <SkeletonBox width={70} height={10} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
      ))}
    </ScrollView>
  );
}

function TrackSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <SkeletonBox width={20} height={14} borderRadius={4} style={{ marginRight: 12 }} />
          <SkeletonBox width={48} height={48} borderRadius={10} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <SkeletonBox width="80%" height={13} borderRadius={6} />
            <SkeletonBox width="50%" height={11} borderRadius={6} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Horizontal track card ────────────────────────────────────────────────────
function HorizontalTrackCard({ track, onPress }) {
  return (
    <TouchableOpacity style={hStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={hStyles.artwork}>
        {track.artwork_url ? (
          <Image source={{ uri: track.artwork_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="musical-note" size={28} color="rgba(255,255,255,0.15)" />
        )}
        <View style={hStyles.playOverlay}>
          <Ionicons name="play" size={18} color="#fff" />
        </View>
      </View>
      <Text style={hStyles.title} numberOfLines={2}>{track.title}</Text>
      <Text style={hStyles.artist} numberOfLines={1}>{track.user?.username}</Text>
    </TouchableOpacity>
  );
}

// ─── Section with optional "See all" ─────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Animated wave bars in banner ─────────────────────────────────────────────
function WaveBarsAnimated() {
  const bars = Array.from({ length: 16 }, (_, i) => {
    const anim = useRef(new Animated.Value(Math.random())).current;
    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: Math.random() * 0.8 + 0.2, duration: 350 + Math.random() * 400, useNativeDriver: false }),
          Animated.timing(anim, { toValue: Math.random() * 0.3 + 0.05, duration: 350 + Math.random() * 400, useNativeDriver: false }),
        ])
      ).start();
    }, []);
    return anim;
  });
  return (
    <View style={styles.waveBars}>
      {bars.map((anim, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: anim.interpolate({ inputRange: [0, 1], outputRange: [3, 44] }),
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.55] }),
        }]} />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [trending, setTrending] = useState([]);
  const [newTracks, setNewTracks] = useState([]);
  const [russianTracks, setRussianTracks] = useState([]);
  const [chillTracks, setChillTracks] = useState([]);
  const [genreTracks, setGenreTracks] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [loadingNew, setLoadingNew] = useState(true);
  const [loadingRu, setLoadingRu] = useState(true);
  const [loadingChill, setLoadingChill] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const loading = loadingNew || loadingRu || loadingChill || loadingTrending;
  const [greeting, setGreeting] = useState('');
  const { playTrack } = usePlayer();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) setGreeting('Good night');
    else if (h < 12) setGreeting('Good morning');
    else if (h < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
    loadAll();
  }, []);

  async function loadAll() {
    // Load each section independently so they appear as soon as ready
    getNewReleases(10).then(n => { setNewTracks(n); setLoadingNew(false); });
    getRussianTracks(10).then(r => { setRussianTracks(r); setLoadingRu(false); });
    getChillTracks(10).then(c => { setChillTracks(c); setLoadingChill(false); });
    getTrending(15).then(t => { setTrending(t); setGenreTracks(t); setLoadingTrending(false); });
  }

  async function handleGenre(g) {
    setSelectedGenre(g);
    const data = await getTopTracks(g === 'All' ? '' : g, 15);
    setGenreTracks(data);
  }

  return (
    <View style={styles.screen}>
      <AnimatedBackground />

      {/* Sticky header */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.85)' }]} />
        <Text style={styles.stickyTitle}>WaveBox</Text>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.heroTitle}>WaveBox</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>U</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Loading notice */}
        {loading && (
          <View style={styles.wakingBanner}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
            <Text style={styles.wakingText}>Loading music... (first load may take ~30s)</Text>
          </View>
        )}

        {/* My Wave Banner */}
        <TouchableOpacity
          style={styles.waveBanner}
          onPress={() => navigation.navigate('Wave')}
          activeOpacity={0.85}
        >
          <View style={styles.waveBannerInner}>
            <LinearGradient
              colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.waveBannerBorder} />
            <View style={styles.waveLeft}>
              <Text style={styles.waveTag}>MY WAVE</Text>
              <Text style={styles.waveTitle}>Personal radio</Text>
              <Text style={styles.waveSub}>AI picks just for you</Text>
              <View style={styles.waveActionRow}>
                <View style={styles.wavePlayBtn}>
                  <Ionicons name="play" size={14} color="#000" />
                </View>
                <Text style={styles.waveActionText}>Play now</Text>
              </View>
            </View>
            <WaveBarsAnimated />
          </View>
        </TouchableOpacity>

        {/* New Releases */}
        <View style={styles.section}>
          <SectionHeader title="New Releases" />
          {loadingNew ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {newTracks.map(t => (
                <HorizontalTrackCard key={t.id} track={t} onPress={() => playTrack(t, newTracks)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Russian */}
        <View style={styles.section}>
          <SectionHeader title="Russian Hits" />
          {loadingRu ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {russianTracks.map(t => (
                <HorizontalTrackCard key={t.id} track={t} onPress={() => playTrack(t, russianTracks)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Chill */}
        <View style={styles.section}>
          <SectionHeader title="Chill & Lo-Fi" />
          {loadingChill ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {chillTracks.map(t => (
                <HorizontalTrackCard key={t.id} track={t} onPress={() => playTrack(t, chillTracks)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Genre filter + tracks */}
        <View style={styles.section}>
          <SectionHeader title="Trending" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 8, marginBottom: 16 }}>
            {GENRES.map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, selectedGenre === g && styles.chipActive]}
                onPress={() => handleGenre(g)}
              >
                <Text style={[styles.chipText, selectedGenre === g && styles.chipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ marginTop: 8 }}>
          {loadingTrending ? <TrackSkeleton /> : genreTracks.map((track, i) => (
            <TrackCard key={track.id} track={track} index={i} showIndex onPress={() => playTrack(track, genreTracks)} />
          ))}
        </View>

        <View style={{ height: 180 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },

  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    height: 90, paddingTop: 50, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12,
  },
  stickyTitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  header: {
    paddingTop: 64, paddingHorizontal: 20, paddingBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  greeting: { color: 'rgba(255,255,255,0.4)', fontSize: 13, letterSpacing: 0.5, marginBottom: 4 },
  heroTitle: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  avatarBtn: {},
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  wakingBanner: {
    marginHorizontal: 16, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  wakingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  waveBanner: { marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', marginBottom: 8 },
  waveBannerInner: {
    padding: 22, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', minHeight: 130,
  },
  waveBannerBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  waveLeft: { flex: 1 },
  waveTag: { color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 6 },
  waveTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  waveSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 14 },
  waveActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wavePlayBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  waveActionText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

  waveBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 50, paddingRight: 4 },
  waveBar: { width: 3, backgroundColor: '#fff', borderRadius: 2 },

  section: { marginTop: 24 },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },

  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 100, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#000', fontWeight: '700' },
});

const hStyles = StyleSheet.create({
  card: { width: 140, marginRight: 12 },
  artwork: {
    width: 140, height: 140, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10, overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  playOverlay: {
    position: 'absolute', bottom: 8, right: 8,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 3 },
  artist: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
});
