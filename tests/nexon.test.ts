import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractFirstImageUrl,
  fetchSundayEvent,
  filterSundayEvents,
  formatKstDateTime,
  getKstDateString,
  pickLatestSundayEvent,
  sanitizeNoticeHtml,
  sanitizeUrl,
  shouldShowShowcase,
} from '../worker/nexon.ts';
import type { EventNotice, SundayEventNotice } from '../worker/nexon.ts';
import {
  KV_LAST_NOTIFIED_KEY,
  PUSH_SUB_PREFIX,
  notifySubscribersIfNewImage,
  saveSubscription,
  validatePushSubscription,
} from '../worker/push.ts';
import type { PushKvStore, VapidConfig } from '../worker/push.ts';
import { KV_CACHE_KEY, runScheduledSync, toApiResponse } from '../worker/sync.ts';
import type { CachedSundayEvent } from '../worker/sync.ts';

const now = new Date('2026-05-25T01:00:00+09:00');
const day = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(now.getTime() + offset).toISOString();

function notice(id: number, title: string, startOffset: number, endOffset: number): EventNotice {
  return {
    title,
    url: `https://example.com/${id}`,
    thumbnail_url: `https://cdn.example.com/thumb-${id}.png`,
    notice_id: id,
    date: iso(startOffset),
    date_event_start: iso(startOffset),
    date_event_end: iso(endOffset),
  };
}

function createMockKv(initial: Record<string, unknown> = {}): PushKvStore {
  const map = new Map<string, string>(
    Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)])
  );
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = map.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async put(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = Array.from(map.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

async function generateTestVapid(): Promise<VapidConfig> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pubRaw = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return {
    subject: 'mailto:test@example.com',
    publicKey: pubRaw,
    privateKey: jwk.d ?? '',
  };
}

const sampleSub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example-token-123456',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

const notices = [
  notice(1, '[썬데이 메이플] 매주 일요일 특별한 혜택!', -2 * day, -60_000),
  notice(2, '[썬데이 메이플] 매주 일요일 특별한 혜택!', -day, day),
  notice(3, '일요일의 특별 혜택 이벤트', -2 * day, day),
  notice(4, '평일 메가 버닝 이벤트', -day, 5 * day),
];

test('썬데이/일요일 필터링과 만료 제외', () => {
  const filtered = filterSundayEvents(notices, now);
  assert.deepEqual(
    filtered.map((n) => n.notice_id).sort(),
    [2, 3]
  );
});

test('가장 최근 시작한 이벤트 선택', () => {
  assert.equal(pickLatestSundayEvent(notices, now)?.notice_id, 2);
  assert.equal(pickLatestSundayEvent([], now), null);
});

test('쇼케이스 노출 기준 (2026-06-14 00:00 KST)', () => {
  assert.equal(shouldShowShowcase(new Date('2026-06-13T14:59:59Z')), true);
  assert.equal(shouldShowShowcase(new Date('2026-06-13T15:00:00Z')), false);
});

test('KST 날짜/시간 포맷', () => {
  assert.equal(formatKstDateTime('2026-05-24T15:00:00+00:00'), '2026-05-25 00:00');
  assert.equal(formatKstDateTime('2026-05-24T10:00:00+09:00'), '2026-05-24 10:00');
  assert.equal(getKstDateString(new Date('2026-05-24T15:00:00Z')), '2026-05-25');
});

test('URL 프로토콜 검증 및 본문 이미지 추출', () => {
  assert.equal(sanitizeUrl('https://maplestory.nexon.com/News/Event/1'), 'https://maplestory.nexon.com/News/Event/1');
  assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(
    extractFirstImageUrl('<p>안내</p><img src="https://file.nexon.com/maple/sunday.png?a=1&amp;b=2" />'),
    'https://file.nexon.com/maple/sunday.png?a=1&b=2'
  );
  assert.equal(extractFirstImageUrl('<img src="javascript:alert(1)"><img src="https://cdn.nexon.com/ok.png">'), 'https://cdn.nexon.com/ok.png');
  assert.equal(extractFirstImageUrl('<p>텍스트만 있음</p>'), '');
});

test('강화된 HTML sanitize', () => {
  const out = sanitizeNoticeHtml(
    '<p>hi</p><script>alert(1)</script><svg onload=alert(1)></svg><base href="https://evil.test"><img src="https://a/b.png" onerror="x()"><iframe srcdoc="<script>1</script>"></iframe><a href=javascript:alert(1)>l</a>'
  );
  assert.ok(out.includes('<p>hi</p>'));
  assert.ok(out.includes('<img src="https://a/b.png"'));
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('<svg'));
  assert.ok(!out.includes('<base'));
  assert.ok(!out.includes('<iframe'));
  assert.ok(!out.includes('onerror'));
  assert.ok(!out.includes('onload'));
  assert.ok(!out.includes('javascript:'));
});

