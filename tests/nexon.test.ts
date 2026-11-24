import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchSundayEvent,
  filterSundayEvents,
  formatKstDateTime,
  getKstDateString,
  pickLatestSundayEvent,
  sanitizeNoticeHtml,
  sanitizeUrl,
  shouldShowShowcase,
} from '../worker/nexon.ts';
import type { EventNotice } from '../worker/nexon.ts';
import { KV_CACHE_KEY, runScheduledSync, toApiResponse } from '../worker/sync.ts';
import type { CachedSundayEvent, KvStore } from '../worker/sync.ts';

const now = new Date('2026-05-25T01:00:00+09:00');
const day = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(now.getTime() + offset).toISOString();

function notice(id: number, title: string, startOffset: number, endOffset: number): EventNotice {
  return {
    title,
    url: `https://example.com/${id}`,
    notice_id: id,
    date: iso(startOffset),
    date_event_start: iso(startOffset),
    date_event_end: iso(endOffset),
  };
}

function createMockKv(initial: Record<string, unknown> = {}): KvStore {
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
  };
}

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

test('URL 프로토콜 검증', () => {
  assert.equal(sanitizeUrl('https://maplestory.nexon.com/News/Event/1'), 'https://maplestory.nexon.com/News/Event/1');
  assert.equal(sanitizeUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
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

test('fetchSundayEvent: 진행 중 이벤트 + 상세', async () => {
  const calls: string[] = [];
  const mock = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.equal((init?.headers as Record<string, string>)['x-nxopen-api-key'], 'k');
    if (url.includes('/detail')) {
      return Response.json({ contents: '<p>본문</p>' });
    }
    return Response.json({ event_notice: notices });
  }) as typeof fetch;

  const result = await fetchSundayEvent('k', now, mock);
  assert.equal(result.status, 'ok');
  assert.equal(result.notice?.contentsHtml, '<p>본문</p>');
  assert.equal(result.notice?.url, 'https://example.com/2');
  assert.ok(calls[1]?.includes('notice_id=2'));
});

test('fetchSundayEvent: 이벤트 없음', async () => {
  const mock = (async () => Response.json({ event_notice: [] })) as typeof fetch;
  const result = await fetchSundayEvent('k', now, mock);
  assert.equal(result.notice, null);
});

test('toApiResponse: 만료된 캐시 공지 자동 숨김', () => {
  const cached: CachedSundayEvent = {
    fetchedAt: '2026-05-24T01:00:00.000Z',
    notice: {
      title: '[썬데이 메이플]',
      url: 'https://example.com/2',
      startAt: '2026-05-24 00:00',
      endAt: '2026-05-25 00:00',
      dateEventEnd: '2026-05-25T00:00:00+09:00',
      contentsHtml: '<p>내용</p>',
    },
  };
  assert.ok(toApiResponse(cached, new Date('2026-05-24T23:59:59+09:00')).notice !== null);
  assert.equal(toApiResponse(cached, new Date('2026-05-25T00:00:00+09:00')).notice, null);
});

test('runScheduledSync: 10:00 KST 성공 시 10:01 재시도 생략', async () => {
  const kv = createMockKv();
  let fetchCount = 0;
  const okFetch = (async () => {
    fetchCount++;
    return Response.json({ event_notice: [] });
  }) as typeof fetch;

  const r1 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:00:00+09:00'), okFetch);
  const r2 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:01:00+09:00'), okFetch);

  assert.deepEqual(r1, { action: 'synced', attempts: 1 });
  assert.deepEqual(r2, { action: 'skipped_success', attempts: 1 });
  assert.equal(fetchCount, 1);
  assert.ok((await kv.get<CachedSundayEvent>(KV_CACHE_KEY, 'json')) !== null);
});

test('runScheduledSync: 실패 시 기존 캐시 유지 및 1분 간격 재시도 후 성공', async () => {
  const previousCache: CachedSundayEvent = {
    fetchedAt: '2026-05-24T01:00:00.000Z',
    notice: null,
  };
  const kv = createMockKv({ [KV_CACHE_KEY]: previousCache });
  let shouldFail = true;
  const flakyFetch = (async () => {
    if (shouldFail) return new Response('err', { status: 500 });
    return Response.json({ event_notice: [] });
  }) as typeof fetch;

  const r1 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:00:00+09:00'), flakyFetch);
  assert.deepEqual(r1, { action: 'failed', attempts: 1 });
  assert.equal((await kv.get<CachedSundayEvent>(KV_CACHE_KEY, 'json'))?.fetchedAt, previousCache.fetchedAt);

  shouldFail = false;
  const r2 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:01:00+09:00'), flakyFetch);
  const r3 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:02:00+09:00'), flakyFetch);
  assert.deepEqual(r2, { action: 'synced', attempts: 2 });
  assert.deepEqual(r3, { action: 'skipped_success', attempts: 2 });
});

test('runScheduledSync: 하루 4회(최초+재시도 3회) 소진 후 중단 및 다음날 초기화', async () => {
  const kv = createMockKv();
  const failFetch = (async () => new Response('err', { status: 500 })) as typeof fetch;

  for (let i = 0; i < 4; i++) {
    const res = await runScheduledSync(
      kv,
      'k',
      new Date(`2026-05-25T10:0${i}:00+09:00`),
      failFetch
    );
    assert.deepEqual(res, { action: 'failed', attempts: i + 1 });
  }

  const r5 = await runScheduledSync(kv, 'k', new Date('2026-05-25T10:04:00+09:00'), failFetch);
  assert.deepEqual(r5, { action: 'skipped_exhausted', attempts: 4 });

  const okFetch = (async () => Response.json({ event_notice: [] })) as typeof fetch;
  const nextDay = await runScheduledSync(kv, 'k', new Date('2026-05-26T10:00:00+09:00'), okFetch);
  assert.deepEqual(nextDay, { action: 'synced', attempts: 1 });
});
