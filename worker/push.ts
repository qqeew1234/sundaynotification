import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { SundayEventNotice } from './nexon.ts';

export const PUSH_SUB_PREFIX = 'push:sub:';
export const KV_LAST_NOTIFIED_KEY = 'sunday:push:last-notified:v1';
export const PUSH_SUB_TTL_SECONDS = 60 * 60 * 24 * 365;
export const BATCH_SIZE = 20;

const BASE64URL_RE = /^[A-Za-z0-9_-]{16,200}$/;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface StoredPushSubscription extends PushSubscriptionInput {
  createdAt: string;
  updatedAt: string;
}

export interface LastNotifiedState {
  noticeId: number;
  imageUrl: string;
  notifiedAt: string;
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface PushKvStore {
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>;
}

export interface PushDispatchResult {
  action:
    | 'dispatched'
    | 'skipped_no_image'
    | 'skipped_unconfigured'
    | 'skipped_already_notified';
  sent: number;
  failed: number;
  removed: number;
}

export function isValidPushEndpoint(rawUrl: string): string | null {
  if (rawUrl.length === 0 || rawUrl.length > 2048) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '[::1]' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validatePushSubscription(body: unknown): PushSubscriptionInput | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.endpoint !== 'string') return null;
  const endpoint = isValidPushEndpoint(record.endpoint.trim());
  if (!endpoint) return null;

  const keys = record.keys;
  if (!keys || typeof keys !== 'object') return null;
  const keysRecord = keys as Record<string, unknown>;
  if (typeof keysRecord.p256dh !== 'string' || typeof keysRecord.auth !== 'string') {
    return null;
  }
  const p256dh = keysRecord.p256dh.trim();
  const auth = keysRecord.auth.trim();
  if (!BASE64URL_RE.test(p256dh) || !BASE64URL_RE.test(auth)) {
    return null;
  }

  return { endpoint, keys: { p256dh, auth } };
}

export async function hashEndpoint(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function saveSubscription(
  kv: PushKvStore,
  sub: PushSubscriptionInput,
  now: Date = new Date()
): Promise<string> {
  const key = `${PUSH_SUB_PREFIX}${await hashEndpoint(sub.endpoint)}`;
  const existing = await kv.get<StoredPushSubscription>(key, 'json');
  const nowIso = now.toISOString();
  const record: StoredPushSubscription = {
    endpoint: sub.endpoint,
    keys: sub.keys,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  await kv.put(key, JSON.stringify(record), { expirationTtl: PUSH_SUB_TTL_SECONDS });
  return key;
}

export async function deleteSubscription(kv: PushKvStore, endpoint: string): Promise<void> {
  const key = `${PUSH_SUB_PREFIX}${await hashEndpoint(endpoint)}`;
  await kv.delete(key);
}

export async function listAllSubscriptionKeys(kv: PushKvStore): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix: PUSH_SUB_PREFIX, cursor });
    for (const entry of res.keys) {
      keys.push(entry.name);
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return keys;
}

export async function notifySubscribersIfNewImage(
  kv: PushKvStore,
  vapid: VapidConfig | null,
  notice: SundayEventNotice | null,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<PushDispatchResult> {
  if (!notice || !notice.imageUrl) {
    return { action: 'skipped_no_image', sent: 0, failed: 0, removed: 0 };
  }

  if (!vapid) {
    console.warn(JSON.stringify({ message: 'push_skipped_unconfigured' }));
    return { action: 'skipped_unconfigured', sent: 0, failed: 0, removed: 0 };
  }

  const last = await kv.get<LastNotifiedState>(KV_LAST_NOTIFIED_KEY, 'json');
  if (last?.noticeId === notice.noticeId && last.imageUrl === notice.imageUrl) {
    return { action: 'skipped_already_notified', sent: 0, failed: 0, removed: 0 };
  }

  const keys = await listAllSubscriptionKeys(kv);
  const payloadData = {
    title: '일요일 요정 · 썬데이 메이플',
    body: notice.title,
    image: notice.imageUrl,
    icon: 'https://sundaynotification.yunyun.page/favicon.png',
    badge: 'https://sundaynotification.yunyun.page/favicon.png',
    url: 'https://sundaynotification.yunyun.page/',
    noticeUrl: notice.url,
    tag: `sunday-maple-${notice.noticeId}`,
  };

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (key) => {
        const sub = await kv.get<StoredPushSubscription>(key, 'json');
        if (!sub) return;
        try {
          const built = await buildPushPayload(
            {
              data: payloadData,
              options: {
                ttl: 60 * 60 * 12,
                urgency: 'high',
                topic: `sunday-${notice.noticeId}`,
              },
            },
            {
              endpoint: sub.endpoint,
              expirationTime: null,
              keys: sub.keys,
            },
            vapid
          );

          const res = await fetchImpl(sub.endpoint, {
            method: built.method,
            headers: built.headers,
            body: built.body,
          });

          if (res.status === 404 || res.status === 410) {
            await kv.delete(key);
            removed++;
          } else if (res.ok) {
            sent++;
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
          console.error(
            JSON.stringify({
              message: 'push_send_error',
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
      })
    );
  }

  if (keys.length === 0 || sent > 0 || (failed === 0 && removed > 0)) {
    const state: LastNotifiedState = {
      noticeId: notice.noticeId,
      imageUrl: notice.imageUrl,
      notifiedAt: now.toISOString(),
    };
    await kv.put(KV_LAST_NOTIFIED_KEY, JSON.stringify(state), {
      expirationTtl: PUSH_SUB_TTL_SECONDS,
    });
  }

  console.log(
    JSON.stringify({
      message: 'push_dispatch_completed',
      noticeId: notice.noticeId,
      totalSubscribers: keys.length,
      sent,
      failed,
      removed,
    })
  );

  return { action: 'dispatched', sent, failed, removed };
}
