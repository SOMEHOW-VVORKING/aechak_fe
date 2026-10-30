# AGENTS.md — aechak Frontend Monorepo

AI 에이전트(Codex, Claude 등)가 이 리포에서 작업할 때 항상 따라야 할 **상시 규칙**이다. 이 파일은 매 세션 로드되므로 "모든 세션이 필요한 규칙 + 재사용 함정"만 담는다.

화면별 배치 구현 이력·리비전·결정 배경은 상시 로드하지 않는 별도 노트에 있다 — 특정 화면을 깊게 팔 때만 참고:

- [docs/web-buyer-notes.md](docs/web-buyer-notes.md) — web-buyer 화면별 이력
- [docs/web-seller-admin-notes.md](docs/web-seller-admin-notes.md) — web-seller/web-admin 이력 + 디자인시스템 함정 발견 서사 + 모바일 셋업
- [docs/deploy-env.md](docs/deploy-env.md) — 세 앱 × 두 환경의 `VITE_*` 값 표(Cloudflare 복사용) + 호스트 값 규칙

---

## 0. 리포 구조

```
apps/
  web-seller/   셀러 어드민 (Vite + React 19 + TanStack Router, localhost:5173)
  web-admin/    플랫폼 어드민 (Vite + React 19 + TanStack Router, localhost:5174)
  web-buyer/    구매자 웹앱 (Vite + React 19 + TanStack Router, localhost:5175, WebView-first)
  mobile/       Expo 53 + React Native (온보딩 3종은 web-buyer로 대체됨/superseded)

packages/
  config/         공유 eslint / tsconfig(base·react·react-native) / prettier / tailwind preset
  design-system/  디자인 토큰 단일 원본 → web CSS vars + Tailwind theme, native theme object
  domain/         순수 도메인 타입·로직 (UI 의존성 금지)
  api/            Orval 생성 API 클라이언트 + axios 인스턴스(호스트 분기 포함)
```

백엔드도 실행 모듈이 셋이라 호스트가 갈린다 — 로컬 기준 api 8080 / seller 8081 / admin 8082이고,
dev는 `api-dev` · `seller-api-dev` · `admin-api-dev`.aechak.co.kr이다. 어느 앱이 어느 호스트를
부르는지와 그 배선은 6절 "실 API 연동 규약"에 있다.

### 앱 셸 — 새 화면은 셸을 다시 만들지 말고 라우트 파일만 추가한다

- **web-seller**: `src/shared/components/AppShell.tsx`가 `SideNav` + `<Outlet/>`을 조립한다. **nav는 게이트 이전 정본 4그룹 12항목(운영·판매 설정·정산·스토어)을 그대로 보여주고, 항목을 지우지 않는다**(SCRUM-301 — 메뉴를 빼면 운영자는 기능이 사라진 줄 안다). BE가 있는 9항목(대시보드·주문/배송 관리·취소/반품/교환·고객 문의·리뷰 관리·상품 관리·배송 정책·정산/매출·스토어 설정)은 실연동이고(고객 문의 SCRUM-316 · 리뷰 관리 SCRUM-315), BE가 없는 3항목(혜택/쿠폰/할인·알림/공지·계정/보안)은 `tag: PENDING_TAG`(`'준비 중'`)로 구별하고, 라우트는 **예시 데이터로 목록·폼을 그린 뒤 상단에 `SampleDataNotice`("예시 데이터") 띠를 붙인다**(SCRUM-307 — 안내만 있는 화면은 "기능에 들어가도 아무것도 없다"는 지적을 받았다). 예시 데이터는 `src/features/<domain>/<domain>.mock.ts` 하나에 모으고 화면 파일에 인라인하지 않으며, 그 파일 머리에 **어느 경로가 생기면 무엇을 바꾸는지** 한 줄로 적는다. 동작 버튼은 보이되 요청을 보내지 않고 `SAMPLE_ACTION_TOAST`만 띄운다 — **숨기지 않고, 속이지도 않는다**(규약 10). **다른 화면이 진입점으로 삼는 상수(주문·클레임)는 `src/shared/serverAvailability.ts`에 있다** — 대시보드 카드가 같은 값을 봐야 "목록이 열려요"라고 안내하면서 준비 중 화면으로 보내는 죽은 진입점이 생기지 않는다. 상수는 true로 올라가 있고 라우트의 게이트 분기는 남겨 둔다(서버가 내려가면 상수만 내려 진입점을 닫는다). BE가 생기면 상수를 올리고 꼬리표를 떼는 것이 복원 절차다. 아이콘은 정본(`26e4b89^`)의 lucide 이름을 그대로 쓴다 — 복원하면서 바꾸지 말 것. 새 화면은 `src/routes/<segment>/index.tsx`를 추가하고 nav 그룹에 항목을 넣으면 활성 탭이 자동 처리된다.
- **web-admin**: `src/routes/__root.tsx` 안에 `AdminShell`을 **인라인**으로 정의(web-seller와 위치 다름). 마찬가지로 `src/routes/`에 파일만 추가. nav에는 5그룹 15항목이 **전부 올라 있고**, BE가 없는 12항목은 숨기는 대신 `NavItem.tag`로 "준비 중" 꼬리표를 단다. **그 12화면은 막지 않고 예시 데이터로 열어 두고**, 상단에 공용 띠(`src/shared/components/MockDataNotice.tsx`)로 예시임을 밝히고 쓰기는 서버로 내보내지 않는다(규약 10, SCRUM-308). 목 데이터는 `src/features/<domain>/<domain>.mock.ts`에 있고 `*.queries.ts`가 `Promise.resolve`로 내려주므로, BE가 생기면 queryFn만 바꾸고 `tag`와 띠를 떼면 된다. 대시보드(`/`)의 지표도 예시지만 **셀러 입점 심사 대기 수만 실 API 값**이다(nav 배지와 같은 queryKey라 조회가 늘지 않고, 예시 숫자를 함께 띄우면 배지와 어긋난다). 실연동 3화면(`/sellers/applications`·`/admins`·`/members`)에는 띠를 붙이지 않는다(`docs/web-seller-admin-notes.md` "어드민 예시 데이터 화면 복원").
- **web-buyer**: 탭 셸은 별도 파일이 아니라 **pathless layout route** `src/routes/_tabs.tsx`. 5개 탭(index/market/sns/chat/mypage)이 자식으로 하단 탭바 공유. 온보딩 라우트는 `__root` 직속이라 탭바가 안 뜬다(탭바가 보이면 파일이 `_tabs/` 밑에 잘못 들어간 것).
- 라우트 파일 추가 후 `routeTree.gen.ts` 갱신은 아래 "개발 명령어" 참고(standalone `generate-routes`는 무효).
- **구매자 온보딩 정본은 `apps/web-buyer/src/routes/onboarding/*`** — `apps/mobile` 네이티브 온보딩은 superseded라 수정하지 말 것.

