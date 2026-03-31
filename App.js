import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useState, createContext, useContext } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
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

// Shared context to open player from anywhere
export const PlayerModalContext = createContext({ open: () => {} });
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

export default function App() {
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <PlayerProvider>
      <PlayerModalContext.Provider value={{ open: () => setPlayerOpen(true) }}>
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

            <MiniPlayer onPress={() => setPlayerOpen(true)} />

            <Modal
              visible={playerOpen}
              animationType="slide"
              presentationStyle="fullScreen"
              onRequestClose={() => setPlayerOpen(false)}
            >
              <PlayerScreen onClose={() => setPlayerOpen(false)} />
            </Modal>
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
});
