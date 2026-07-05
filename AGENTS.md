# AGENTS.md — aechak Frontend Monorepo

AI 에이전트(Codex, Claude 등)가 이 리포에서 작업할 때 반드시 따라야 할 상시 규칙.

## 디자인 시스템 컴포넌트 API

컴포넌트 사용 전 반드시 아래 문서를 참조할 것. prop 이름·타입 오류 방지.

- 웹: [@docs/design-system/web-components.md](docs/design-system/web-components.md)
- 네이티브: [@docs/design-system/native-components.md](docs/design-system/native-components.md)

디자인 시스템 컴포넌트의 `icon`/`icon(isActive)` prop은 `ReactNode`를 직접 받으며 아이콘 라이브러리를 내장하지 않는다.
`web-admin`과 `web-seller`는 둘 다 `lucide-react`를 아이콘 라이브러리로 사용한다 (mockup의 `data-lucide` 이름과
1:1 매칭). 새 웹 앱에서 네비게이션 아이콘이 필요하면 손으로 SVG를 만들지 말고 `lucide-react`를 먼저 확인할 것 —
Phase 1 감사에서 web-seller가 처음엔 12개 아이콘을 hand-rolled SVG로 새로 만들었다가 web-admin과
중복되어 lucide-react로 교체한 적이 있다. 네이티브 앱(`mobile`)은 `@expo/vector-icons`(Ionicons)를 사용하며
이 컨벤션에는 포함되지 않는다.

---

## SideNav 폭 (`w-64`, 2026-07-04 변경)

공유 `SideNav`(`packages/design-system/src/web/components/SideNav.tsx`, web-seller/web-admin 공용)의
컨테이너 폭이 `w-56`(224px)에서 `w-64`(256px)로 바뀌었다 — 캡틴이 두 앱의 좌측 네비게이션이
"내용이 잘리는 것처럼 답답하다"고 리포트해 확인한 결과.

**주의: `truncate`가 실제로 ellipsis를 트리거하는 것(`scrollWidth > clientWidth`)은 이 배치
시점 브라우저에서 재현되지 않았다** — `Pretendard`는 font-family 스택에 이름만 있고 실제
`@font-face`가 어디에도 없어(항상 시스템 폴백, macOS는 Apple SD Gothic Neo) 렌더링되는데, 이
폴백 기준 가장 긴 라벨(`어드민 계정 권한 관리`, `채팅 CS 모니터링` 등)도 기존 224px에서 배지
유무에 따라 62~77%만 채워 여유가 있었다. 즉 실제 버그는 "지금 잘리는 중"이 아니라 "라벨을 하나만
더 추가하거나 2자리 배지가 붙거나 다른 OS의 한글 폰트(Windows Malgun Gothic 등)로 렌더링되면
쉽게 잘릴 수 있는 아슬아슬한 마진"이었다 — 폭을 늘려 최대 채움률을 62%로 낮췄다(이전 최대
77%). 새 네비 항목/라벨을 추가하거나 폭을 다시 조정할 때는 `scrollWidth > clientWidth`를
브라우저에서 직접 재는 방법을 재사용할 것 — 캔버스 `measureText` 추정보다 실제 DOM 실측이
폰트 폴백까지 그대로 반영되어 더 정확하다(이번에 두 방법을 교차검증함).

**~~발견했지만 이번 배치에서 고치지 않은 별개 버그~~ → 2026-07-05 수정 완료**: `SideNav`의 각
nav 버튼(`itemBase`의 `w-full ... mx-2`)이 실측상 nav 우측 테두리를 7~8px 넘어 오버플로했다 —
`width:100%`가 부모 컨테이너 폭 기준으로 계산된 뒤 그 위에 `mx-2`(좌우 8px)가 마진으로 추가돼
버튼 우측 끝이 테두리 밖으로 밀려나는 전형적인 CSS 박스모델 이슈였다(마진만큼 폭이 줄어드는 게
아니라 마진만큼 더 넓어짐). 위에서 예고한 대로 `mx-2`를 버튼에서 빼고 스크롤 wrapper div
(`<div className="flex-1 overflow-y-auto py-3 ...">`)에 `px-2`로 옮겨 `w-full`이 이미 좁아진
wrapper의 content box 기준으로 계산되게 했다 — 브라우저에서 `getBoundingClientRect()`로 실측한
결과 버튼 우측 끝이 nav 우측 테두리보다 항상 안쪽에 위치함을 확인(web-seller/web-admin 양쪽,
배지 있는 항목 포함 전 그룹).

