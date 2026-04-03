import { useEffect, useRef, memo } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// Fewer, simpler orbs on mobile — no blur filter
const ORBS = isWeb ? [
  { color: 'rgba(255,255,255,0.18)', size: 500, x: -100, y: -120, dur: 22000 },
  { color: 'rgba(255,255,255,0.10)', size: 400, x: width - 300, y: height * 0.05, dur: 26000 },
  { color: 'rgba(255,255,255,0.08)', size: 350, x: width * 0.1, y: height * 0.45, dur: 20000 },
] : [
  // Mobile: just 2 simple gradient-like orbs, no blur
  { color: 'rgba(255,255,255,0.06)', size: 400, x: -80, y: -100, dur: 30000 },
  { color: 'rgba(255,255,255,0.04)', size: 350, x: width - 200, y: height * 0.3, dur: 35000 },
];

function Orb({ color, size, x, y, dur }) {
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mx = 30 + Math.random() * 40;
    const my = 20 + Math.random() * 30;
    Animated.loop(Animated.sequence([
      Animated.timing(tx, { toValue: mx, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tx, { toValue: -mx, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tx, { toValue: 0, duration: dur * 0.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(ty, { toValue: my, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ty, { toValue: -my, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: dur * 0.6, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  return (
    <Animated.View style={[{
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ translateX: tx }, { translateY: ty }],
    }, isWeb ? { filter: 'blur(80px)' } : null]} />
  );
}

// Glints only on web — too expensive on mobile
function Glint({ x, y, dur, delay }) {
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = () => {
      Animated.sequence([
        Animated.delay(delay + Math.random() * 3000),
        Animated.timing(op, { toValue: 0.5, duration: dur * 0.3, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0, duration: dur * 0.7, useNativeDriver: true }),
      ]).start(loop);
    };
    loop();
  }, []);

  return (
    <Animated.View style={{
      position: 'absolute', left: x - 10, top: y - 10,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.8)',
      opacity: op,
      ...(isWeb ? { filter: 'blur(6px)' } : {}),
    }} />
  );
}

const GLINTS = [
  { x: width * 0.15, y: height * 0.12, dur: 4000, delay: 0 },
  { x: width * 0.78, y: height * 0.08, dur: 5500, delay: 800 },
  { x: width * 0.55, y: height * 0.35, dur: 3800, delay: 1600 },
];

export default memo(function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#080808' }]} />
      {ORBS.map((o, i) => <Orb key={i} {...o} />)}
      {isWeb && GLINTS.map((g, i) => <Glint key={i} {...g} />)}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.6)' }]} />
    </View>
  );
});