---

## 1. 핵심 규칙 (반드시 준수)

### 1-1. Feature 경계 (가장 중요)

- `src/features/<domain>/` 코드는 **다른 feature를 직접 import 금지**. 공유가 필요하면 `src/shared/` 또는 `packages/`로 승격.
- 위반 시 ESLint 빌드 에러(`eslint-plugin-boundaries`).
- **`shared → shared` 교차 import도 금지.** 서로 참조해야 하는 shared 코드는 한 폴더(예: `src/shared/catalog/`)에 모아 단일 element로 만든다. shared 컴포넌트가 다른 shared element의 로직(auth 등)을 써야 하면 직접 import하지 말고 **콜백 주입 프롭**으로 받는다(예: `ProductGrid`의 `wishGuard?: (proceed) => void`, 미주입 시 즉시 실행=하위 호환).

```
✅ features/order/Order.tsx → import from 'src/shared/Button'
✅ features/order/Order.tsx → import from '@aechak/domain'
❌ features/order/Order.tsx → import from 'src/features/auth/useAuth'
```

### 1-2. packages/domain 순수성

`packages/domain/` 내부에서 금지: React/React Native/React DOM, @tanstack/react-query, zustand, axios, @aechak/api, 모든 UI 라이브러리. **오직 TypeScript 타입과 순수 함수만.**

### 1-3. packages/api 생성물 직접 수정 금지

`packages/api/src/generated/`는 `pnpm openapi:generate`로만 갱신. OpenAPI 스펙 변경 후 반드시 재생성.

### 1-4. 상태 관리 계층 선택

| 상태 종류 | 도구 | 위치 |
| --- | --- | --- |
| API 데이터·캐시·refetch·optimistic | TanStack Query | `feature/xxx.queries.ts` |
| 모달/탭 등 전역 UI 상태 | Zustand | `feature/xxx.store.ts` |
| 컴포넌트 내부 폼·토글 | useState/useReducer | 컴포넌트 내부 |

**API 응답을 Zustand에 저장하지 말 것**(TanStack Query 캐시가 서버 상태 담당). web-buyer의 순수 클라이언트 전역 상태(찜 미러/장바구니 선택 상태/auth 등)는 zustand 없이 React `useSyncExternalStore`로 구현하는 게 관례(아래 7절 "상태 · 폼"). 장바구니 라인·주문 자체는 서버 상태라 TanStack Query 캐시(`['cart']`·`['order-groups']`)가 원본이다.

### 1-5. 테스트 컨벤션 (AC 기반)

1. 구현을 먼저 보고 테스트를 역산하지 말 것.
2. 테스트명에 AC ID 포함: `[AC-AUTH-001] 이메일 입력 시 ...`.
3. RTL/RNTL은 `role`/`label`/`text` 기반 쿼리. `className`/`id`/`testId` 기반 지양.
4. 단위 → 컴포넌트 → E2E 순서.

### 1-6. 새 Feature 추가 시

```
apps/<app>/src/features/<domain>/
  index.ts             ← public API (named exports만)
  <domain>.queries.ts  ← TanStack Query hooks
  <domain>.store.ts    ← Zustand (UI 상태만, 선택)
  components/
  __tests__/
```

추가 후 `pnpm typecheck && pnpm lint` 통과 확인.

### 1-7. 병렬 타입 판단 기준

필드가 부족하면 새 병렬 타입을 만들지 말고 **기존 도메인 타입에 optional 필드로 확장**(마스킹 안 된 버전이 필요한 정도로는 병렬 금지). 필드가 아니라 **상태머신 자체가 다르면**(예: `BuyerOrderStatus` vs 셀러 `OrderStatus`) 병렬 타입이 정당하다.

---

## 2. 금지 사항 요약

