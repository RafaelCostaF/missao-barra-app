// Ligações globais: task de GPS, rede, erros não tratados e flush de logs.
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { defineLocationTask } from './location';
import { logger, tracker } from './services';

defineLocationTask(tracker.onFixes, tracker.onLocationError);

let online: boolean | null = null;
Network.addNetworkStateListener((s) => {
  const now = Boolean(s.isConnected && s.isInternetReachable !== false);
  if (now !== online && online !== null) void tracker.onConnectivity(now);
  online = now;
});

AppState.addEventListener('change', (s) => {
  if (s === 'background') void logger.flush();
});

const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
const previous = g.ErrorUtils?.getGlobalHandler();
g.ErrorUtils?.setGlobalHandler((e, fatal) => {
  void logger.error(fatal ? 'app.crash' : 'app.error', e).finally(() => previous?.(e, fatal));
});