**주의: 그룹 라벨(`<p className="px-4 py-2 ...">`)과 nav 아이템 아이콘은 이 수정 이전에도 서로
정렬돼 있지 않았다** — 수정 전 실측값은 라벨 텍스트 시작 16px, 아이콘 시작 24px로 8px 차이가
있었다(라벨은 자신의 `px-4`만으로 오프셋을 만들고, 아이콘은 버튼의 `mx-2`+`px-4`로 오프셋을
만들어 애초에 같은 값을 공유하지 않았음 — 우연히 나란히 보였을 뿐 실제로는 어긋나 있었다). wrapper에
`px-2`를 추가하면 라벨의 기존 `px-4`가 그 위에 그대로 얹혀 라벨이 8px 더 밀리므로, 라벨
className을 `px-4 py-2`에서 `px-2 py-2`로 줄여 라벨의 절대 위치(16px)를 수정 전과 동일하게
유지했다 — 즉 이번 수정은 "정렬을 새로 맞춘 것"이 아니라 "수정 전 상태(라벨 16px / 아이콘
24px, 8px 차이)를 그대로 보존하면서 우측 오버플로만 없앤 것"이다. 다음에 이 8px 차이 자체를
디자인 이슈로 판단해 실제로 정렬시키려면, wrapper의 `px-2`(8px)와 라벨의 `px-2`(8px)를 그대로
두고 라벨을 `pl-4`로 늘리면 된다(8+16=24, 아이콘과 동일).

---

## DataTable 정렬 컨벤션 (`Column.align`, `onRowClick`)

**`DataTable`(`packages/design-system/src/web/components/DataTable.tsx`)의 `Column.align`
(`'left' | 'center' | 'right'`, 헤더 `<th>`·셀 `<td>` 양쪽에 동일 적용)은 3라운드에 걸쳐
피스밀로 문서화됐던 걸 이번에 하나로 정리한 규칙이다 — 새 컬럼을 추가하거나 정렬이 헷갈릴 때는
이 문단만 보고 판단할 것:**

- 일반 텍스트/이름/라벨 컬럼은 기본값 `left`를 그대로 둔다(명시적으로 지정할 필요 없음).
- 순수 숫자 또는 날짜/타임스탬프 값(카운트, `tabular-nums`로 렌더링하는 날짜 등)은 `right` —
  자릿수·크기를 한눈에 비교할 수 있도록 우측 정렬한다. `tabular-nums`를 쓰는 컬럼인데
  `align`이 빠져 있으면 그 자체가 회귀 신호다 — 실제로 `sellers/index.tsx`의 `lastActiveAt`,
  `sellers/applications.tsx`의 `appliedAt`, `products/ai-queue.tsx`의 `autoBlindedAt`,
  `products/review.tsx`의 `registeredAt` 4곳이 `tabular-nums`를 쓰면서도 `align`이 없어
  기본값 `left`로 남아 있던 걸 이번 배치에서 발견해 전부 `right`로 맞췄다(다른 카운트/가격
  컬럼은 이미 `right`였던 것과 비교하면 같은 종류의 데이터가 컬럼마다 다르게 정렬되는
  전형적인 불일치였다). 다만 `sellers/applications.tsx`의 `businessNumberMasked`처럼
  `tabular-nums` 안에 "보유 · "/"미보유" 같은 서술 텍스트가 섞여 순수 숫자 비교 대상이 아닌
  컬럼은 애매하면 기본값 `left`를 유지 — 판단 기준은 "이 컬럼에서 독자가 자릿수/크기를
  비교하려 하는가".