| 금지 | 이유 |
| --- | --- |
| feature → feature 직접 import (shared → shared 포함) | 경계 위반, lint 에러 |
| domain에서 React/UI import | 순수성 파괴 |
| `packages/api/src/generated/` 직접 편집 | generate 시 덮어씌워짐 |
| API 응답을 Zustand에 저장 | TanStack Query와 중복, 캐시 무효화 문제 |
| **`localStorage`에 accessToken 저장** | XSS 취약점 |
| 장식/죽은 UI(동작 안 하는 필터·토글·pill·존재하지 않는 라우트로의 nav) | 캡틴 반복 지적 |

---

## 3. 커밋 · PR 게이트 · 개발 명령어

### 커밋 메시지 규칙

```
[SCRUM-XX] <type>: <한글 설명, 50자 이내>

- 변경 bullet (파일/기능 단위)
```

type: `feat`(기능) / `fix`(버그) / `chore`(빌드·설정·의존성) / `refactor`(동작 무변경 구조개선) / `test` / `docs` / `style`. Jira 티켓은 `[SCRUM-XX]`로 제목 앞에.

### PR 필수 게이트 (모두 통과 후 제출)

```bash
pnpm typecheck              # TypeScript 오류 없음
pnpm lint                   # ESLint + boundaries 통과
pnpm test                   # 단위/컴포넌트 테스트 전체 통과
pnpm openapi:generate:check # 생성 코드 ↔ OpenAPI 스펙 동기화
```

`openapi:generate:check`는 `orval && git diff --exit-code src/generated`라 **생성물을 커밋하기 전에는 항상 실패한다** — 스펙 변경 배치는 재생성 결과를 커밋한 뒤에 돌릴 것. 커밋 전에 동기화만 확인하려면 orval을 두 번 돌려 두 번째 결과가 같은지 보면 된다.

**E2E는 CI가 세 앱을 모두 돌린다**(`ci.yml`의 `e2e` 잡). 로컬에서는 앱 디렉터리에서 `pnpm exec playwright test`로 돌리고, 포트가 앱마다 달라 순차 실행이면 충돌하지 않는다. spec을 더하거나 고쳤으면 제출 전에 해당 앱 E2E를 돌려 볼 것.

### 개발 명령어

```bash
pnpm --filter web-seller dev   # 5173
pnpm --filter web-admin dev    # 5174
pnpm --filter web-buyer dev    # 5175
pnpm --filter mobile start     # Expo Metro

pnpm build | typecheck | lint | test      # Turborepo 전체
cd packages/api && pnpm openapi:generate   # API 코드 생성
```

**라우트 파일 추가 후 `routeTree.gen.ts` 갱신**: standalone `generate-routes`(scripts/generate-routes.cjs)는 실제로 갱신하지 못한다(3개 웹앱 공통). `pnpm --filter <app> dev`를 잠깐 띄우거나 `vite build`를 한 번 돌려 갱신하고 커밋할 것(CI typecheck가 새 라우트를 인식하려면 필수).

---

## 4. 디자인 시스템 — 컴포넌트 문서·컨벤션·함정

### 문서 (컴포넌트 쓰기 전 반드시 확인, prop 이름/타입 오류 방지)

- 웹: [@docs/design-system/web-components.md](docs/design-system/web-components.md)
- 네이티브: [@docs/design-system/native-components.md](docs/design-system/native-components.md)
- DS 컴포넌트의 `icon`/`icon(isActive)` prop은 `ReactNode`를 직접 받고 아이콘 라이브러리를 내장하지 않는다.
- **아이콘 라이브러리**: `web-admin`/`web-seller`/`web-buyer`는 `lucide-react`(mockup `data-lucide`와 1:1). 네이티브 `mobile`은 `@expo/vector-icons`(Ionicons). 새 웹 네비 아이콘은 hand-rolled SVG 금지, `lucide-react` export 존재부터 확인(브랜드 로고 아이콘은 lucide에 없음 — 구글=`Globe` 대체).
- DS 컴포넌트 자체 범용 chrome 아이콘(토글 화살표 등)은 라이브러리 대신 `viewBox="0 0 24 24"` 인라인 SVG로 그린다(design-system은 아이콘 라이브러리 무의존).

### 컴포넌트 사용 함정 (재발 방지)

