import tokens from '@mb/ui-tokens/tokens.json';

export const c = { ...tokens.color, surface: '#FFFFFF', danger: '#C4261D', ok: '#1F8A4C', warn: '#B98900' };
export const radius = 10;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const font = {
  display: 'ArchivoBlack_400Regular',
  body: 'Inter_400Regular',
  bold: 'Inter_800ExtraBold',
};

/** Sombra discreta e consistente (iOS + Android). */
export const shadow = {
  shadowColor: '#1D1E22',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

/** Cores por estado de sinal: recente vs desatualizado precisa ser óbvio no mapa. */
export const signalColor = {
  tracking: c.ok,
  stale: c.warn,
  not_started: c.inkSoft,
  finished: c.charcoal,
} as const;
