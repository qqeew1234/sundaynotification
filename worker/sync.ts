import {
  SHOWCASE_INFO,
  fetchSundayEvent,
  getKstDateString,
  shouldShowShowcase,
} from './nexon.ts';
import type { SundayEventApiResponse, SundayEventNotice } from './nexon.ts';
import { notifySubscribersIfNewImage } from './push.ts';
import type { PushKvStore, VapidConfig } from './push.ts';

export const KV_CACHE_KEY = 'sunday:event:v1';
export const KV_SYNC_STATE_KEY = 'sunday:sync-state:v1';
export const KV_TTL_SECONDS = 60 * 60 * 24 * 14;
export const MAX_ATTEMPTS_PER_DAY = 4; // 10:00 KST 1회 + 1분 간격 3회 재시도 (10:01, 10:02, 10:03)

export interface CachedSundayEvent {
  notice: SundayEventNotice | null;
  fetchedAt: string;
}

export interface SyncState {
  dateKst: string;
  status: 'success' | 'failed';
  attempts: number;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface KvStore {
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export type ScheduledSyncResult =
  | { action: 'synced'; attempts: number }
  | { action: 'failed'; attempts: number }
  | { action: 'skipped_success'; attempts: number }
  | { action: 'skipped_exhausted'; attempts: number };

export interface SyncOptions {
  vapid?: VapidConfig | null;
  pushKv?: PushKvStore;
  throwOnDetailError?: boolean;
}

function isPushKvStore(kv: KvStore): kv is PushKvStore {
  const candidate = kv as Partial<PushKvStore>;
  return typeof candidate.delete === 'function' && typeof candidate.list === 'function';
}

export async function readCachedSundayEvent(kv: KvStore): Promise<CachedSundayEvent | null> {
  try {
    const cached = await kv.get<CachedSundayEvent>(KV_CACHE_KEY, 'json');
    if (cached && typeof cached.fetchedAt === 'string') {
      return cached;
    }
    return null;
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'kv_cache_read_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

export async function readSyncState(kv: KvStore): Promise<SyncState | null> {
  try {
    const state = await kv.get<SyncState>(KV_SYNC_STATE_KEY, 'json');
    return state ?? null;
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'kv_sync_state_read_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

async function writeSyncState(kv: KvStore, state: SyncState): Promise<void> {
  try {
    await kv.put(KV_SYNC_STATE_KEY, JSON.stringify(state), {
      expirationTtl: KV_TTL_SECONDS,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'kv_sync_state_write_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

export function toApiResponse(cached: CachedSundayEvent, now: Date): SundayEventApiResponse {
  let activeNotice = cached.notice;
  if (activeNotice?.dateEventEnd) {
    const endMs = Date.parse(activeNotice.dateEventEnd);
    if (Number.isFinite(endMs) && endMs <= now.getTime()) {
      activeNotice = null;
    }
  }
  return {
    status: 'ok',
    notice: activeNotice,
    showShowcase: shouldShowShowcase(now),
    showcase: SHOWCASE_INFO,
    fetchedAt: cached.fetchedAt,
  };
}

export async function syncSundayEventToKv(
  kv: KvStore,
  apiKey: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  options?: SyncOptions
): Promise<SundayEventApiResponse> {
  const result = await fetchSundayEvent(
    apiKey,
    now,
    fetchImpl,
    options?.throwOnDetailError ?? false
  );
  const payload: CachedSundayEvent = {
    notice: result.notice,
    fetchedAt: result.fetchedAt,
  };
  await kv.put(KV_CACHE_KEY, JSON.stringify(payload), {
    expirationTtl: KV_TTL_SECONDS,
  });

  if (result.notice?.imageUrl && options?.vapid) {
    const pushTarget = options.pushKv ?? (isPushKvStore(kv) ? kv : null);
    if (pushTarget) {
      try {
        await notifySubscribersIfNewImage(pushTarget, options.vapid, result.notice, now, fetchImpl);
      } catch (err) {
        console.error(
          JSON.stringify({
            message: 'push_dispatch_unhandled_error',
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }
  }

  return result;
}

export async function runScheduledSync(
  kv: KvStore,
  apiKey: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  options?: Omit<SyncOptions, 'throwOnDetailError'>
): Promise<ScheduledSyncResult> {
  const todayKst = getKstDateString(now);
  const state = await readSyncState(kv);
  const sameDay = state?.dateKst === todayKst;

  if (sameDay && state.status === 'success') {
    console.log(
      JSON.stringify({
        message: 'scheduled_sync_skipped_success',
        dateKst: todayKst,
        attempts: state.attempts,
      })
    );
    return { action: 'skipped_success', attempts: state.attempts };
  }

  if (sameDay && state.attempts >= MAX_ATTEMPTS_PER_DAY) {
    console.log(
      JSON.stringify({
        message: 'scheduled_sync_skipped_exhausted',
        dateKst: todayKst,
        attempts: state.attempts,
      })
    );
    return { action: 'skipped_exhausted', attempts: state.attempts };
  }

  const attempts = sameDay ? state.attempts + 1 : 1;
  const nowIso = now.toISOString();

  try {
    await syncSundayEventToKv(kv, apiKey, now, fetchImpl, {
      ...options,
      throwOnDetailError: true,
    });
    await writeSyncState(kv, {
      dateKst: todayKst,
      status: 'success',
      attempts,
      lastAttemptAt: nowIso,
      lastSuccessAt: nowIso,
      lastError: null,
    });
    console.log(
      JSON.stringify({
        message: 'scheduled_sync_succeeded',
        dateKst: todayKst,
        attempts,
      })
    );
    return { action: 'synced', attempts };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await writeSyncState(kv, {
      dateKst: todayKst,
      status: 'failed',
      attempts,
      lastAttemptAt: nowIso,
      lastSuccessAt: state?.lastSuccessAt ?? null,
      lastError: errorMessage,
    });
    console.error(
      JSON.stringify({
        message: 'scheduled_sync_failed',
        dateKst: todayKst,
        attempts,
        willRetry: attempts < MAX_ATTEMPTS_PER_DAY,
        error: errorMessage,
      })
    );
    return { action: 'failed', attempts };
  }
}
