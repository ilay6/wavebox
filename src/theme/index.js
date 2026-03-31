export const colors = {
  bg: '#0a0a0a',
  bgSecondary: '#141414',
  bgCard: '#1a1a1a',
  bgElevated: '#222222',
  white: '#ffffff',
  whiteAlpha90: 'rgba(255,255,255,0.9)',
  whiteAlpha60: 'rgba(255,255,255,0.6)',
  whiteAlpha30: 'rgba(255,255,255,0.3)',
  whiteAlpha10: 'rgba(255,255,255,0.1)',
  whiteAlpha05: 'rgba(255,255,255,0.05)',
  accent: '#ffffff',
  accentDim: 'rgba(255,255,255,0.15)',
  border: 'rgba(255,255,255,0.08)',
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600', color: colors.white },
  body: { fontSize: 15, fontWeight: '400', color: colors.whiteAlpha90 },
  caption: { fontSize: 13, fontWeight: '400', color: colors.whiteAlpha60 },
  small: { fontSize: 11, fontWeight: '500', color: colors.whiteAlpha30, letterSpacing: 0.5 },
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};