- **입력류 웹 컴포넌트의 `className`은 반드시 병합(append)**: HTML attribute 확장 컴포넌트는 (1) `className = ''`로 구조분해, (2) 실제 DOM `className`은 `[내부…, className].filter(Boolean).join(' ')`로 **배열 마지막**에 append(overwrite 아님), (3) `{...props}`는 그 이후 spread. 안 하면 호출부 `className`이 내부 `appearance-none`/높이 등을 덮어쓴다.
- **DS `Input`/`Textarea`에 `flex-1`을 직접 주지 말 것**: field 높이가 40→25px로 무너진다(`flex-1`이 내부 column 세로축에 걸림). 늘리려면 `<div className="flex-1">`로 감쌀 것.
- **`DataTable` `Column.align`**: 일반 텍스트/이름=`left`(기본), 순수 숫자·날짜(`tabular-nums`)=`right`, 보조텍스트 없는 `StatusPill` 단독=`center`, `StatusPill`+보조텍스트 컬럼은 `center` 금지(pill과 좌측 어긋남)→`left`, 자체 `flex justify-end` 액션 컬럼은 `align` 무관. `tabular-nums`인데 `align`이 없으면 회귀 신호. 새 web-admin 테이블은 `onRowClick={openDrawer}` 기본.
- **`StatusPill` variant는 소스가 정본(9종)**: 문서보다 `packages/design-system/src/web/components/StatusPill.tsx`를 볼 것. `muted`는 비활성/휴면 전용(사업자/개인 같은 대등 쌍엔 쓰지 말 것 → `neutral`+`info`), `danger`는 되돌리기 어려운 제재.
- **`SideNav`의 `activeKey`는 항목 `key`와 완전 일치로만 비교한다** — 호출부가 pathname을 그대로 넘기면 `/sellers/`처럼 꼬리 슬래시가 붙은 진입에서 활성 항목이 **0개**가 되어 활성 스타일과 `aria-current`가 통째로 사라진다(화면은 열려서 조용하다). 하위 경로가 없는 앱은 web-seller `AppShell`처럼 첫 세그먼트로, 중첩 key가 있는 앱은 web-admin `__root`의 `navActiveKey`처럼 꼬리 슬래시만 떼어 맞출 것(`/`는 떼지 말 것 — 빈 문자열이 되어 대시보드가 영구 비활성). 테스트 헬퍼로 경로를 정규화해 **도착지 단언만** 통과시키면 이 버그가 가려진다.
- **nav 그룹 소속은 머리글·항목 존재 단언으로 잡히지 않는다** — `SideNav`가 `label` 있는 그룹을 `role="group"` + `aria-labelledby`로 묶으므로 `within(getByRole('group', { name }))`으로 소속과 그룹별 개수까지 단언할 것. 항목을 다른 그룹으로 옮겨도 항목 수·머리글 수·클릭 도착지는 그대로라, 안 묶으면 전부 초록으로 지나간다(SCRUM-304에서 실측).
- **`SegmentedControl`은 `inline-flex`(shrink-to-content)** — 좁은 부모에서 라벨이 줄바꿈되면 `className="w-full"`을 줄 것.
- **`RatingInput` 별 간격은 모듈 상수 `STAR_GAP`(px, `style`로 적용)로만** 바꿀 것 — className gap과 픽셀 clip 계산이 갈라지면 소수 별점 부분 채움이 정수처럼 꽉 차 보인다.
- **필터 `Select`의 `'all'` 미선택 센티넬은 도메인 값에 `'all'`이 없는 축에서만 쓸 수 있다** — 어드민 목록 화면 관례가 `{ value: 'all', label: '… 전체' }`인데, 값 자체가 `'all'`인 축(공지의 대상: 전체/구매자/셀러)에 그대로 쓰면 같은 `value`가 옵션에 두 번 들어가 React가 `Encountered two children with the same key, 'all'`을 띄우고, **운영자가 "전체 대상"을 골라도 `filter`가 미선택으로 읽어 전체가 그대로 남는다**(동작 안 하는 필터 = 2절 금지). 센티넬을 `'any'` 같은 별도 값으로 가를 것(`routes/notices.tsx`의 `AUDIENCE_ANY`). 필터 테스트는 옵션 존재가 아니라 **고른 뒤 남는 행 수**를 단언해야 이 버그가 드러난다.
- **`Toast` variant는 `role`을 바꾼다** — warning·error만 `role="alert"`이고 success·info는 `role="status"`다(`Toast.tsx`의 `variantStyle`). 그래서 토스트 **문구만** 단언하는 테스트는 variant 회귀를 못 잡는다(예시 화면의 `warning`을 `success`로 되돌려도 통과). 의미를 고정해야 하면 토스트 노드에서 `closest('[role="alert"]')`로 거슬러 올라갈 것 — `Alert` 띠도 `role="alert"`이라 전역 `getByRole('alert')`로는 둘을 가를 수 없다.
- **`Alert`/`Toast`는 variant별 아이콘을 자체 렌더** — children/message 앞에 lucide 아이콘을 또 넣지 말 것(아이콘 2개).
- **`EmptyState.title`은 `string`** — 강조 span 등 마크업 불가. 동적 텍스트 강조가 필요하면 EmptyState 레이아웃을 feature에서 미러링(DS에 markup 슬롯 추가 금지).
- **`MetricCard.footer`는 단일 슬롯** — 여러 요소는 컴포넌트를 고치지 말고 footer 안을 `flex-col` div로 감싸 합성.
- **DS 토큰 수정 시** `surface.sunken`과 `surface.hover`가 우연히 같은 값이 되지 않게 확인(DataTable 헤더=sunken, 행 hover=hover라 같으면 hover가 안 보임). 토큰 수정은 `packages/design-system/src/tokens.ts`만, 웹 테마 `web/tailwind-theme.ts`, 네이티브 `native/theme.ts`.
- **재사용처가 하나뿐인 조합은 DS에 올리지 말고** feature 로컬 컴포넌트로 둔다(목업 스펙 칩 이름이 곧 DS 컴포넌트는 아니다). **공용 DS 컴포넌트는 4개 앱 공용이라 앱 하나를 위해 수정 금지**(예: `Toast` 포지셔닝).
- 새 DS 웹 컴포넌트의 AC 테스트는 DS가 아니라 소비앱(`apps/web-buyer/src/shared/components/__tests__/`)에 두고 import(DS에 vitest 도입 금지).

### 확인 Modal 패턴 (파괴적/되돌리기 어려운 액션)

즉시 mutate하지 말고 확인 `Modal` 경유: 타겟 state는 라우트가 소유 → 액션 버튼은 setState로 타겟만 지정 → Modal은 타겟 있을 때만 조건부 렌더 → 확인 시에만 mutate. **확인 Modal이 자체 `useMutation`을 만들지 말 것** — 라우트의 `isMutating`을 `onConfirm`/`loading` prop으로 받는다(그 값이 목록의 다른 행 버튼 비활성화에도 쓰임). `StatusPill` 아래 보조 텍스트는 `pl-2.5` + `mt-1.5`로 pill 내부 텍스트와 좌측 정렬.