test('fetchSundayEvent: 본문 이미지 추출 및 썸네일 폴백', async () => {
  const mock = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.equal((init?.headers as Record<string, string>)['x-nxopen-api-key'], 'k');
    if (url.includes('/detail')) {
      return Response.json({ contents: '<p>본문</p><img src="https://cdn.example.com/detail-2.png">' });
    }
    return Response.json({ event_notice: notices });
  }) as typeof fetch;

  const result = await fetchSundayEvent('k', now, mock);
  assert.equal(result.status, 'ok');
  assert.equal(result.notice?.noticeId, 2);
  assert.equal(result.notice?.imageUrl, 'https://cdn.example.com/detail-2.png');

  const fallbackMock = (async (input: string | URL | Request) => {
    if (String(input).includes('/detail')) {
      return Response.json({ contents: '<p>이미지 없는 본문</p>' });
    }
    return Response.json({ event_notice: notices });
  }) as typeof fetch;

  const fallbackRes = await fetchSundayEvent('k', now, fallbackMock);
  assert.equal(fallbackRes.notice?.imageUrl, 'https://cdn.example.com/thumb-2.png');
});

test('toApiResponse: 만료된 캐시 공지 자동 숨김', () => {
  const cached: CachedSundayEvent = {
    fetchedAt: '2026-05-24T01:00:00.000Z',
    notice: {
      noticeId: 2,
      title: '[썬데이 메이플]',
      url: 'https://example.com/2',
      imageUrl: 'https://cdn.example.com/2.png',
      startAt: '2026-05-24 00:00',
      endAt: '2026-05-25 00:00',
      dateEventEnd: '2026-05-25T00:00:00+09:00',
      contentsHtml: '<p>내용</p>',
    },
  };
  assert.ok(toApiResponse(cached, new Date('2026-05-24T23:59:59+09:00')).notice !== null);
  assert.equal(toApiResponse(cached, new Date('2026-05-25T00:00:00+09:00')).notice, null);
});

test('validatePushSubscription 검증', () => {
  assert.ok(validatePushSubscription(sampleSub) !== null);
  assert.equal(validatePushSubscription({ ...sampleSub, endpoint: 'http://insecure.example/push' }), null);
  assert.equal(validatePushSubscription({ ...sampleSub, endpoint: 'https://localhost/push' }), null);
  assert.equal(validatePushSubscription({ endpoint: sampleSub.endpoint, keys: { p256dh: 'bad', auth: 'bad' } }), null);
});

