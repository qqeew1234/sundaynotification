# 일요일 요정 (sundaynotification)

메이플스토리 이벤트 공지 중 `썬데이` / `일요일` 키워드가 포함된 진행 중 최신 이벤트를 보여주는 페이지입니다.
Cloudflare Workers (정적 자산 + API) 위에서 동작하는 Vite + React + TypeScript 앱입니다.

## 구조

```text
worker/        Cloudflare Worker (/api/sunday-event, /api/health) + Nexon API 로직
src/           React UI (Glass UI 디자인: real-derm-finder 토큰 기반)
tests/         node:test 단위 테스트
public/        favicon, _headers
wrangler.jsonc Workers 설정
```

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

## 기능

- Nexon Open API 이벤트 공지 조회 및 `썬데이`/`일요일` 필터링 (종료된 이벤트 제외)
- 5분 엣지 캐시, 새로고침 버튼으로 강제 갱신
- 라이트/다크 테마 (수동 토글 + 시스템 설정)
- 좌측 상단 버섯 아이콘 숨겨진 메시지
- 2026 SUMMER SHOWCASE 배너 (2026-06-14 00:00 KST 이전까지)
