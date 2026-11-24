import { SHOWCASE_INFO, shouldShowShowcase } from './nexon.ts';
import type { SundayEventApiResponse } from './nexon.ts';
import {
  readCachedSundayEvent,
  runScheduledSync,
  syncSundayEventToKv,
  toApiResponse,
} from './sync.ts';

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' https: data:",
  "connect-src 'self'",
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
    const body = await syncSundayEventToKv(env.SUNDAY_KV, apiKey, now);
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
    ctx.waitUntil(runScheduledSync(env.SUNDAY_KV, apiKey, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