test('notifySubscribersIfNewImage: 암호화 푸시 발송, 중복 방지 및 410 만료 구독 정리', async () => {
  const kv = createMockKv();
  const vapid = await generateTestVapid();
  await saveSubscription(kv, sampleSub, now);
  await saveSubscription(
    kv,
    { ...sampleSub, endpoint: 'https://fcm.googleapis.com/fcm/send/gone-token-123456' },
    now
  );

  const sentRequests: Array<{ url: string; headers: Headers; bodyLen: number }> = [];
  const pushFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const bodyBytes = init?.body as Uint8Array;
    sentRequests.push({
      url,
      headers: new Headers(init?.headers),
      bodyLen: bodyBytes.byteLength,
    });
    if (url.includes('gone-token')) return new Response(null, { status: 410 });
    return new Response(null, { status: 201 });
  }) as typeof fetch;

  const activeNotice: SundayEventNotice = {
    noticeId: 2,
    title: '[썬데이 메이플] 테스트',
    url: 'https://example.com/2',
    imageUrl: 'https://cdn.example.com/sunday-2.png',
    startAt: '2026-05-24 00:00',
    endAt: '2026-05-26 00:00',
    dateEventEnd: '2026-05-26T00:00:00+09:00',
    contentsHtml: '<img src="https://cdn.example.com/sunday-2.png">',
  };

  const r1 = await notifySubscribersIfNewImage(kv, vapid, activeNotice, now, pushFetch);
  assert.deepEqual(r1, { action: 'dispatched', sent: 1, failed: 0, removed: 1 });
  assert.equal(sentRequests.length, 2);
  assert.equal(sentRequests[0]?.headers.get('content-encoding'), 'aes128gcm');
  assert.ok(sentRequests[0]?.headers.get('authorization')?.startsWith('vapid '));
  assert.ok((sentRequests[0]?.bodyLen ?? 0) > 0);

  // 만료(410) 구독 삭제 확인
  const remaining = await kv.list({ prefix: PUSH_SUB_PREFIX });
  assert.equal(remaining.keys.length, 1);

  // 동일 공지+이미지 중복 발송 차단 확인
  const r2 = await notifySubscribersIfNewImage(kv, vapid, activeNotice, now, pushFetch);
  assert.deepEqual(r2, { action: 'skipped_already_notified', sent: 0, failed: 0, removed: 0 });
  assert.ok((await kv.get(KV_LAST_NOTIFIED_KEY, 'json')) !== null);
});

test('runScheduledSync: 상세 이미지 조회 실패 시 1분 후 재시도 후 즉시 푸시 발송', async () => {
  const kv = createMockKv();
  const vapid = await generateTestVapid();
  await saveSubscription(kv, sampleSub, now);

  let detailAttempt = 0;
  let pushCalls = 0;

  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('open.api.nexon.com')) {
      if (url.includes('/detail')) {
        detailAttempt++;
        if (detailAttempt === 1) return new Response('err', { status: 500 });
        return Response.json({ contents: '<img src="https://cdn.example.com/sunday-live.png">' });
      }
      return Response.json({ event_notice: notices });
    }
    pushCalls++;
    return new Response(null, { status: 201 });
  }) as typeof fetch;

  const r1 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:00:00+09:00'), mockFetch, { vapid });
  assert.deepEqual(r1, { action: 'failed', attempts: 1 });
  assert.equal(pushCalls, 0);

  const r2 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:01:00+09:00'), mockFetch, { vapid });
  assert.deepEqual(r2, { action: 'synced', attempts: 2 });
  assert.equal(pushCalls, 1);
  assert.equal((await kv.get<CachedSundayEvent>(KV_CACHE_KEY, 'json'))?.notice?.imageUrl, 'https://cdn.example.com/sunday-live.png');
});

test('runScheduledSync: 10:00 KST 성공 시 10:01 재시도 생략 & 4회 실패 후 중단', async () => {
  const kv = createMockKv();
  const okFetch = (async () => Response.json({ event_notice: [] })) as typeof fetch;

  assert.deepEqual(
    await runScheduledSync(kv, 'k', new Date('2026-05-25T10:00:00+09:00'), okFetch),
    { action: 'synced', attempts: 1 }
  );
  assert.deepEqual(
    await runScheduledSync(kv, 'k', new Date('2026-05-25T10:01:00+09:00'), okFetch),
    { action: 'skipped_success', attempts: 1 }
  );

  const kvFail = createMockKv();
  const failFetch = (async () => new Response('err', { status: 500 })) as typeof fetch;
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(
      await runScheduledSync(kvFail, 'k', new Date(`2026-05-25T10:0${i}:00+09:00`), failFetch),
      { action: 'failed', attempts: i + 1 }
    );
  }
  assert.deepEqual(
    await runScheduledSync(kvFail, 'k', new Date('2026-05-25T10:04:00+09:00'), failFetch),
    { action: 'skipped_exhausted', attempts: 4 }
  );
});
