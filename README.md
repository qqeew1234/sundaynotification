# 일요일 요정 (sundaynotification)

메이플스토리 이벤트 공지 중 `썬데이` / `일요일` 키워드가 포함된 진행 중 최신 이벤트를 보여주는 페이지입니다.
Cloudflare Workers (정적 자산 + API + Cron + KV) 위에서 동작하는 Vite + React + TypeScript 앱입니다.

## 구조

```text
worker/        Cloudflare Worker (/api/sunday-event, /api/health, scheduled) + KV 동기화
src/           React UI (Glass UI 디자인: real-derm-finder 토큰 기반, DOMPurify 방어)
tests/         node:test 단위 테스트
public/        favicon, theme-init.js, _headers
wrangler.jsonc Workers, KV, Cron 설정
```

## 자동 동기화 및 캐시 구조

- **스케줄**: 매일 **오전 10:00 (KST, UTC 01:00)**에 Worker Cron이 Nexon Open API를 조회해 `SUNDAY_KV`에 저장합니다.
- **재시도**: 실패 시 **1분 간격으로 최대 3회 재시도**(10:01, 10:02, 10:03 KST)하며, 실패해도 기존 정상 캐시는 유지됩니다.
- **일반 요청**: `/api/sunday-event`는 외부 API를 직접 호출하지 않고 `SUNDAY_KV` 캐시를 즉시 반환합니다(만료된 이벤트는 응답 시 자동 제외).

## 로컬 실행

```bash
npm install
cp .dev.vars.example .dev.vars   # NEXON_API_KEY 입력 (git에 올라가지 않음)
npm run dev
```

## 시크릿 설정 (운영)

API 키는 코드에 두지 않고 Cloudflare 시크릿으로만 관리합니다.

```bash
npx wrangler login
npx wrangler secret put NEXON_API_KEY
```

## 검증 / 배포

```bash
npm run typecheck
npm test
npm run build
npm run deploy
```

## 보안 & 기능

- 엄격한 CSP(`script-src 'self'`), HSTS, 보안 헤더 및 서버+클라이언트(DOMPurify) 이중 HTML Sanitize
- `workers.dev` 및 Preview URL 비활성화, 커스텀 도메인 전용 운영
- 라이트/다크 테마 (수동 토글 + 시스템 설정)
- 좌측 상단 버섯 아이콘 숨겨진 메시지
- 2026 SUMMER SHOWCASE 배너 (2026-06-14 00:00 KST 이전까지)