- StatusPill 등 아이콘/상태 배지만 있고 그 아래 보조 텍스트가 없는 컬럼은 `center` — 읽는
  콘텐츠가 아니라 시각적 마커이기 때문. 단 StatusPill 아래에 `pl-2.5` 보조 텍스트(클레임
  유형·사유, 주문 상태의 송장/자동확정일 등)가 붙는 컬럼은 `center`를 주지 말 것 — `<td>`에
  `text-center`가 걸리면 inline인 pill은 셀 중앙으로 이동하지만 그 아래 block 텍스트는 셀
  전체 폭 안에서 내부 텍스트만 중앙 정렬되어 pill과 좌측이 어긋난다(실측: web-seller
  `OrdersTable.tsx`의 `status`, `ClaimsTable.tsx`의 `type` — `Range.getBoundingClientRect()`로
  비교하면 텍스트 박스 자체의 bounding rect는 정렬 여부와 무관하게 항상 셀 전체 폭을
  반환하므로 오해하기 쉽다). subtext 없는 순수 StatusPill 컬럼만 `center`, subtext가 붙으면
  기본값 `left`.
- 액션 버튼을 자체 `flex justify-end` div로 감싸 렌더링하는 컬럼은 `align`을 건드리지 말고
  그대로 둘 것 — `align`은 `<td>`의 `text-align`만 바꾸고 flex 자식에는 영향이 없다.

`onRowClick`(같은 배치에 `Column.align`과 함께 추가, optional이라 미지정 시 기존 동작과
동일)은 행 전체를 클릭 가능하게 만들고(`cursor-pointer` 자동 적용) 기존 이름/ID 셀의 개별
버튼 `onClick`과 동시에 둬도 된다 — 같은 `openDrawer` 핸들러를 두 경로에서 호출해도 멱등이라
안전. 새 web-admin 화면을 추가할 때도 `onRowClick={openDrawer}`를 기본으로 넣을 것.

**web-seller의 3개 테이블(`OrdersTable.tsx`/`ClaimsTable.tsx`/`products/index.tsx`)도 위
`DataTable` 정렬 컨벤션에 100% 부합하도록 정리됐다.** `OrdersTable.tsx`의 `결제금액` 컬럼은
과거 캡틴의 개별 요청으로 `text-center`였으나, 이번에 캡틴이 "숫자 컬럼은 무조건 right"
일관성을 우선하기로 명시적으로 재확인해 `align: 'right'`로 전환했다(기존 요청을 뒤집는
의도적 변경 — 실수 아님). 나머지 컬럼(`id`/`buyer`는 left 기본값, `status`는 위 subtext
예외로 left 유지, `actions`는 자체 `flex justify-end`라 `align` 무관)은 이미 컨벤션대로였다.

---

## web-seller 앱 셸

`apps/web-seller/src/routes/__root.tsx`는 `AppShell`(`src/shared/components/AppShell.tsx`)을
렌더링한다. `AppShell`이 `SideNav` + `<Outlet />`을 조립하고, 12개 셀러 화면
(대시보드/주문/취소반품교환/고객문의/리뷰/상품/배송정책/쿠폰/정산/스토어설정/공지/계정)의
라우트 경로·아이콘·그룹(운영/판매 설정/정산/스토어)을 이미 정의해 두었다.
**새 셀러 화면 라우트를 추가할 때 셸을 다시 만들지 말 것** — `src/routes/`에 해당 경로의
파일만 추가하면 `AppShell`이 자동으로 활성 탭 하이라이트와 네비게이션을 처리한다.
아직 라우트 파일이 없는 nav 항목은 클릭 시 TanStack Router의 기본 404("Not Found")로
빠지는 것이 정상이며, 각 배치 PR에서 파일을 추가하면 해결된다.

---

## web-buyer 앱 — WebView-first 구매자 앱 (Phase 3 피벗)

`apps/web-buyer`는 일반 구매자용 화면을 위한 **웹 앱**이다 (Vite + React 19 +
TanStack Router, file-based routing, `localhost:5175`). web-seller/web-admin과
동일한 스캐폴딩 패턴을 그대로 따른다 (`pnpm --filter web-buyer dev` /
`generate-routes` / `typecheck` 등). 모바일 브라우저에서 단독으로도 동작하고,
추후 얇은 네이티브 WebView 셸 안에 그대로 얹혀도 동작하도록 설계되었다 —
**단, 이 배치에서 네이티브 WebView 셸 자체는 만들지 않았다.** 앱스토어 배포,
푸시 알림, 딥링크, 네이티브 브릿지는 명시적으로 이후 배치의 범위다.

