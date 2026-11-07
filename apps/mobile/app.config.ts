import type { ConfigContext, ExpoConfig } from 'expo/config';

// Chave do Google Maps (Android) vem do ambiente; sem ela o app mostra a lista no lugar do mapa.
const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: { ...config.android, ...(mapsKey && { config: { googleMaps: { apiKey: mapsKey } } }) },
  extra: { ...config.extra, hasMapsKey: Boolean(mapsKey) },
});
