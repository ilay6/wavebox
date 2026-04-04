import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Image, ActivityIndicator
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import { colors } from '../theme';
import { getCatalog, getTopTracks } from '../services/soundcloud';
import { usePlayer } from '../store/player';

const GENRES = ['All','Hip-Hop','Lo-Fi','Synthwave','Ambient','Indie','Techno','Jazz'];

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonBox({ width: w, height: h, borderRadius = 8, style }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: 'rgba(255,255,255,0.07)', opacity: anim }, style]} />;
}

function HorizontalSkeleton() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
      {[1,2,3,4].map(i => (
        <View key={i} style={{ marginRight: 12 }}>
          <SkeletonBox width={150} height={150} borderRadius={18} />
          <SkeletonBox width={110} height={11} borderRadius={6} style={{ marginTop: 10 }} />
          <SkeletonBox width={70}  height={9}  borderRadius={6} style={{ marginTop: 5 }} />
        </View>
      ))}
    </ScrollView>
  );
}

function TrackSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[1,2,3,4,5].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <SkeletonBox width={20} height={12} borderRadius={4} style={{ marginRight: 14 }} />
          <SkeletonBox width={48} height={48} borderRadius={10} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <SkeletonBox width="80%" height={12} borderRadius={6} />
            <SkeletonBox width="50%" height={10} borderRadius={6} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Horizontal card — artwork fills card, title overlay ───────────────────────