**`apps/mobile`의 기존 온보딩 3종 네이티브 화면은 이제 superseded(대체됨)다.**
`app/onboarding/{login,terms,nickname}.tsx` + `features/onboarding/*`는
`phase2-wave1-preserved` 브랜치에 그대로 보존되어 있지만, **더 이상 확장 대상이
아니다** — 구매자 온보딩의 정본(canonical)은 이제 `apps/web-buyer/src/routes/
onboarding/*.tsx`다. 네이티브 온보딩 화면에 새 기능을 추가하거나 버그를
고치는 대신, web-buyer 쪽 라우트를 수정할 것.

**93개 화면 매핑 리포트(로컬 경로 `firstmate/data/route-remap-v2-q8w/
report.md`, 리포 외부라 링크 없음)는 이제 "개념적 화면 인벤토리"로만 읽을
것.** 각 화면의 존재 여부·목적·(리포에 적힌) 컴포넌트 열은 참고하되, 리포가
명시한 네이티브 라우트/네이티브 컴포넌트 조합을 그대로 따르면 안 된다 —
타겟은 항상 `apps/web-buyer`의 웹 라우트 + `@aechak/design-system/web`
컴포넌트다. 예: 리포는 b2-st-1(소셜 로그인)의 컴포넌트로 "Button,
BottomBar(as BottomFixedAction), Toast"를 적어두었는데, 이는 네이티브
`BottomBar`가 아니라 아래 웹 `BottomFixedAction`으로 치환해서 구현했다.

### 모바일-웹 레이아웃 파운데이션

`packages/design-system/src/web/`에 웹 컴포넌트와 나란히 추가된, 모바일
브라우저·WebView 공통 레이아웃 프리미티브:

- **`MobileScreen`** (`components/MobileScreen.tsx`) — `header`/`footer`/
  `children` 슬롯을 받는 앱셸형 레이아웃. 바깥 컨테이너는 `overflow-hidden` +
  `useVisualViewportHeight()`로 계산한 높이를 가지며 스크롤되지 않고,
  `children`(content 슬롯)만 `overflow-y-auto`로 독립 스크롤된다 — 이것이
  "sticky header + 독립 스크롤 content" 패턴의 구현 방식이다 (position:sticky
  트릭이 아니라 flex 컬럼 안에서 header/footer는 flex-none, content만
  flex-1). `header`/`footer`를 안 넘기면 그 자리의 safe-area padding을
  content 쪽이 대신 짊어진다.
- **`useVisualViewportHeight`** (`hooks/useVisualViewportHeight.ts`) —
  `window.visualViewport.resize` 이벤트를 구독해 `MobileScreen`의 높이를 실제
  보이는 영역에 맞춘다. **키보드 겹침 방지의 핵심 메커니즘**: `100dvh`는 iOS
  Safari에서 온스크린 키보드가 떠도 줄어들지 않으므로, `position:fixed`로 만든
  하단바가 키보드에 가려질 수 있다. 대신 컨테이너 자체 높이를
  `visualViewport.height`에 맞춰 줄이면 flex-column 안의 footer(하단 CTA)가
  항상 "줄어든 화면의 맨 아래"에 위치해 키보드 위에 자연히 떠 있게 된다 —
  별도의 스크롤-포커스 로직 없이 이 방식만으로 해결된다. (직접 검증: 브라우저
  devtools에서 `visualViewport.height`를 강제로 줄이고 resize 이벤트를
  dispatch하면 `MobileScreen`과 그 안의 하단 CTA가 즉시 줄어든 높이에 맞춰
  재배치되는 것을 확인함.)
- **`BottomFixedAction`** (`components/BottomFixedAction.tsx`) — 리포의
  "BottomFixedAction" 표기와 이름을 맞춘 하단 고정 CTA 바 (`primary`/
  `secondary` 액션, `calc(12px + env(safe-area-inset-bottom))` 패딩). `sticky
  bottom-0`도 걸려 있어 `MobileScreen`의 footer 슬롯 밖에서 일반 스크롤
  페이지에 단독으로 써도 화면 하단에 붙는다.
