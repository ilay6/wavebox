import { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

// Mobile: completely static background — zero GPU cost
// Web: simple static gradient (removed animated orbs — unnecessary perf cost)
export default memo(function AnimatedBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#080808' }]} />
    </View>
  );
});