### web-admin 심사/관리 화면 공유 패턴

목록 `DataTable` → 행 클릭 시 상세 `Drawer`(width `lg`/480px) → 파괴적 액션은 확인 `Modal`(danger). `apps/web-admin/src/shared/components/`의 프리미티브 6종(`DetailField`/`SummaryGrid`/`DrawerSummaryCard`/`HistoryList`/`DecisionRadioGroup`/`ActorTag`) 재사용. `DecisionRadioGroup`으로 여러 결정을 받는 화면은 버튼을 나열하지 말고 **단일 "제출" 버튼 + `decision → {title,description,confirmLabel,...}` Record 매핑 확인 Modal 하나**(되돌리기 쉬운 승인도 확인 Modal 통일). 바깥 행을 `<label>`로 또 감싸지 말 것(DS `Radio`가 자체 `<label>` 렌더).

---

## 5. 사용자 노출 문구(카피) 컨벤션

- **구분자는 `/`** — 가운뎃점(`·`)은 목업에 있어도 `/`로 변환(카피 규칙이 목업 원문보다 우선). 수량 표기만 예외로 괄호(`상품명 (1개)`).
- **앱 전체 -해요체** — `-습니다`/`-됩니다` 격식체 금지.
- **직접 인용부호(`""`/`''`) 금지** — 강조는 `<strong>`.

---

## 6. 실 API 연동 규약 (전 앱 공통)

breeds/상품/검색/리뷰가 깔아둔 파이프라인이고, 셀러 상품·어드민 심사 연동도 같은 규약을 따른다.
한동안 이 절이 web-buyer 섹션 아래 있었지만 세 웹앱이 전부 지키고 있어 전역으로 올렸다.