- **`StepProgress`** (`components/StepProgress.tsx`) — 네이티브
  `StepProgress`와 동일한 `{ current, total }` API를 가진 웹 버전 (온보딩
  진행 바 등에 사용). 네이티브/웹 컴포넌트 짝을 맞추는 기존 관례를 그대로
  따른 것.
- **safe-area 컨벤션**: 네이티브의 `topInset`/`bottomInset` prop 주입 대신,
  웹에서는 CSS `env(safe-area-inset-*)`를 직접 쓴다. **이게 동작하려면 앱의
  `index.html`의 viewport meta에 `viewport-fit=cover`가 반드시 있어야 한다**
  (`apps/web-buyer/index.html` 참고, `interactive-widget=resizes-content`도
  같이 넣어 Chrome 계열에서 키보드가 레이아웃 뷰포트를 실제로 줄이도록 함).
- **호버 전용 상호작용 금지**: 모바일에는 hover가 없으므로, 새 인터랙션은 항상
  탭/클릭만으로 완결되어야 한다. 리스트 항목의 넓은 탭 영역이 필요하면
  `<Checkbox>` 같은 컴포넌트를 큰 `<label>`로 감싸지 말 것 — 그 컴포넌트가
  이미 자체 `<label>`(자체 클릭 영역)을 갖고 있으면 중첩 라벨이 되어 탭 시
  토글이 두 번 발생해 상쇄되는 버그가 생긴다 (`onboarding/terms.tsx`의 약관
  행처럼, 체크박스와 별도의 `<button>` 텍스트 영역을 형제로 두고 각각
  독립적으로 같은 토글 함수를 호출하는 방식으로 피할 것).

**주의 (디자인 시스템 `Toast` 컴포넌트):** 웹 `Toast`는 `position:fixed
bottom-6 left-1/2 -translate-x-1/2`로 **스스로 위치를 잡는다** — 부모에
`absolute`/`relative` 래퍼를 씌워 위치를 바꾸려 해도 무시되고 항상 화면 하단
중앙에 뜬다. 하단 CTA 바가 있는 화면에서 겹칠 수 있으니(로그인 화면처럼 하단
버튼 묶음이 클 때 실제로 겹쳤던 사례 있음), 겹침이 걱정되면 `Toast` 자체를
고치기보다 화면 쪽에서 실패 메시지를 다른 위치(예: 상단)에 인라인으로
보여주는 식으로 설계할 것 — `Toast`는 web-seller/web-admin에서도 동일하게
동작하므로 앱 하나만을 위해 이 공용 컴포넌트의 포지셔닝을 바꾸지 말 것.

---

## 리포 구조

```
apps/
  web-seller/   셀러 어드민 (Vite + React 19 + TanStack Router, localhost:5173)
  web-admin/    플랫폼 어드민 (Vite + React 19 + TanStack Router, localhost:5174)
  web-buyer/    구매자 웹앱 (Vite + React 19 + TanStack Router, localhost:5175)
  mobile/       앱 (Expo 53 + React Native + Expo Router; 온보딩 3종은 web-buyer로 대체됨)

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

| 상태 종류                                    | 도구                | 파일 위치                |
| -------------------------------------------- | ------------------- | ------------------------ |
| API 데이터, 캐시, refetch, optimistic update | TanStack Query      | `feature/xxx.queries.ts` |
| 모달/탭/사이드바 등 전역 UI 상태             | Zustand             | `feature/xxx.store.ts`   |
| 컴포넌트 내부 폼·토글 등                     | useState/useReducer | 컴포넌트 내부            |

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

| type       | 사용 시점                                        |
| ---------- | ------------------------------------------------ |
| `feat`     | 새 기능 추가                                     |
| `fix`      | 버그 수정                                        |
| `chore`    | 빌드·설정·의존성 등 프로덕션 코드 변경 없는 작업 |
| `refactor` | 동작 변경 없는 코드 구조 개선                    |
| `test`     | 테스트 추가·수정                                 |
| `docs`     | 문서만 변경                                      |
| `style`    | 포맷·공백 등 코드 의미 변경 없는 수정            |

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

**알려진 이슈 (2026-07-04 기준):** `pnpm openapi:generate:check`가 `packages/api`에서
실패할 수 있음 — `@tanstack/react-query`가 lockfile상 커밋된
`packages/api/src/generated/api.ts`보다 새 버전으로 install되어 orval이 다른 타입
시그니처(`DataTag`, `QueryClient` 파라미터 등)를 생성하기 때문. OpenAPI 스펙 변경과
무관하게 재현되므로, 이 게이트가 실패해도 `typecheck`/`lint`/`test` 3종만 통과했다면
Phase 1 관련 회귀는 아님 — `@tanstack/react-query` 버전 고정 또는 `packages/api`
재생성으로 별도 해결 필요.

---

## 개발 명령어

```bash
# 개별 앱 실행
pnpm --filter web-seller dev      # 셀러 어드민 (localhost:5173)
pnpm --filter web-admin dev       # 플랫폼 어드민 (localhost:5174)
pnpm --filter web-buyer dev       # 구매자 웹앱 (localhost:5175)
pnpm --filter mobile start        # Expo Metro 번들러

