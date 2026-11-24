import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchSundayEvent,
  filterSundayEvents,
  formatKstDateTime,
  pickLatestSundayEvent,
  sanitizeNoticeHtml,
  shouldShowShowcase,
} from '../worker/nexon.ts';
import type { EventNotice } from '../worker/nexon.ts';

const now = new Date('2026-05-25T01:00:00+09:00');
const day = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(now.getTime() + offset).toISOString();

function notice(id: number, title: string, startOffset: number, endOffset: number): EventNotice {
  return {
    title,
    url: `http://example.com/${id}`,
    notice_id: id,
    date: iso(startOffset),
    date_event_start: iso(startOffset),
    date_event_end: iso(endOffset),
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
  assert.deepEqual(filtered.map((n) => n.notice_id).sort(), [2, 3]);
});

test('가장 최근 시작한 이벤트 선택', () => {
  assert.equal(pickLatestSundayEvent(notices, now)?.notice_id, 2);
  assert.equal(pickLatestSundayEvent([], now), null);
});

test('쇼케이스 노출 기준 (2026-06-14 00:00 KST)', () => {
  assert.equal(shouldShowShowcase(new Date('2026-06-13T14:59:59Z')), true);
  assert.equal(shouldShowShowcase(new Date('2026-06-13T15:00:00Z')), false);
});

test('KST 날짜 포맷', () => {
  assert.equal(formatKstDateTime('2026-05-24T15:00:00+00:00'), '2026-05-25 00:00');
  assert.equal(formatKstDateTime('2026-05-24T10:00:00+09:00'), '2026-05-24 10:00');
});

test('HTML sanitize', () => {
  const out = sanitizeNoticeHtml(
    '<p>hi</p><script>alert(1)</script><img src="https://a/b.png" onerror="x()"><a href="javascript:alert(1)">l</a>'
  );
  assert.ok(out.includes('<p>hi</p>'));
  assert.ok(out.includes('<img src="https://a/b.png"'));
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('onerror'));
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
  assert.ok(calls[1]?.includes('notice_id=2'));
});

test('fetchSundayEvent: 이벤트 없음', async () => {
  const mock = (async () => Response.json({ event_notice: [] })) as typeof fetch;
  const result = await fetchSundayEvent('k', now, mock);
  assert.equal(result.notice, null);
});
