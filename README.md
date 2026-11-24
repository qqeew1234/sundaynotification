# 일요일 요정 (sundaynotification)

메이플스토리 이벤트 공지 중 `썬데이` / `일요일` 키워드가 포함된 진행 중 최신 이벤트를 보여주는 페이지입니다.
Cloudflare Workers (정적 자산 + API + Cron + KV + Web Push) 위에서 동작하는 Vite + React + TypeScript 앱입니다.

## 구조

```text
worker/        Cloudflare Worker (/api/sunday-event, /api/push/*, scheduled) + KV/Web Push
src/           React UI (Glass UI 디자인, DOMPurify 방어, 푸시 알림 토글)
tests/         node:test 단위 테스트
public/        sw.js, manifest.webmanifest, favicon, theme-init.js, _headers
wrangler.jsonc Workers, KV, Cron, VAPID 공개 설정
```

## 자동 동기화 & Web Push 알림

- **스케줄**: 매일 **오전 10:00 (KST, UTC 01:00)**에 Worker Cron이 Nexon Open API를 조회해 `SUNDAY_KV`에 저장합니다.
- **재시도**: 공지 목록 또는 상세 이미지 조회 실패 시 **1분 간격으로 최대 3회 재시도**(10:01, 10:02, 10:03 KST)하며, 기존 정상 캐시는 유지됩니다.
- **즉시 푸시 발송**: 썬데이 메이플 공지와 이미지를 가져오는 즉시, 동일한 `(noticeId, imageUrl)` 조합에 대해 최초 1회만 RFC 8291 암호화 + VAPID 서명으로 구독자에게 알림(이벤트 이미지 포함)을 발송합니다. 만료(`404`/`410`)된 구독은 자동 정리됩니다.

## 로컬 실행

```bash
npm install
cp .dev.vars.example .dev.vars   # NEXON_API_KEY 및 VAPID 키 입력 (git에 올라가지 않음)
npm run dev
```

## 시크릿 설정 (운영)

API 키와 VAPID 개인키는 코드에 두지 않고 Cloudflare 시크릿으로만 관리합니다.

```bash
npx wrangler login
npx wrangler secret put NEXON_API_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

## 검증 / 배포

```bash
npm run cf:types
npm run typecheck
npm test
npm run build
npm run deploy
```