1. **`packages/api/openapi/schema.yaml`은 손으로 유지**, 경로에 `/api/v1` 접두 넣지 말 것(axios baseURL이 붙임). nullable 객체 필드는 OpenAPI 3.0이라 `allOf: [$ref] + nullable: true`로 써야 orval이 `T | null`을 만든다. 스펙 변경 후 `pnpm --filter @aechak/api openapi:generate` → 생성물 통째 커밋.
2. **생성된 react-query 훅이 아니라 fetcher만 소비**하고 feature `*.queries.ts`가 자체 `useQuery`/`useInfiniteQuery`로 감싼다(패키지 간 react-query 버전 표류 회피). 서버 enum/필드는 feature 안에 가둔다.
3. **BE는 실행 모듈이 셋이고 호스트가 다르다** — api(인증·카탈로그·주문·presigned 발급), seller(입점 신청·셀러 상품), admin(어드민 심사). 각 앱 `main.tsx`는 `bootstrapApiHosts({ app, isProd, api, seller?, admin? })` 하나만 부른다(`packages/api/src/env.ts`) — 그 안이 값 검증 + `configureApiHosts`를 한다. **운영 빌드에서 호스트 변수가 비거나 origin이 아니거나 localhost를 가리키면 부팅을 멈추고 사유를 화면·콘솔에 띄운다.** `?? 'http://localhost:808x'` 같은 조용한 되돌림을 다시 넣지 말 것 — dev 배포에서 그 값이 번들에 굳어 앱이 전면 실패한 적이 있다(SCRUM-272, 값 표는 `docs/deploy-env.md`). **`VITE_API_BASE_URL`은 셀러·어드민 앱에서도 구매자 api 모듈이다.** 공유 인터셉터가 **요청 경로 접두로** 호스트를 가른다(`/sellers`·`/seller-applications` → seller, `/admin` → admin, 나머지와 `/auth` → api). axios 인스턴스를 복제하지 않는 이유는 토큰·refresh Promise·전역 콜백이 `client.ts`의 모듈 스코프라 복제하면 세션 상태가 갈리기 때문이다. api 호스트를 콕 집어야 하면 `forceApiHost: true`를 쓴다(경로만으로는 "호출부가 api를 지정했다"를 표현할 수 없다 — mergeConfig가 defaults의 baseURL을 늘 채운다).
4. **어드민 경로만 `withCredentials=false`로 나간다.** `boot/admin`의 CORS 설정에 `allowCredentials`가 없어(bearer 전용 설계) credentials 모드로 보내면 브라우저가 정상 응답까지 버린다. refresh는 쿠키가 필요하므로 `forceApiHost`로 api 모듈에 credentials와 함께 보낸다 — 어드민 모듈에는 `/auth/*` 자체가 없다.
5. **401은 인터셉터가 refresh(공유 Promise로 스탬피드 방지, 재시도 시 헤더를 새 토큰으로 교체) → 실패하면 `setOnAuthExpired` 전역 콜백.** 재시도 1회 제한은 `config.authRetried` 불리언이 보장한다 — **WeakSet 표식만으로는 막히지 않는다.** axios가 `request()`마다 `mergeConfig`로 새 config 객체를 만들어(`Object.create(null)`) 재시도의 401이 WeakSet에 없는 객체로 돌아오기 때문이고, 그대로 두면 "refresh는 성공하는데 원 요청은 계속 401"인 서버에서 무한 루프가 된다. mergeConfig가 모르는 키를 그대로 옮기는 성질을 이용한 표식이다. 화면은 비인증 오류(네트워크/500)만 인라인 안내(재시도 버튼 없음, 하드코딩 폴백 부활 금지).
6. **배열 쿼리는 반복 파라미터(`?k=A&k=B`)로 나간다** — 공유 인스턴스의 `paramsSerializer: { indexes: null }`이 담당하고, 스펙에는 `style: form` + `explode: true`로 쓴다. axios 기본값(`k[]=A`)으로 나가면 BE 바인딩이 "지원하지 않는 값"으로 400을 준다. **값이 빈 파라미터는 키째 빼서 보낼 것** — 서버가 `?stock=`·`?createdFrom=`을 미입력이 아니라 형식 오류로 거절하는 자리가 있다(정규화는 queries 층이 맡는다).
7. **실 API 전환은 실패 경로를 새로 만든다.** 목업 시절에는 없던 403·404·5xx가 생기므로 목록·상세 조회의 `isError`를 반드시 화면에 드러낸다 — 빈 상태 문구로 떨어지면 "데이터 없음"과 "불러오지 못함"이 구분되지 않는다. 화면 전체가 한 쿼리에 의존하면(등록 폼의 카테고리 트리 등) 실패 시 `return null`로 백지를 만들지 말고 `EmptyState` + 재시도를 둔다. **그리고 조회가 실패한 동안에는 그 데이터로 하는 처리(mutation) 버튼을 잠근다** — 재조회가 실패하면 react-query가 직전 데이터를 들고 있어 행이 그대로 남는데, 확인 Modal은 **그 행의 값**으로 만들어지므로 낡은 행에서 누르면 서버에 없는 상태를 보고 되돌릴 수 없는 전이를 지시하게 된다(권한이 끊긴 403이면 전부 실패한다). 행 자체는 지우지 않고(마지막으로 본 내용은 정보다) 처리만 잠근다. **읽기로 가는 버튼은 예외** — 상세 Drawer를 여는 버튼은 상세가 스스로 다시 조회하므로 막으면 확인할 방법이 없어진다(`OrdersTable`·`ClaimsTable`·`ClaimDetailDrawer`가 같은 규칙).
8. 테스트: MSW(v2)로 실 HTTP 경로 검증(`onUnhandledRequest:'error'`, refresh 기본 핸들러는 반드시 401). **두 호스트를 부르는 앱은 MSW URL도 호스트별로 나누고 `test-setup.ts`에서 `configureApiHosts`를 실제 앱과 같게 호출할 것** — 한 base로 합치면 요청이 엉뚱한 모듈로 나가도 MSW가 똑같이 받아 주어 배포에서만 드러나는 호스트 오배치를 놓친다. `vitest.config.ts`에 `exclude: e2e/**` 필수(Playwright spec이 vitest에 삼켜짐). Playwright E2E는 `page.route` 스텁 + CORS 헤더(교차출처라 정확한 origin·OPTIONS 방어가 필요하고, `Allow-Credentials:true`는 credentials를 쓰는 호스트에만 — 어드민 스텁에 넣으면 실제와 달라진다). `page.route` 글롭에 origin까지 적어 호스트를 가를 것.
9. **배송지 네이밍**: 화면/훅/타입/파일/폴더는 `deliveryAddress`/`DeliveryAddress` 접두, 와이어 JSON 필드(`addressId`/`baseAddress` 등)는 BE 계약 그대로. FE 라우트 URL은 `/addresses`, API 경로는 `/delivery-addresses`(혼동 금지).
10. **BE에 대응 엔드포인트가 없는 화면은 진입을 막지 말고, 예시 데이터임을 화면에서 밝히고 쓰기를 막는다.**

    이 규약의 목적은 처음부터 하나다 — **운영자가 속지 않게 하라.** 막아야 하는 것은 저장되지 않는 화면이 멀쩡해 보이는 것이고, 그래서 지키는 방법을 두 번 고쳤다.

    - 2026-10-18(SCRUM-238)에는 **진입점과 nav 항목을 함께** 걷어냈다 → "어드민이 무엇을 다루는 도구인지조차 알 수 없다"는 지적으로 nav를 되살렸다(SCRUM-302).
    - 그래도 꼬리표가 붙은 목적지는 `UnavailableScreen` 안내만 보여줬다 → **"목 데이터 기반으로 잘 들어가 있던 화면을 다 없앴다"**는 지적으로 진입 차단 자체를 걷었다(2026-10-27 SCRUM-308). 메뉴를 눌러도 기능의 모양을 볼 수 없으면 숨긴 것과 같다.

    지금의 규칙은 이렇다.

    - **화면은 열고 내용을 그린다.** 목 데이터는 feature 폴더의 `*.mock.ts`에 두고 `*.queries.ts`가 `Promise.resolve`로 내려준다 — BE 경로가 생기면 queryFn만 생성 fetcher로 바꾸면 화면은 그대로다.
    - **화면 상단에 공용 예시 데이터 띠를 붙인다**(web-admin은 `src/shared/components/MockDataNotice.tsx`). 문구를 화면마다 손으로 쓰지 말 것 — 갈라지면 어떤 화면은 "저장되지 않는다"를 빼먹게 되고, 그게 이 규약이 막으려던 상태다. **실연동 화면에는 붙이지 않는다**(실데이터를 예시로 의심하게 만들어 거꾸로 속인다).
    - **쓰기는 서버로 내보내지 않는다.** 버튼과 확인 Modal은 그대로 둬 흐름을 볼 수 있게 하되, 누르면 화면 안에만 반영하고 토스트로 저장되지 않았음을 알린다(`MOCK_WRITE_TOAST`). 성공 토스트(`저장했어요`)를 쓰면 저장된 줄 안다. 서버에 없는 경로로 요청이 나가 500·404가 찍히면 안 된다 — 테스트는 버튼을 누른 **뒤에 늘어난 요청**이 0건인지 본다(총 건수는 셸의 배지 조회 때문에 0이 아니다).
    - **nav 항목은 빼지 말고 `NavItem.tag`로 "준비 중" 꼬리표를 유지한다**(색·점이 아니라 글자로, 버튼 접근명에도 들어가게). 띠는 들어간 뒤에 보이므로, 들어가기 전에 알 수 있는 통로가 꼬리표다. 꼬리표를 다는 항목에는 **반드시 라우트 파일이 있어야 한다**(없으면 404로 가는 죽은 nav라 2절 금지).
    - **서버에 아예 없는 필드를 화면이 요구하고 있으면**(지어낸 필드) 그건 그대로 제거한다 — 예시 데이터는 모양을 보여주는 것이고, 실연동될 때 계약에 없는 입력을 남겨 두면 그 자리가 조용히 깨진다.
    - **BE가 생기면** 그 항목의 `tag`를 떼고 화면의 띠를 걷고 queries 층을 갈아끼운다.

    2026-10-28 기준 web-admin 12화면이 이 모양이고(실연동은 셀러 입점 심사·관리자 관리·일반 회원 관리 셋 — 회원 관리는 SCRUM-313), 셀러센터는 쿠폰·공지·계정 세 화면이 같은 모양이다(SCRUM-307) — 문의와 리뷰는 SCRUM-316·SCRUM-315에서 실서버에 붙어 띠와 꼬리표를 뗐다.

