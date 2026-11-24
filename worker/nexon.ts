const API_BASE = 'https://open.api.nexon.com/maplestory/v1';
const SHOWCASE_LIMIT = Date.parse('2026-06-14T00:00:00+09:00');
const DETAIL_FALLBACK = '상세 내용을 불러올 수 없습니다.';
const FETCH_TIMEOUT_MS = 15_000;

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
  noticeId: number;
  title: string;
  url: string;
  imageUrl: string;
  startAt: string;
  endAt: string;
  dateEventEnd: string;
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

export function getKstDateString(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
}

export function shouldShowShowcase(now: Date): boolean {
  return now.getTime() < SHOWCASE_LIMIT;
}

export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // invalid URL
  }
  return '';
}

export function extractFirstImageUrl(html: string): string {
  const imgRegex = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const rawSrc = (match[1] ?? match[2] ?? match[3] ?? '').replace(/&amp;/gi, '&');
    const safe = sanitizeUrl(rawSrc);
    if (safe) return safe;
  }
  return '';
}

function isDangerousUriScheme(raw: string): boolean {
  const normalized = raw.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:image/svg+xml')
  );
}

export function sanitizeNoticeHtml(html: string): string {
  return html
    .replace(
      /<(script|style|iframe|object|embed|form|svg|math|template|noscript|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      ''
    )
    .replace(
      /<\/?(script|style|iframe|object|embed|form|svg|math|template|noscript|applet|base|meta|link|input|button|textarea|select)\b[^>]*>/gi,
      ''
    )
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\b(href|src|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_match, attr: string, dq: string | undefined, sq: string | undefined, uq: string | undefined) => {
        const val = dq ?? sq ?? uq ?? '';
        if (isDangerousUriScheme(val)) {
          return `${attr}="#"`;
        }
        if (dq !== undefined) return `${attr}="${dq}"`;
        if (sq !== undefined) return `${attr}='${sq}'`;
        return `${attr}=${val}`;
      }
    );
}

async function getJson<T>(fetchImpl: typeof fetch, url: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'x-nxopen-api-key': apiKey },
    });
    if (!res.ok) {
      throw new Error(`Nexon API responded ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSundayEvent(
  apiKey: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  throwOnDetailError: boolean = false
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
      if (throwOnDetailError) {
        throw err;
      }
    }
    const imageUrl = extractFirstImageUrl(contents) || sanitizeUrl(latest.thumbnail_url ?? '');
    notice = {
      noticeId: latest.notice_id,
      title: latest.title,
      url: sanitizeUrl(latest.url),
      imageUrl,
      startAt: formatKstDateTime(latest.date_event_start),
      endAt: formatKstDateTime(latest.date_event_end),
      dateEventEnd: latest.date_event_end,
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
