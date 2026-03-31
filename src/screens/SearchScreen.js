import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import { searchTracks } from '../services/soundcloud';
import { usePlayer } from '../store/player';

const CATEGORIES = [
  { label: 'Lo-Fi', icon: 'headset-outline', desc: 'Beats to relax' },
  { label: 'Hip-Hop', icon: 'mic-outline', desc: 'Street sounds' },
  { label: 'Electronic', icon: 'pulse-outline', desc: 'Digital waves' },
  { label: 'Ambient', icon: 'cloud-outline', desc: 'Space & calm' },
  { label: 'Indie', icon: 'color-palette-outline', desc: 'Independent art' },
  { label: 'Jazz', icon: 'musical-notes-outline', desc: 'Classic cool' },
  { label: 'Drill', icon: 'flame-outline', desc: 'Hard energy' },
  { label: 'R&B', icon: 'heart-outline', desc: 'Soulful vibes' },
  { label: 'Techno', icon: 'disc-outline', desc: 'Deep beats' },
  { label: 'Trap', icon: 'thunderstorm-outline', desc: 'Dark trap' },
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [focused, setFocused] = useState(false);
  const { playTrack } = usePlayer();
  const inputAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(inputAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };

  const handleBlur = () => {
    setFocused(false);
    Animated.timing(inputAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true); setSearched(true);
    const data = await searchTracks(q);
    setResults(data);
    setLoading(false);
  }, []);

  const borderColor = inputAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.25)'],
  });

  return (
    <View style={styles.screen}>
      <AnimatedBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Animated.View style={[styles.searchBar, { borderColor }]}>
          <Ionicons name="search" size={17} color={focused ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'} />
          <TextInput
            style={styles.input}
            placeholder="Artists, tracks, genres..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleSearch(query)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
              <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {!searched ? (
        <FlatList
          data={CATEGORIES}
          keyExtractor={c => c.label}
          numColumns={2}
          columnWrapperStyle={styles.catRow}
          contentContainerStyle={styles.catList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<Text style={styles.browseTitle}>Browse</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.catCard}
              onPress={() => { setQuery(item.label); handleSearch(item.label); }}
              activeOpacity={0.75}
            >
              <View style={styles.catIconWrap}>
                <Ionicons name={item.icon} size={22} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.catLabel}>{item.label}</Text>
              <Text style={styles.catDesc}>{item.desc}</Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={<View style={{ height: 160 }} />}
        />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.loadingText}>Searching SoundCloud...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={52} color="rgba(255,255,255,0.15)" />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyText}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={t => t.id.toString()}
          renderItem={({ item, index }) => (
            <TrackCard track={item} index={index} onPress={() => playTrack(item, results)} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 160 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },
  header: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1, marginBottom: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1,
  },
  input: { flex: 1, color: '#fff', fontSize: 15 },

  browseTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 20, marginTop: 20, marginBottom: 4 },
  catList: { paddingHorizontal: 16, paddingTop: 8 },
  catRow: { gap: 10, marginBottom: 10 },
  catCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  catIconWrap: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  catLabel: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  catDesc: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