---

## 7. web-buyer 공통 컨벤션

### 모바일 레이아웃 파운데이션

- **`MobileScreen`이 앱셸형 레이아웃** — 바깥 컨테이너를 `overflow-hidden` + `useVisualViewportHeight()` 높이로 고정하고 content 슬롯만 스크롤. `100dvh`가 iOS 키보드에 안 줄어드는 문제를 이 방식이 자동 해결(하단 CTA가 키보드 위에 뜸).
- safe-area는 CSS `env(safe-area-inset-*)` + 앱 `index.html`에 `viewport-fit=cover` 필수.
- **오버레이 프레임 이탈 방지**: `position:fixed` 오버레이(`BottomSheet`/`Modal`/`Drawer`/`Toast`)는 데스크톱에서 430px 폰 프레임(`__root`의 `sm:max-w-[430px]`)을 벗어난다 — 프레임 div의 `[transform:translateZ(0)]`가 containing block이 되어 자동으로 프레임 안에 갇힌다(DS에 프레임 폭 하드코딩 금지). `MobileScreen`을 안 쓰는 화면에서 오버레이를 시연하려면 그 화면도 `MobileScreen`으로 감쌀 것.
- **호버 전용 상호작용 금지**(모바일엔 hover 없음). DS `Checkbox`/`Radio`처럼 자체 `<label>`이 있는 컴포넌트를 큰 `<label>`로 또 감싸지 말 것(탭 시 이중 토글 상쇄) — 체크박스와 텍스트 버튼을 형제로 두고 각각 같은 토글 호출.
- 웹 `Toast`는 `position:fixed bottom-center`로 스스로 위치를 잡아 부모 래퍼로 못 옮긴다.

### 상태 · 폼

- **전역 클라이언트 상태(찜 미러/계정/펫/auth/리뷰 등)는 zustand 없이 `useSyncExternalStore`** 전역 스토어로 구현(`src/shared/<domain>/*.store.ts`). 테스트 격리용 `reset*` 제공. 장바구니 라인과 주문은 클라이언트 스토어가 아니라 서버(`GET /carts`·`GET /order-groups`)가 원본이고 TanStack Query가 캐시한다 — 클라이언트에 남는 것은 선택 상태(`shared/cart/cart-selection.store.ts`, 해제된 cartItemId 집합)와 주문 시도 기록(`shared/order/order-attempt.store.ts`, sessionStorage)뿐이다. "정확히 하나"(대표 펫/기본 배송지)는 항상 정규화(삭제 시 첫 항목 자동 승격).
- **단일 폼 저장 화면 패턴**: 폼 state는 라우트 소유 + `useEffect`의 `!form` 가드로 1회만 시드(재시딩하면 저장 직후 입력이 서버 왕복 사이 삭제되는 버그). 필드 변경은 하나의 `onChange:(patch)=>void`로 합침. 저장이 서버 파생 필드(status 등)를 바꾸면 `onSuccess:(updated)=>setForm(updated)`로 반드시 반영(안 하면 상태 전이 후에도 버튼이 안 잠김). 성공 피드백은 `Toast` + `invalidateQueries`.
- 목록 레이아웃 넘침 가드는 CSS `truncate`/`line-clamp-2` + `min-w-0`가 정석(DS `ProductCard`는 이미 걸림, 건드리지 말 것). 글자수 하드캡이 자연스러운 자리(랭킹 행 등)만 `@/shared/truncate`의 `truncateText(text, maxChars)`.

### 실 API 연동 — web-buyer 전용 조항 (전 앱 공통 규약은 6절)