# 전체 빌드·검증 (Turborepo)
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# API 코드 생성
cd packages/api && pnpm openapi:generate

# 라우트 추가 후 (web-seller / web-admin / web-buyer)
# vite dev 서버가 실행 중이면 자동 재생성.
# 실행 중이 아닐 때 package.json의 generate-routes 스크립트(node
# scripts/generate-routes.cjs)는 standalone으로 실행해도 실제로 파일을
# 갱신하지 않는다 — @tanstack/router-vite-plugin의 tanstackRouterGenerator는
# Vite 플러그인 인스턴스만 반환할 뿐 그 자체로 생성 로직을 실행하지 않기
# 때문(3개 웹앱 모두 동일 증상, pre-existing). routeTree.gen.ts를 실제로
# 갱신하려면 `pnpm --filter <app> dev`를 잠깐 띄우거나 `vite build`를 한 번
# 돌릴 것.
pnpm --filter web-seller generate-routes
pnpm --filter web-admin generate-routes
pnpm --filter web-buyer generate-routes
# routeTree.gen.ts 는 커밋 대상 (CI typecheck 위해)
```

---

## 디자인 시스템 수정 시

- 토큰 수정: `packages/design-system/src/tokens.ts`만 편집
- 웹 Tailwind 테마: `packages/design-system/src/web/tailwind-theme.ts`
- 모바일 RN 테마: `packages/design-system/src/native/theme.ts`
- `packages/config/tailwind/preset.js`는 공유 Tailwind 기본값 (토큰 미포함)

**라이트 모드 `surface.hover`(`packages/design-system/src/tokens.ts`)가 한때 `surface.sunken`과
동일한 `#F4F2EE`였다** — `DataTable` 헤더 행이 `bg-surface-sunken`, 행 hover가
`hover:bg-surface-hover`를 쓰기 때문에 행에 마우스를 올리면 헤더와 완전히 같은 색이 되는
버그가 있었다. `#ECE9E3`(같은 베이지 계열에서 한 단계 더 어둡게)로 고쳐 구분되게 함 — 다크
모드 `surface.hover`(`#2A2823`)는 이미 `sunken`(`#100F0C`)과 달라 손대지 않았다. 토큰을 다시
건드릴 일이 있으면 `sunken`과 `hover`가 우연히 같은 값이 되지 않는지 확인할 것.

---

## 모바일(Expo) 앱 셋업 관련 주의사항

`apps/mobile`에서 `@aechak/design-system/native`를 처음 소비하거나 새 네이티브
의존성을 추가할 때 아래 사항을 미리 알아두면 시간을 아낄 수 있음 (5-tab 셸
작업 중 실제로 겪은 문제들):

1. **`packages/config/tsconfig/react-native.json`은 `moduleResolution: "bundler"`
   여야 함.** `"node"`(classic)로는 `@aechak/design-system`의 `package.json
   exports` 서브패스(`/web`, `/native`)를 해석하지 못해
   `Cannot find module '@aechak/design-system/native'` 에러 발생. `noEmit:
   true`라 실제 트랜스파일은 Babel/Metro가 담당하므로 `module: "ESNext"` +
   `moduleResolution: "bundler"`로 바꿔도 런타임에 영향 없음 (design-system
   자체 tsconfig와 동일한 설정).
