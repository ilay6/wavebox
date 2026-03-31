import { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

const BLOBS = [
  { size: 600, x: -150, y: -100, dur: 9000, delay: 0 },
  { size: 500, x: width - 250, y: 50, dur: 11000, delay: 400 },
  { size: 450, x: 100, y: height * 0.4, dur: 8500, delay: 800 },
  { size: 400, x: width - 180, y: height * 0.55, dur: 12000, delay: 1200 },
  { size: 350, x: width * 0.25, y: height * 0.72, dur: 7800, delay: 600 },
];

function Blob({ size, x, y, dur, delay }) {
  const tx = useRef(new Animated.Value(x)).current;
  const ty = useRef(new Animated.Value(y)).current;
  const sc = useRef(new Animated.Value(0.9)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 2000, delay, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(tx, { toValue: x + (Math.random() - 0.5) * 200, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tx, { toValue: x, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(ty, { toValue: y + (Math.random() - 0.5) * 150, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ty, { toValue: y, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(sc, { toValue: 1.25, duration: dur * 0.75, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(sc, { toValue: 0.8, duration: dur * 0.75, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // На вебе используем настоящий CSS blur
  const webStyle = Platform.OS === 'web' ? { filter: 'blur(90px)' } : {};

  return (
    <Animated.View style={[{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: 'rgba(255,255,255,0.22)',
      transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
      opacity: op,
    }, webStyle]} />
  );
}

export default function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#080808' }]} />
      {BLOBS.map((b, i) => <Blob key={i} {...b} />)}
      {/* Overlay чтобы блобы были тонкими */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.78)' }]} />
    </View>
  );
}
