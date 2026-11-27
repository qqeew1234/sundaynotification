import { SHOWCASE_INFO, shouldShowShowcase } from './nexon.ts';
import type { SundayEventApiResponse } from './nexon.ts';
import {
  deleteSubscription,
  isValidPushEndpoint,
  saveSubscription,
  validatePushSubscription,
} from './push.ts';
import type { VapidConfig } from './push.ts';
import {
  readCachedSundayEvent,
  runScheduledSync,
  syncSundayEventToKv,
  toApiResponse,
} from './sync.ts';

const PROD_ORIGIN = 'https://sundaynotification.yunyun.page';
const MAX_BODY_BYTES = 4096;

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://yunyun.page",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' https: data:",
  "connect-src 'self' https://yunyun.page",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP_POLICY);
  headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getVapidConfig(env: Env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function isAllowedOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  return origin === url.origin || origin === PROD_ORIGIN;
}

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return null;
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function emptyBody(
  status: SundayEventApiResponse['status'],
  error: string,
  now: Date
): SundayEventApiResponse {
  return {
    status,
    notice: null,
    showShowcase: shouldShowShowcase(now),
    showcase: SHOWCASE_INFO,
    fetchedAt: now.toISOString(),
    error,
  };
}

async function handleSundayEvent(env: Env): Promise<Response> {
  const now = new Date();
  const cached = await readCachedSundayEvent(env.SUNDAY_KV);
  if (cached) {
    return Response.json(toApiResponse(cached, now), {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'CDN-Cache-Control': 'public, max-age=60',
      },
    });
  }

  const apiKey = env.NEXON_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(emptyBody('unconfigured', 'NEXON_API_KEY 시크릿이 설정되지 않았습니다.', now), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const body = await syncSundayEventToKv(env.SUNDAY_KV, apiKey, now, fetch, {
      vapid: getVapidConfig(env),
    });
    return Response.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'CDN-Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        message: 'nexon_api_error',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return Response.json(
      emptyBody('error', '메이플스토리 이벤트 공지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', now),
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

async function handleSubscribe(request: Request, env: Env, url: URL): Promise<Response> {
  if (!isAllowedOrigin(request, url)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await readBoundedJson(request);
  const sub = validatePushSubscription(body);
  if (!sub) {
    return Response.json(
      { error: '유효하지 않은 푸시 구독 정보입니다.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  await saveSubscription(env.SUNDAY_KV, sub);
  return Response.json(
    { status: 'subscribed' },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function handleUnsubscribe(request: Request, env: Env, url: URL): Promise<Response> {
  if (!isAllowedOrigin(request, url)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await readBoundedJson(request);
  const rawEndpoint =
    body && typeof body === 'object' ? (body as Record<string, unknown>).endpoint : undefined;
  const endpoint = typeof rawEndpoint === 'string' ? isValidPushEndpoint(rawEndpoint.trim()) : null;
  if (!endpoint) {
    return Response.json(
      { error: '유효하지 않은 엔드포인트입니다.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  await deleteSubscription(env.SUNDAY_KV, endpoint);
  return Response.json(
    { status: 'unsubscribed' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith('/api/')) {
        if (request.method === 'GET' && path === '/api/health') {
          return withSecurityHeaders(
            Response.json(
              { status: 'ok', service: 'sundaynotification' },
              { headers: { 'Cache-Control': 'no-store' } }
            )
          );
        }
        if (request.method === 'GET' && path === '/api/sunday-event') {
          return withSecurityHeaders(await handleSundayEvent(env));
        }
        if (request.method === 'GET' && path === '/api/push/vapid-public-key') {
          const publicKey = env.VAPID_PUBLIC_KEY?.trim();
          if (!publicKey) {
            return withSecurityHeaders(
              Response.json(
                { error: 'VAPID_PUBLIC_KEY가 설정되지 않았습니다.' },
                { status: 503, headers: { 'Cache-Control': 'no-store' } }
              )
            );
          }
          return withSecurityHeaders(
            Response.json(
              { publicKey },
              { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' } }
            )
          );
        }
        if (request.method === 'POST' && path === '/api/push/subscribe') {
          return withSecurityHeaders(await handleSubscribe(request, env, url));
        }
        if (request.method === 'POST' && path === '/api/push/unsubscribe') {
          return withSecurityHeaders(await handleUnsubscribe(request, env, url));
        }
        return withSecurityHeaders(
          Response.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
        );
      }
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (err) {
      console.error(
        JSON.stringify({
          message: 'worker_unhandled_error',
          path,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return withSecurityHeaders(
        Response.json({ error: 'Internal server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
      );
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const apiKey = env.NEXON_API_KEY?.trim();
    if (!apiKey) {
      console.error(JSON.stringify({ message: 'scheduled_sync_missing_api_key' }));
      return;
    }
    ctx.waitUntil(
      runScheduledSync(env.SUNDAY_KV, apiKey, new Date(controller.scheduledTime), fetch, {
        vapid: getVapidConfig(env),
      })
    );
  },
} satisfies ExportedHandler<Env>;
