import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBackground from '../components/AnimatedBackground';
import TrackCard from '../components/TrackCard';
import { colors } from '../theme';
import { searchTracks } from '../services/soundcloud';
import { usePlayer } from '../store/player';

const CATEGORIES = [
  { label: 'Lo-Fi',      icon: 'headset-outline'       },
  { label: 'Hip-Hop',    icon: 'mic-outline'            },
  { label: 'Electronic', icon: 'pulse-outline'          },
  { label: 'Ambient',    icon: 'cloud-outline'          },
  { label: 'Indie',      icon: 'color-palette-outline'  },
  { label: 'Jazz',       icon: 'musical-notes-outline'  },
  { label: 'Drill',      icon: 'flame-outline'          },
  { label: 'R&B',        icon: 'heart-outline'          },
  { label: 'Techno',     icon: 'disc-outline'           },
  { label: 'Trap',       icon: 'thunderstorm-outline'   },
];

export default function SearchScreen() {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [focused,  setFocused]  = useState(false);
  const { playTrack } = usePlayer();
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };
  const handleBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true); setSearched(true);
    const data = await searchTracks(q);
    setResults(data);
    setLoading(false);
  }, []);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.glassBorder, 'rgba(45,212,191,0.5)'],
  });

  return (
    <View style={S.screen}>
      <AnimatedBackground />

      <View style={S.header}>
        <Text style={S.title}>Search</Text>
        <Animated.View style={[S.searchBar, { borderColor }]}>
          <Ionicons name="search" size={16}
            color={focused ? colors.accent : colors.textMuted} />
          <TextInput
            style={S.input}
            placeholder="Artists, tracks, genres..."
            placeholderTextColor={colors.textMuted}
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
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {!searched ? (
        <FlatList
          data={CATEGORIES}
          keyExtractor={c => c.label}
          numColumns={2}
          columnWrapperStyle={S.catRow}
          contentContainerStyle={S.catList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<Text style={S.browseTitle}>Browse</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={S.catCard} onPress={() => { setQuery(item.label); handleSearch(item.label); }} activeOpacity={0.82}>
              <View style={S.catInner}>
                <Ionicons name={item.icon} size={22} color={colors.accent} />
                <Text style={S.catLabel}>{item.label}</Text>
              </View>
              <View style={S.catBorder} />
            </TouchableOpacity>
          )}
          ListFooterComponent={<View style={{ height: 160 }} />}
        />
      ) : loading ? (
        <View style={S.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={S.loadTxt}>Searching SoundCloud...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="search-outline" size={48} color={colors.textMuted} />
          <Text style={S.emptyTitle}>No results</Text>
          <Text style={S.emptyTxt}>Try a different search term</Text>
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

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 10 },
  title:  { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: -1, marginBottom: 14 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.glass,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1,
  },
  input: { flex: 1, color: colors.white, fontSize: 15 },

  browseTitle: { color: colors.white, fontSize: 17, fontWeight: '700', marginLeft: 4, marginTop: 18, marginBottom: 6 },
  catList: { paddingHorizontal: 16, paddingTop: 4 },
  catRow:  { gap: 10, marginBottom: 10 },
  catCard: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  catInner: {
    padding: 18, gap: 10, minHeight: 88, justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  catBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  catLabel: { color: colors.white, fontSize: 14, fontWeight: '600' },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadTxt:    { color: colors.textSub, fontSize: 14 },
  emptyTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  emptyTxt:   { color: colors.textSub, fontSize: 14 },
});