2. **`@types/react` 버전은 워크스페이스 전체(모든 앱 + design-system)에서
   반드시 동일하게 맞출 것.** `packages/design-system`가 raw `.ts` 소스를
   그대로 export하므로, 이를 import하는 앱과 design-system의 `@types/react`
   버전이 다르면(`ReactNode`/`ReactPortal` 구조가 미묘하게 달라짐)
   `'Text' cannot be used as a JSX component` 류의 타입 에러가 발생함.
   web-seller/web-admin이 `^19.1.0`(→`19.2.x`)을 쓰므로 `apps/mobile`과
   `packages/design-system`의 devDependency도 동일하게 `^19.1.0`으로 맞춰야
   함 — `@types/react`는 타입 전용 패키지라 실제 `react` 런타임 버전(RN 쪽은
   `19.0.0` 고정)과 굳이 일치할 필요는 없고, 실제로 mobile을 `^19.1.0`으로
   올려도 typecheck가 깨지지 않음. 반대로 design-system을 mobile 쪽 좁은
   범위(`~19.0.0`)에 맞추면 이번엔 web 앱들이 새로 도입한 JSX 타입
   컴포넌트(SideNav 등)에서 동일한 에러가 재발하므로, 워크스페이스 전체를
   "더 넓은/최신" 쪽으로 통일하는 것이 정답.
3. **pnpm strict node_modules 환경이라 transitive 의존성은 직접 import 불가.**
   `expo`/`expo-router`/`nativewind`가 내부적으로 의존하는 패키지
   (`@expo/vector-icons`, `@react-navigation/bottom-tabs`, `react-native-css-
   interop` 등)를 앱 코드에서 직접 import하려면 `apps/mobile/package.json`에
   명시적으로 추가해야 함. lockfile에 이미 해당 버전이 존재하면 새 네트워크
   fetch 없이 `pnpm install`만으로 링크됨.
4. **`babel.config.js`에서 `nativewind/babel`은 `presets`에 넣어야 함
   (`plugins` 아님).** `nativewind/babel`은 `{ plugins: [...] }`를 반환하는
   Babel *preset* 형태라서 `plugins` 배열에 넣으면 Metro 번들링 시
   `.plugins is not a valid Plugin property` 에러 발생.
5. **transitive 네이티브 패키지 버전은 Expo SDK가 기대하는 버전과 다를 수
   있음.** 예: `react-native-screens`가 apps/mobile에 직접 선언되어 있지
   않으면 pnpm이 Expo SDK 호환 범위(`node_modules/expo/bundledNative
   Modules.json` 참고, SDK 53 기준 `~4.11.1`) 밖의 최신 버전을 resolve해서
   Fabric codegen 파싱 에러(`Unknown prop type for "..."`)가 날 수 있음 →
   해당 파일의 `bundledNativeModules.json` 버전으로 직접 pin.
6. **PR 게이트(`typecheck`/`lint`/`test`/`openapi:generate:check`)는 Metro
   번들링을 검증하지 않음.** 위 문제들은 게이트를 다 통과해도 실제 앱 실행 시
   드러날 수 있으므로, 모바일 네이티브 관련 변경 후에는 `pnpm --filter mobile
   start`로 Metro를 띄우고 `curl http://localhost:8081/` → manifest의
   `launchAsset.url`을 다시 `curl`해서 실제 번들이 200으로 컴파일되는지
   확인할 것 (시뮬레이터 없이도 가능한 최소 검증).

---

## 금지 사항 요약

| 금지                                    | 이유                                    |
| --------------------------------------- | --------------------------------------- |
| feature → feature 직접 import           | 경계 위반, lint 에러                    |
| domain에서 React/UI import              | 순수성 파괴                             |
| `packages/api/src/generated/` 직접 편집 | generate 시 덮어씌워짐                  |
| API 응답을 Zustand에 저장               | TanStack Query와 중복, 캐시 무효화 문제 |
| `localStorage`에 accessToken 저장       | XSS 취약점                              |
