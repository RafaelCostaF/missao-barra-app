import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { toFix, type Fix, type LocationProvider } from '@mb/core';

/** Expo Go não suporta localização em 2º plano: usa GPS em 1º plano (app aberto). */
export const backgroundSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let handlers: { onFixes: (f: Fix[]) => Promise<void>; onError: (e: unknown) => Promise<void> } | null = null;
let foregroundWatch: Location.LocationSubscription | null = null;

export const LOCATION_TASK = 'mb-location';

/**
 * Ajustes de bateria: 1 fix a cada ~20 s / 20 m (caminhada ≈ 1,4 m/s);
 * em 2º plano o SO agrupa entregas a cada 60 s.
 */
const OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 20_000,
  distanceInterval: 20,
  deferredUpdatesInterval: 60_000,
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Missão Barra — localização ativa',
    notificationBody: 'Sua localização está sendo compartilhada. Finalize o percurso para parar.',
    notificationColor: '#C93C05',
  },
};

export const expoLocation: LocationProvider = {
  async requestPermission() {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';
    // Sem "Sempre", o rastreio só funciona com o app aberto; seguimos e a UI avisa.
    if (backgroundSupported) await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    return 'granted';
  },
  async start() {
    if (backgroundSupported) return Location.startLocationUpdatesAsync(LOCATION_TASK, OPTIONS);
    foregroundWatch?.remove();
    foregroundWatch = await Location.watchPositionAsync(
      { accuracy: OPTIONS.accuracy, timeInterval: OPTIONS.timeInterval, distanceInterval: OPTIONS.distanceInterval },
      (l) => void handlers?.onFixes([toFix(l)]),
      (reason) => void handlers?.onError(new Error(reason)),
    );
  },
  async stop() {
    foregroundWatch?.remove();
    foregroundWatch = null;
    if (backgroundSupported && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  },
};

export async function hasBackgroundPermission() {
  return backgroundSupported && (await Location.getBackgroundPermissionsAsync()).status === 'granted';
}

/** Precisa ser definido no escopo do módulo para rodar com o app em 2º plano. */
export function defineLocationTask(onFixes: (f: Fix[]) => Promise<void>, onError: (e: unknown) => Promise<void>) {
  handlers = { onFixes, onError };
  if (!backgroundSupported || TaskManager.isTaskDefined(LOCATION_TASK)) return;
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error) return onError(error);
    await onFixes(data.locations.map(toFix));
  });
}
