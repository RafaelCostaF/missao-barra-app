// Instâncias únicas do app. Também carregado pela task de GPS em 2º plano (sem UI).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { createApi, createLogger, createPositionQueue, createTracker } from '@mb/core';
import { expoLocation } from './location';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
export const api = createApi(supabase);

/** Campos anexados a todo log; sessionId/pseudoUser são preenchidos em tempo de execução. */
export const logContext: { session_id?: string; pseudo_user?: string } = {};

export const logger = createLogger({
  endpoint: `${url}/functions/v1/log-ingest`,
  getAuthToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  storage: AsyncStorage,
  context: () => ({
    ...logContext,
    app_version: Constants.expoConfig?.version,
    os: `${Platform.OS} ${Platform.Version}`,
    device: Device.modelName ?? undefined,
  }),
});

export const queue = createPositionQueue(AsyncStorage, api.pushPositions, logger);
export const tracker = createTracker({
  location: expoLocation,
  api: { startTracking: api.startTracking, finish: api.finish },
  queue,
  logger,
});
