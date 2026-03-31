import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Animated, Image } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import { getTopTracks, getNewReleases, getRecommended } from '../services/soundcloud';
import { usePlayer } from '../store/player';
import { usePlayerModal } from '../../App';
import { colors, spacing } from '../theme';

const { width } = Dimensions.get('window');

const GENRES = ['All', 'Lo-Fi', 'Synthwave', 'Ambient', 'Hip-Hop', 'Indie', 'Techno', 'Jazz'];

const FEATURED = [
  { id: 'f1', title: 'Late Night Coding', sub: 'Deep focus · 2h 14m', icon: 'code-slash-outline' },
  { id: 'f2', title: 'Midnight Drive', sub: 'Chill · 1h 42m', icon: 'car-outline' },
  { id: 'f3', title: 'Soul Sessions', sub: 'Emotional · 58m', icon: 'heart-outline' },
  { id: 'f4', title: 'Underground Cuts', sub: 'Rare finds · 1h 20m', icon: 'layers-outline' },
];

export default function HomeScreen({ navigation }) {
  const [tracks, setTracks] = useState([]);
  const [newTracks, setNewTracks] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('All');
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
    const [main, fresh, rec] = await Promise.all([
      getTopTracks('', 12),
      getNewReleases(8),
      getRecommended([]),
    ]);
    setTracks(main);
    setNewTracks(fresh);
    setRecommended(rec);
  }

  async function loadTracks(genre) {
    const data = await getTopTracks(genre === 'All' ? '' : genre, 12);
    setTracks(data);
  }

  function handleGenre(g) {
    setSelectedGenre(g);
    loadTracks(g);
  }

  return (
    <View style={styles.screen}>
      <AnimatedBackground />

      {/* Sticky blur header on scroll */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.7)' }]} />
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

        {/* Featured horizontal scroll */}
        <View style={styles.section}>
          <SectionHeader title="Featured playlists" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
            {FEATURED.map(f => (
              <TouchableOpacity key={f.id} style={styles.featCard} activeOpacity={0.75}>
                <View style={styles.featIcon}>
                  <Ionicons name={f.icon} size={26} color="rgba(255,255,255,0.6)" />
                </View>
                <Text style={styles.featTitle}>{f.title}</Text>
                <Text style={styles.featSub}>{f.sub}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Новинки */}
        {newTracks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="New releases" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {newTracks.map(t => (
                <HorizontalTrackCard key={t.id} track={t} onPress={() => playTrack(t, newTracks)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Рекомендации */}
        {recommended.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recommended for you" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {recommended.map(t => (
                <HorizontalTrackCard key={t.id} track={t} onPress={() => playTrack(t, recommended)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Genre filter */}
        <View style={styles.section}>
          <SectionHeader title="Trending" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
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

        {/* Tracks */}
        <View style={{ marginTop: 8 }}>
          {tracks.map((track, i) => (
            <TrackCard key={track.id} track={track} index={i} showIndex onPress={() => playTrack(track, tracks)} />
          ))}
        </View>

        <View style={{ height: 180 }} />
      </Animated.ScrollView>
    </View>
  );
}

function SectionHeader({ title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function HorizontalTrackCard({ track, onPress }) {
  const { open: openPlayer } = usePlayerModal();
  const ARTWORK_BG = ['#111','#0e0e0e','#131313','#0d0d0d'];
  return (
    <TouchableOpacity style={hStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[hStyles.artwork, { backgroundColor: ARTWORK_BG[track.id % ARTWORK_BG.length] }]}>
        {track.artwork_url ? (
          <Image source={{ uri: track.artwork_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="musical-note" size={28} color="rgba(255,255,255,0.15)" />
        )}
        <View style={hStyles.playOverlay}>
          <Ionicons name="play" size={20} color="#fff" />
        </View>
      </View>
      <Text style={hStyles.title} numberOfLines={2}>{track.title}</Text>
      <Text style={hStyles.artist} numberOfLines={1}>{track.user?.username}</Text>
    </TouchableOpacity>
  );
}

function WaveBarsAnimated() {
  const bars = Array.from({ length: 18 }, (_, i) => {
    const anim = useRef(new Animated.Value(Math.random())).current;
    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: Math.random(), duration: 400 + Math.random() * 400, useNativeDriver: false }),
          Animated.timing(anim, { toValue: Math.random() * 0.4 + 0.1, duration: 400 + Math.random() * 400, useNativeDriver: false }),
        ])
      ).start();
    }, []);
    return anim;
  });

  return (
    <View style={styles.waveBars}>
      {bars.map((anim, i) => (
        <Animated.View key={i} style={[styles.waveBar, {
          height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 44] }),
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
        }]} />
      ))}
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

  featCard: {
    width: 140, marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  featIcon: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  featTitle: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4, lineHeight: 18 },
  featSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  playOverlay: {
    position: 'absolute', bottom: 8, right: 8,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 3 },
  artist: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
});
