const API_BASE = 'https://open.api.nexon.com/maplestory/v1';
const SHOWCASE_LIMIT = Date.parse('2026-06-14T00:00:00+09:00');
const DETAIL_FALLBACK = '상세 내용을 불러올 수 없습니다.';

export interface EventNotice {
  title: string;
  url: string;
  thumbnail_url?: string;
  notice_id: number;
  date: string;
  date_event_start: string;
  date_event_end: string;
}

export interface EventNoticeResponse {
  event_notice?: EventNotice[];
}

export interface EventDetailResponse {
  title?: string;
  contents?: string;
}

export interface ShowcaseInfo {
  title: string;
  dateText: string;
}

export interface SundayEventNotice {
  title: string;
  url: string;
  startAt: string;
  endAt: string;
  contentsHtml: string;
}

export interface SundayEventApiResponse {
  status: 'ok' | 'unconfigured' | 'error';
  notice: SundayEventNotice | null;
  showShowcase: boolean;
  showcase: ShowcaseInfo;
  fetchedAt: string;
  error?: string;
}

export const SHOWCASE_INFO: ShowcaseInfo = {
  title: "[2026 SUMMER SHOWCASE 'OVERDRIVE']",
  dateText: '일시: 2026년 6월 13일 (토) 오후 4시',
};

export function filterSundayEvents(notices: EventNotice[], now: Date): EventNotice[] {
  return notices.filter(
    (n) =>
      (n.title.includes('썬데이') || n.title.includes('일요일')) &&
      Date.parse(n.date_event_end) > now.getTime()
  );
}

export function pickLatestSundayEvent(notices: EventNotice[], now: Date): EventNotice | null {
  let latest: EventNotice | null = null;
  for (const n of filterSundayEvents(notices, now)) {
    if (!latest || Date.parse(n.date_event_start) > Date.parse(latest.date_event_start)) {
      latest = n;
    }
  }
  return latest;
}

export function formatKstDateTime(iso: string): string {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

export function shouldShowShowcase(now: Date): boolean {
  return now.getTime() < SHOWCASE_LIMIT;
}

export function sanitizeNoticeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript:|data:text\/html)[^"']*\2/gi, '$1=$2#$2');
}

async function getJson<T>(fetchImpl: typeof fetch, url: string, apiKey: string): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'x-nxopen-api-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`Nexon API responded ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchSundayEvent(
  apiKey: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<SundayEventApiResponse> {
  const list = await getJson<EventNoticeResponse>(fetchImpl, `${API_BASE}/notice-event`, apiKey);
  const latest = pickLatestSundayEvent(list.event_notice ?? [], now);

  let notice: SundayEventNotice | null = null;
  if (latest) {
    let contents = DETAIL_FALLBACK;
    try {
      const detail = await getJson<EventDetailResponse>(
        fetchImpl,
        `${API_BASE}/notice-event/detail?notice_id=${latest.notice_id}`,
        apiKey
      );
      if (detail.contents) contents = sanitizeNoticeHtml(detail.contents);
    } catch (err) {
      console.error(
        JSON.stringify({
          message: 'nexon_detail_error',
          noticeId: latest.notice_id,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    notice = {
      title: latest.title,
      url: latest.url,
      startAt: formatKstDateTime(latest.date_event_start),
      endAt: formatKstDateTime(latest.date_event_end),
      contentsHtml: contents,
    };
  }

  return {
    status: 'ok',
    notice,
    showShowcase: shouldShowShowcase(now),
    showcase: SHOWCASE_INFO,
    fetchedAt: now.toISOString(),
  };
}