- **회원 전용 열람(JWT 필수) 진입점은 `useLoginGate().requireAuth(feature, action)`로 감싸** 비회원 401 강제 이탈을 막는다(로그인 BottomSheet만 열고 action 미실행). `auth.store`의 `loggedIn` 기본값은 `true`(기존 회원 흐름 전제, 새로고침 시 리셋되는 세션 mock).
- **실 API 화면은 목업 카탈로그 id를 `findMockProduct`(레지스트리 제외)로 네트워크 전에 걸러 목업을 반환**하고, 실 상품 첫 페이지 404는 목업 폴백이 아니라 `notFound`로(레지스트리에 등록된 실 상품을 가짜 데이터로 위장 금지).
- 세션 만료 시 전역 콜백은 `logout` + `/onboarding/login` 이동을 맡고, 온보딩 미완(403/20006)은 `setOnOnboardingRequired`가 `/onboarding/terms`로 보낸다. **이 두 핸들러를 등록하는 앱은 web-buyer뿐이다** — 셀러센터는 `setOnAuthExpired`만 걸고(온보딩 화면이 없다) 어드민은 온보딩 개념 자체가 없다. 20006을 "전역이 알아서 처리한다"고 전제한 주석을 다른 앱에 복사하지 말 것.
- 장바구니 파생 로직(셀러 그룹핑/배송비/소계)은 `shared/cart/cart.queries.ts`(`buildServerCartView`·`sellerShippingFee`)가 서버 `GET /carts` 응답으로 계산한다 — 상품·셀러·배송 정책이 서버 라인에 실려 오므로 카탈로그 조회가 필요 없다. `shared/catalog/cart-view.ts`는 목업 시절 합성 경로로 파일만 보존돼 있다(새 코드에서 쓰지 말 것). 두 shared가 공유하는 순수 키 함수(`cartLineKey`)는 `@aechak/domain`에 둔다(shared→shared 금지 회피).
- **적립금 사용 한도와 최소 결제 금액은 서버 계약이다**(BE `OrderGroup`의 `MIN_POINT_USAGE`=1,000 · `MIN_PAYMENT_AMOUNT`=100). 적립금은 0원이거나 1,000원 이상이어야 하고 적립금을 뺀 뒤 100원은 남아야 한다 — 어기면 각각 400/50103, 422/50102, 422/50108이다. **입력 중에는 상한만 적용하고 하한은 입력이 끝난 뒤 한 번만 맞춘다** — 제어 입력에서 매 타이핑마다 하한으로 올리면 그 구간 밖 금액을 아예 입력할 수 없게 된다. 하한 미달은 올리지 말고 0으로 내린다(적립금은 사용자 자산이라 의도를 넘겨 쓰게 만들면 안 된다).

### 그 밖의 반복 규칙

- **토스트는 `src/shared/components/AppToast`가 유일한 통로**(DS `Toast` 직접 import 금지, 한글 nowrap 처리). message는 텍스트만. 하단 고정 액션바가 있는 화면은 `aboveActionBar` prop을 켠다.
- **상품 placeholder 썸네일은 `shared/catalog`의 `placeholderImage`(실루엣 SVG data-URI)로 통일** — lucide `ImageIcon` fallback 금지. 스냅샷 스토어(review)는 boundaries상 `shared/catalog` import 불가라, 썸네일은 store가 아니라 feature 읽기 계층에서 상품 id→카탈로그 참조로 채운다(주문 품목 썸네일은 서버 응답 `thumbnailUrl`을 그대로 쓴다).
- **일회성 완료/결과 화면(결제/제출/리뷰 작성 완료)은 진입/이탈 navigate에 `replace: true`**(마운트마다 mutation 재발화 방지). 되돌리면 안 되는 완료 화면은 `header` 자체를 빼 ← 버튼을 없앤다(`BackAppBar` 수정 말고 `header` 미지정). 큰 아이콘/제목이 상태를 전하는 자리에 중복 pill·중복 버튼 금지.
- **DS `Radio`/`Checkbox`의 `<input>`은 `sr-only`** — 자동화는 노드가 아니라 라벨 텍스트를 클릭. 컨트롤드 `Textarea`는 `fill`이 아니라 `type`으로 채워야 onChange 반영. jsdom은 `BottomSheet`의 `onTransitionEnd`를 안 쏴 닫힌 시트가 DOM에 남는다(셀렉터 정확 매칭).
- **펫 수집 필드는 종/이름/품종/생년월/체중/사진뿐** — `gender`는 제거됐으니 다시 넣지 말 것. `PetSpecies`는 `'dog' | 'cat'` 2종.
- **외부 스크립트(Daum 우편번호 등)는 `index.html`이 아니라 온디맨드 동적 로드**(모듈 레벨 once-guard Promise), 팝업 대신 `BottomSheet` 내부 div에 embed. jsdom 테스트는 실제 로드 대신 `window.daum` Mock 주입.

---

## 8. 모바일(Expo) 앱

mobile 앱은 대부분 superseded지만 손댈 일이 있으면 `docs/web-seller-admin-notes.md`의 "모바일 셋업" 절을 볼 것(PR 게이트가 Metro 번들링을 검증하지 않는 등 함정 다수). 핵심 하나: **`@types/react` 버전은 워크스페이스 전체(모든 앱 + design-system)에서 동일하게 맞출 것** — design-system이 raw `.ts`를 export해 버전이 어긋나면 `'X cannot be used as a JSX component'` 타입 에러가 난다(web 앱에도 해당).