function HCard({ track, onPress }) {
  return (
    <TouchableOpacity style={hS.card} onPress={onPress} activeOpacity={0.8}>
      <View style={hS.art}>
        {track.artwork_url
          ? <Image source={{ uri: track.artwork_url }} style={{ width: 152, height: 152 }} resizeMode="cover" />
          : <View style={hS.artFallback}><Ionicons name="musical-note" size={26} color={colors.textMuted} /></View>
        }
        {/* Bottom gradient + title */}
        <LinearGradient colors={['transparent','rgba(8,8,8,0.92)']} style={hS.overlay}>
          <Text style={hS.artTitle} numberOfLines={2}>{track.title}</Text>
          <Text style={hS.artArtist} numberOfLines={1}>{track.user?.username}</Text>
        </LinearGradient>
        {/* Play button */}
        <View style={hS.playBtn}>
          <Ionicons name="play" size={13} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Animated wave bars (lightweight — uses scaleY + nativeDriver) ─────────────
function WaveBars() {
  const bars = useRef(Array.from({ length: 8 }, () => new Animated.Value(0.2 + Math.random() * 0.8))).current;
  useEffect(() => {
    bars.forEach(a => {
      Animated.loop(Animated.sequence([
        Animated.timing(a, { toValue: Math.random() * 0.85 + 0.15, duration: 400 + Math.random() * 500, useNativeDriver: true }),
        Animated.timing(a, { toValue: Math.random() * 0.2 + 0.05,  duration: 400 + Math.random() * 500, useNativeDriver: true }),
      ])).start();
    });
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 42 }}>
      {bars.map((a, i) => (
        <Animated.View key={i} style={{
          width: 3, height: 42, borderRadius: 2, backgroundColor: colors.accent,
          opacity: a,
          transform: [{ scaleY: a }],
        }} />
      ))}
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [trending, setTrending]       = useState([]);
  const [newTracks, setNewTracks]     = useState([]);
  const [russianTracks, setRussian]   = useState([]);
  const [chillTracks, setChill]       = useState([]);
  const [genreTracks, setGenreTracks] = useState([]);
  const [selectedGenre, setGenre]     = useState('All');
  const [loadingNew,   setLNew]  = useState(true);
  const [loadingRu,    setLRu]   = useState(true);
  const [loadingChill, setLChill]= useState(true);
  const [loadingTrend, setLTrend]= useState(true);
  const [greeting, setGreeting]  = useState('');

  const { playTrack, prefetchTracks } = usePlayer();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 6 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    loadAll();
  }, []);

  async function loadAll() {
    try {
      // Single request gets ALL sections (~200ms with SoundCloud API)
      const cat = await getCatalog();
      if (cat.new?.length)      { setNewTracks(cat.new);      prefetchTracks(cat.new); }
      if (cat.trending?.length) { setTrending(cat.trending);  setGenreTracks(cat.trending); prefetchTracks(cat.trending); }
      if (cat.russian?.length)  { setRussian(cat.russian);    prefetchTracks(cat.russian); }
      if (cat.chill?.length)    { setChill(cat.chill);        prefetchTracks(cat.chill); }
    } catch(e) {
      console.warn('[Home] catalog failed:', e.message);
    }
    setLNew(false); setLTrend(false); setLRu(false); setLChill(false);
  }

  async function handleGenre(g) {
    setGenre(g);
    const data = await getTopTracks(g === 'All' ? '' : g, 15);
    setGenreTracks(data);
  }

  const loading = loadingNew || loadingRu || loadingChill || loadingTrend;
  const heroTrack = newTracks[0] || trending[0];

  return (
    <View style={S.screen}>
      <AnimatedBackground />

      {/* Sticky header */}
      <Animated.View style={[S.stickyHeader, { opacity: headerOpacity }]}>
        <View style={S.stickyBg} />
        <Text style={S.stickyTitle}>WaveBox</Text>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.greeting}>{greeting}</Text>
            <Text style={S.heroTitle}>WaveBox</Text>
          </View>
        </View>

        {loading && (
          <View style={S.loadBanner}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={S.loadText}>Loading music...</Text>
          </View>
        )}

        {/* Hero card */}
        {heroTrack && (
          <TouchableOpacity style={S.hero} onPress={() => playTrack(heroTrack, newTracks.length ? newTracks : trending)} activeOpacity={0.88}>
            {heroTrack.artwork_url && (
              <Image source={{ uri: heroTrack.artwork_url }} style={S.heroBg} resizeMode="cover" />
            )}
            <LinearGradient colors={['transparent','rgba(8,8,8,0.97)']} style={S.heroGrad}>
              <Text style={S.heroTag}>FEATURED</Text>
              <Text style={S.heroName} numberOfLines={2}>{heroTrack.title}</Text>
              <Text style={S.heroArtist}>{heroTrack.user?.username}</Text>
              <View style={S.heroPlayRow}>
                <View style={S.heroPlayBtn}>
                  <Ionicons name="play" size={14} color="#fff" />
                </View>
                <Text style={S.heroPlayTxt}>Play now</Text>
              </View>
            </LinearGradient>
            <View style={S.heroBorder} />
          </TouchableOpacity>
        )}

        {/* My Wave banner */}
        <TouchableOpacity style={S.waveBanner} onPress={() => navigation.navigate('Wave')} activeOpacity={0.85}>
          <View style={S.waveGlass} />
          <View style={S.waveBannerInner}>
            <View style={{ flex: 1 }}>
              <Text style={S.waveTag}>MY WAVE</Text>
              <Text style={S.waveTitle}>Personal radio</Text>
              <Text style={S.waveSub}>AI picks just for you</Text>
            </View>
            <WaveBars />
          </View>
          <View style={S.waveBorder} />
        </TouchableOpacity>

        {/* New Releases */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>New Releases</Text>
          {loadingNew ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {newTracks.map(t => <HCard key={t.id} track={t} onPress={() => playTrack(t, newTracks)} />)}
            </ScrollView>
          )}
        </View>

        {/* Russian */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Russian Hits</Text>
          {loadingRu ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {russianTracks.map(t => <HCard key={t.id} track={t} onPress={() => playTrack(t, russianTracks)} />)}
            </ScrollView>
          )}
        </View>

        {/* Chill */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Chill & Lo-Fi</Text>
          {loadingChill ? <HorizontalSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 8 }}>
              {chillTracks.map(t => <HCard key={t.id} track={t} onPress={() => playTrack(t, chillTracks)} />)}
            </ScrollView>
          )}
        </View>

        {/* Trending + genre filter */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Trending</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 8, marginBottom: 12 }}>
            {GENRES.map(g => (
              <TouchableOpacity key={g} onPress={() => handleGenre(g)}
                style={[S.chip, selectedGenre === g && S.chipActive]}>
                {selectedGenre === g
                  ? <View style={S.chipGrad}><Text style={S.chipTxtActive}>{g}</Text></View>
                  : <Text style={S.chipTxt}>{g}</Text>
                }
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ marginTop: 4 }}>
          {loadingTrend ? <TrackSkeleton /> : genreTracks.map((t, i) => (
            <TrackCard key={t.id} track={t} index={i} showIndex onPress={() => playTrack(t, genreTracks)} />
          ))}
        </View>

        <View style={{ height: 180 }} />
      </Animated.ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    height: 88, paddingTop: 48, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12,
  },
  stickyBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,8,0.88)' },
  stickyTitle: { color: colors.white, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  header: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 16 },
  greeting:  { color: colors.textMuted, fontSize: 12, letterSpacing: 0.5, marginBottom: 3 },
  heroTitle: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: -1 },

  loadBanner: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.glass, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.glassBorder,
  },
  loadText: { color: colors.textMuted, fontSize: 12 },

  // Hero
  hero: { marginHorizontal: 16, borderRadius: 22, overflow: 'hidden', height: 210, marginBottom: 14 },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroGrad: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 18 },
  heroTag: { color: colors.accent, fontSize: 9, letterSpacing: 2.5, fontWeight: '700', marginBottom: 6 },
  heroName: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 3 },
  heroArtist: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 12 },
  heroPlayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroPlayBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  heroPlayTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  heroBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  // Wave banner
  waveBanner: { marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', marginBottom: 6 },
  waveGlass:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.06)' },
  waveBannerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, minHeight: 110 },
  waveBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  waveTag:   { color: colors.accent, fontSize: 9, letterSpacing: 2.5, fontWeight: '700', marginBottom: 5 },
  waveTitle: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 3 },
  waveSub:   { color: colors.textSub, fontSize: 12 },

  section: { marginTop: 26 },
  sectionTitle: { color: colors.white, fontSize: 17, fontWeight: '700', letterSpacing: -0.2, paddingHorizontal: 20, marginBottom: 14 },

  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, marginRight: 8, overflow: 'hidden',
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
  },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)' },
  chipGrad:   { paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt:    { color: colors.textSub, fontSize: 13, fontWeight: '500' },
  chipTxtActive: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const hS = StyleSheet.create({
  card: { width: 152, marginRight: 12 },
  art: {
    width: 152, height: 152, borderRadius: 18, overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.glassBorder,
  },
  artFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 10, paddingTop: 30,
  },
  artTitle:  { color: colors.white, fontSize: 12, fontWeight: '700', lineHeight: 16, marginBottom: 2 },
  artArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
  playBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
});
