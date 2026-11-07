import tokens from '@mb/ui-tokens/tokens.json';

export const c = tokens.color;
export const radius = 4;

export const font = {
  display: 'ArchivoBlack_400Regular',
  body: 'Inter_400Regular',
  bold: 'Inter_800ExtraBold',
};

/** Cores por estado de sinal: recente vs desatualizado precisa ser óbvio no mapa. */
export const signalColor = {
  tracking: '#1F8A4C',
  stale: '#B98900',
  not_started: c.inkSoft,
  finished: c.charcoal,
} as const;
