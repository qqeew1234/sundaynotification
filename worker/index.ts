import { SHOWCASE_INFO, fetchSundayEvent, shouldShowShowcase } from './nexon.ts';
import type { SundayEventApiResponse } from './nexon.ts';

const CACHE_KEY = 'https://cache.sundaynotification.internal/api/sunday-event';

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
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

async function handleSundayEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const now = new Date();
  const apiKey = env.NEXON_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(emptyBody('unconfigured', 'NEXON_API_KEY 시크릿이 설정되지 않았습니다.', now), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const cache = caches.default;
  const cacheKey = new Request(CACHE_KEY);

  if (!refresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const body = await fetchSundayEvent(apiKey, now);
    const response = Response.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith('/api/')) {
        if (request.method === 'GET' && path === '/api/health') {
          return withSecurityHeaders(
            Response.json({
              status: 'ok',
              service: 'sundaynotification',
              hasApiKey: Boolean(env.NEXON_API_KEY?.trim()),
            })
          );
        }
        if (request.method === 'GET' && path === '/api/sunday-event') {
          return withSecurityHeaders(await handleSundayEvent(request, env, ctx));
        }
        return withSecurityHeaders(Response.json({ error: 'Not found' }, { status: 404 }));
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
      return withSecurityHeaders(Response.json({ error: 'Internal server error' }, { status: 500 }));
    }
  },
} satisfies ExportedHandler<Env>;
