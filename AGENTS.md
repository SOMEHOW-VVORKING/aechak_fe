# AGENTS.md — aechak Frontend Monorepo

AI 에이전트(Codex, Claude 등)가 이 리포에서 작업할 때 반드시 따라야 할 상시 규칙.

## 디자인 시스템 컴포넌트 API

컴포넌트 사용 전 반드시 아래 문서를 참조할 것. prop 이름·타입 오류 방지.

- 웹: [@docs/design-system/web-components.md](docs/design-system/web-components.md)
- 네이티브: [@docs/design-system/native-components.md](docs/design-system/native-components.md)

---

## 리포 구조

```
apps/
  web-seller/   셀러 어드민 (Vite + React 19 + TanStack Router, localhost:5173)
  web-admin/    플랫폼 어드민 (Vite + React 19 + TanStack Router, localhost:5174)
  mobile/       앱 (Expo 53 + React Native + Expo Router)

packages/
  config/
    eslint/       공유 ESLint (typescript-eslint 기반)
    tsconfig/     공유 TypeScript (base / react / react-native)
    prettier/     공유 Prettier
    tailwind/     공유 Tailwind preset
  design-system/  디자인 토큰 단일 원본 → web CSS vars + Tailwind theme, native theme object
  domain/         순수 도메인 타입·로직 (UI 의존성 금지)
  api/            Orval 생성 API 클라이언트 + axios 인스턴스
```

---

## 핵심 규칙 (반드시 준수)

### 1. Feature 경계 — 가장 중요

- `src/features/<domain>/` 코드는 다른 feature를 직접 import 금지
- 공유가 필요하면 `src/shared/` 또는 `packages/`로 승격
- **위반 시 ESLint 빌드 에러** (`eslint-plugin-boundaries`)

```
✅ features/order/Order.tsx → import from 'src/shared/Button'
✅ features/order/Order.tsx → import from '@aechak/domain'
❌ features/order/Order.tsx → import from 'src/features/auth/useAuth'
```

### 2. packages/domain 순수성

`packages/domain/` 내부에서 다음 import 금지:
- React, React Native, React DOM
- @tanstack/react-query, zustand
- axios, @aechak/api
- 모든 UI 컴포넌트 라이브러리

오직 TypeScript 타입과 순수 함수만 허용.

### 3. packages/api 생성물 직접 수정 금지

`packages/api/src/generated/` 파일은 `pnpm openapi:generate`로만 갱신.  
OpenAPI 스펙 변경 후 반드시 `pnpm openapi:generate` 실행.

### 4. 상태 관리 계층 선택

| 상태 종류 | 도구 | 파일 위치 |
|---|---|---|
| API 데이터, 캐시, refetch, optimistic update | TanStack Query | `feature/xxx.queries.ts` |
| 모달/탭/사이드바 등 전역 UI 상태 | Zustand | `feature/xxx.store.ts` |
| 컴포넌트 내부 폼·토글 등 | useState/useReducer | 컴포넌트 내부 |

**API 응답을 Zustand에 저장하지 말 것.** TanStack Query 캐시가 서버 상태를 담당.

### 5. 테스트 컨벤션 (AC 기반)

1. 구현을 먼저 보고 테스트를 역산하지 말 것
2. 테스트명에 AC ID 포함: `[AC-AUTH-001] 이메일 입력 시 ...`
3. RTL/RNTL: `role`, `label`, `text` 기반 쿼리 사용. `className`, `id`, `testId` 기반 쿼리 지양
4. 단위 테스트 → 컴포넌트 테스트 → E2E 순서로 작성 및 검증

### 6. 새 Feature 추가 시 체크리스트

```
apps/<app>/src/features/<domain>/
  index.ts          ← public API (named exports만)
  <domain>.queries.ts  ← TanStack Query hooks
  <domain>.store.ts    ← Zustand (UI 상태만, 선택)
  components/
  __tests__/
```

feature 추가 후: `pnpm typecheck && pnpm lint` 반드시 통과 확인.

---

## 커밋 메시지 규칙

### 형식

```
[SCRUM-XX] <type>: <한글 설명>

- 변경 bullet 1
- 변경 bullet 2
```

### type 목록

| type | 사용 시점 |
|---|---|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `chore` | 빌드·설정·의존성 등 프로덕션 코드 변경 없는 작업 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서만 변경 |
| `style` | 포맷·공백 등 코드 의미 변경 없는 수정 |

### 규칙

- Jira 티켓 번호는 `[SCRUM-XX]` 형식으로 제목 앞에 붙임
- 제목은 한글 서술형, 50자 이내
- 본문 bullet은 파일/기능 단위로 간결하게 작성

### 예시

```
[SCRUM-65] chore: 프론트엔드 모노레포 초기 구조 설계
[SCRUM-66] feat: 디자인 시스템 토큰·컴포넌트 구축 및 앱 통합
[SCRUM-67] fix: 주문 상태 필터 초기화 오류 수정
```

---

## PR 필수 게이트

```bash
pnpm typecheck             # TypeScript 오류 없음
pnpm lint                  # ESLint + boundaries 통과
pnpm test                  # 단위/컴포넌트 테스트 전체 통과
pnpm openapi:generate:check  # 생성 코드 ↔ OpenAPI 스펙 동기화 확인
```

모든 게이트 통과 후 PR 제출.

---

## 개발 명령어

```bash
# 개별 앱 실행
pnpm --filter web-seller dev      # 셀러 어드민 (localhost:5173)
pnpm --filter web-admin dev       # 플랫폼 어드민 (localhost:5174)
pnpm --filter mobile start        # Expo Metro 번들러

# 전체 빌드·검증 (Turborepo)
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# API 코드 생성
cd packages/api && pnpm openapi:generate

# 라우트 추가 후 (web-seller / web-admin)
# vite dev 서버가 실행 중이면 자동 재생성.
# 실행 중이 아닐 때:
pnpm --filter web-seller generate-routes
pnpm --filter web-admin generate-routes
# routeTree.gen.ts 는 커밋 대상 (CI typecheck 위해)
```

---

## 디자인 시스템 수정 시

- 토큰 수정: `packages/design-system/src/tokens.ts`만 편집
- 웹 Tailwind 테마: `packages/design-system/src/web/tailwind-theme.ts`
- 모바일 RN 테마: `packages/design-system/src/native/theme.ts`
- `packages/config/tailwind/preset.js`는 공유 Tailwind 기본값 (토큰 미포함)

---

## 금지 사항 요약

| 금지 | 이유 |
|---|---|
| feature → feature 직접 import | 경계 위반, lint 에러 |
| domain에서 React/UI import | 순수성 파괴 |
| `packages/api/src/generated/` 직접 편집 | generate 시 덮어씌워짐 |
| API 응답을 Zustand에 저장 | TanStack Query와 중복, 캐시 무효화 문제 |
| `localStorage`에 accessToken 저장 | XSS 취약점 |
