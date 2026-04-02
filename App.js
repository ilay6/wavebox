import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useState, createContext, useContext, useRef, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Animated, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { PlayerProvider } from './src/store/player';
import { colors } from './src/theme';
import HomeScreen    from './src/screens/HomeScreen';
import SearchScreen  from './src/screens/SearchScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import WaveScreen    from './src/screens/WaveScreen';
import PlayerScreen  from './src/screens/PlayerScreen';
import MiniPlayer    from './src/components/MiniPlayer';

const Tab = createBottomTabNavigator();

export const PlayerModalContext = createContext({ open: () => {}, close: () => {} });
export const usePlayerModal = () => useContext(PlayerModalContext);

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ state, navigation }) {
  const icons = {
    Home:    ['home',    'home-outline'],
    Search:  ['search',  'search-outline'],
    Wave:    ['radio',   'radio-outline'],
    Library: ['library', 'library-outline'],
  };

  return (
    <View style={S.tabBarWrapper}>
      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={S.tabBarBg} />
      <View style={S.tabBar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const [active, inactive] = icons[route.name] || ['apps', 'apps-outline'];
          return (
            <TouchableOpacity
              key={route.key}
              style={S.tabItem}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.7}
            >
              {focused ? (
                <View style={S.tabIconActive}>
                  <Ionicons name={active} size={20} color="#fff" />
                </View>
              ) : (
                <View style={S.tabIconWrap}>
                  <Ionicons name={inactive} size={20} color={colors.textMuted} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Player overlay — slides up from bottom ────────────────────────────────────
function PlayerOverlay({ visible, onClose }) {
  const slideAnim = useRef(new Animated.Value(1)).current; // 0=shown, 1=hidden
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 68, friction: 14, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 1, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, S.backdrop]}
        onPress={onClose} activeOpacity={1} pointerEvents="auto"
      />
      {/* Card */}
      <View style={S.cardWrap} pointerEvents="box-none">
        <Animated.View pointerEvents="auto" style={{
          transform: [{ translateY: slideAnim.interpolate({ inputRange: [0,1], outputRange: [0, 600] }) }]
        }}>
          <PlayerScreen onClose={onClose} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <PlayerProvider>
      <PlayerModalContext.Provider value={{ open: () => setPlayerOpen(true), close: () => setPlayerOpen(false) }}>
        <NavigationContainer>
          <View style={S.app}>
            <StatusBar style="light" />

            <Tab.Navigator
              tabBar={props => <TabBar {...props} />}
              screenOptions={{ headerShown: false }}
            >
              <Tab.Screen name="Home"    component={HomeScreen} />
              <Tab.Screen name="Search"  component={SearchScreen} />
              <Tab.Screen name="Wave"    component={WaveScreen} />
              <Tab.Screen name="Library" component={LibraryScreen} />
            </Tab.Navigator>

            {!playerOpen && <MiniPlayer onPress={() => setPlayerOpen(true)} />}
            <PlayerOverlay visible={playerOpen} onClose={() => setPlayerOpen(false)} />
          </View>
        </NavigationContainer>
      </PlayerModalContext.Provider>
    </PlayerProvider>
  );
}

const S = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },

  tabBarWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 82, paddingBottom: 18,
  },
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,10,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tabBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 6,
  },
  tabItem:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIconWrap:  { width: 44, height: 34, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: {
    width: 44, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },

  backdrop: { backgroundColor: 'rgba(0,0,0,0.7)' },
  cardWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 88,
  },
});
