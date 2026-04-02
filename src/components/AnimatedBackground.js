import { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

// Большие мягкие orbs
const ORBS = [
  { color: 'rgba(255,255,255,0.22)', size: 560, x: -100,      y: -120,        dur: 20000 },
  { color: 'rgba(255,255,255,0.12)', size: 460, x: width-300, y: height*0.05, dur: 25000 },
  { color: 'rgba(255,255,255,0.10)', size: 400, x: width*0.1, y: height*0.45, dur: 18000 },
  { color: 'rgba(255,255,255,0.08)', size: 360, x: width-220, y: height*0.6,  dur: 22000 },
];

// Маленькие яркие блики
const GLINTS = [
  { x: width*0.15, y: height*0.12, dur: 4000, delay: 0 },
  { x: width*0.78, y: height*0.08, dur: 5500, delay: 800 },
  { x: width*0.55, y: height*0.35, dur: 3800, delay: 1600 },
  { x: width*0.2,  y: height*0.65, dur: 4800, delay: 400 },
];

function Orb({ color, size, x, y, dur }) {
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(op, { toValue: 1, duration: 3000, useNativeDriver: true }).start();
    const mx = 50 + Math.random() * 70;
    const my = 30 + Math.random() * 50;
    Animated.loop(Animated.sequence([
      Animated.timing(tx, { toValue:  mx, duration: dur,       easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tx, { toValue: -mx, duration: dur,       easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tx, { toValue:   0, duration: dur * 0.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(ty, { toValue:  my, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ty, { toValue: -my, duration: dur * 1.3, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(ty, { toValue:   0, duration: dur * 0.6, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  const webBlur = Platform.OS === 'web' ? { filter: 'blur(90px)' } : {};

  return (
    <Animated.View style={[{
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, opacity: op,
      transform: [{ translateX: tx }, { translateY: ty }],
    }, webBlur]} />
  );
}

function Glint({ x, y, dur, delay }) {
  const op = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = () => {
      Animated.sequence([
        Animated.delay(delay + Math.random() * 3000),
        Animated.parallel([
          Animated.timing(op, { toValue: 0.7, duration: dur * 0.3, useNativeDriver: true }),
          Animated.timing(sc, { toValue: 1,   duration: dur * 0.3, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(op, { toValue: 0, duration: dur * 0.7, useNativeDriver: true }),
          Animated.timing(sc, { toValue: 0.4, duration: dur * 0.7, useNativeDriver: true }),
        ]),
      ]).start(loop);
    };
    loop();
  }, []);

  const webBlur = Platform.OS === 'web' ? { filter: 'blur(6px)' } : {};

  return (
    <Animated.View style={[{
      position: 'absolute', left: x - 15, top: y - 15,
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.9)',
      opacity: op, transform: [{ scale: sc }],
    }, webBlur]} />
  );
}

export default function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#080808' }]} />
      {ORBS.map((o, i) => <Orb key={i} {...o} />)}
      {GLINTS.map((g, i) => <Glint key={i} {...g} />)}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,8,0.58)' }]} />
    </View>
  );
}
