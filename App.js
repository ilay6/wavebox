import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useState, createContext, useContext, useRef, useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { PlayerProvider } from './src/store/player';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import WaveScreen from './src/screens/WaveScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import MiniPlayer from './src/components/MiniPlayer';

const Tab = createBottomTabNavigator();
const { height } = Dimensions.get('window');

export const PlayerModalContext = createContext({ open: () => {}, close: () => {} });
export const usePlayerModal = () => useContext(PlayerModalContext);

function TabBar({ state, navigation }) {
  const icons = {
    Home:    ['home',    'home-outline'],
    Search:  ['search',  'search-outline'],
    Wave:    ['radio',   'radio-outline'],
    Library: ['library', 'library-outline'],
  };

  return (
    <View style={styles.tabBarWrapper}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tabBarBg} />
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const [active, inactive] = icons[route.name] || ['apps', 'apps-outline'];
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
                <Ionicons name={focused ? active : inactive} size={22} color={focused ? '#000' : 'rgba(255,255,255,0.4)'} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Bottom sheet player (not full screen)
function PlayerBottomSheet({ visible, onClose }) {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: height, duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <TouchableOpacity onPress={onClose} style={styles.handleWrap} activeOpacity={0.7}>
          <View style={styles.handle} />
        </TouchableOpacity>
        <PlayerScreen onClose={onClose} />
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <PlayerProvider>
      <PlayerModalContext.Provider value={{ open: () => setPlayerOpen(true), close: () => setPlayerOpen(false) }}>
        <NavigationContainer>
          <View style={styles.app}>
            <StatusBar style="light" />

            <Tab.Navigator
              tabBar={props => <TabBar {...props} />}
              screenOptions={{ headerShown: false }}
            >
              <Tab.Screen name="Home" component={HomeScreen} />
              <Tab.Screen name="Search" component={SearchScreen} />
              <Tab.Screen name="Wave" component={WaveScreen} />
              <Tab.Screen name="Library" component={LibraryScreen} />
            </Tab.Navigator>

            {!playerOpen && <MiniPlayer onPress={() => setPlayerOpen(true)} />}

            <PlayerBottomSheet visible={playerOpen} onClose={() => setPlayerOpen(false)} />
          </View>
        </NavigationContainer>
      </PlayerModalContext.Provider>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#080808' },

  tabBarWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 84, paddingBottom: 20,
  },
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  tabBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIconWrap: {
    width: 46, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: '#fff',
    shadowColor: '#fff', shadowRadius: 10, shadowOpacity: 0.2,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: height * 0.88,
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 101,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12, paddingBottom: 4,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
