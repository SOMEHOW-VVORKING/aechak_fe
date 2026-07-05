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

`src/routes/<segment>/index.tsx` 형태(디렉터리 + index)로 라우트를 추가하면
TanStack Router가 `/<segment>/`로 등록한다 (`/<segment>` 단일 파일과 동일하게
동작하며 `AppShell`의 `activeKey`/`onSelect` 문자열과도 그대로 매칭됨). 라우트
파일을 추가한 뒤에는 `routeTree.gen.ts`가 갱신돼야 `tsc -b`가 새 라우트를 인식한다
— 위에 적힌 대로 `generate-routes.cjs` standalone 실행은 실제로 파일을 갱신하지
않으므로, `pnpm --filter web-seller dev`를 잠깐 띄우거나 `pnpm vite build`를 한 번
돌려서 `routeTree.gen.ts`를 실제로 갱신하고 커밋할 것 (안 하면 `pnpm typecheck`가
새 라우트에서 임포트한 타입을 못 찾아 실패한다).

**`packages/domain`의 `Product`/`Order` 타입은 Batch 5(상품/주문/클레임 관리,
`b5-st-3`/`b5-st-5`/`b5-st-6`)가 처음으로 실제 소비했다.** 그 전까지는 `auth`
기능만 `User` 타입을 썼고 `Product`/`Order`는 어느 앱에서도 import되지 않는
플레이스홀더였다 — 그래서 이 배치에서 셀러 어드민 화면 요구사항(판매 상태·검수
상태 분리, 구매자/수령자/운송장 정보 등)에 맞춰 필드를 상당히 재구성했고, 클레임
전용 `Claim` 타입도 새로 추가했다 (`packages/domain/src/types/index.ts`, barrel은
`packages/domain/src/index.ts`에서 재수출 — 새 타입 추가 시 barrel도 같이
갱신해야 다른 앱에서 "no exported member" 에러가 안 남). 이후 배치(web-admin의
셀러/회원 관리, web-buyer의 상품 목록 등)에서 같은 도메인 개념을 다룰 때는 이
타입들을 그대로 재사용하거나 신중하게 확장할 것 — 임의로 새 로컬 타입을 다시
만들지 말 것.

## web-seller 취소/반품/교환(클레임) 화면 — 확인 Modal 패턴

`apps/web-seller/src/features/claims/`의 파괴적/되돌리기 어려운 클레임 액션(환불 확정,
취소 승인/거부)은 모두 즉시 mutate하지 않고 확인 `Modal`을 거친다. `RefundConfirmModal`
(환불 확정)과 `ClaimActionConfirmModal`(취소/반품/교환 승인·거부, `target: { claim,
action: 'approve' | 'reject' } | null` state)이 같은 패턴 — "claim-target state를
`routes/claims/index.tsx`가 소유 → 액션 버튼은 mutate 대신 setState로 타겟만 지정 →
Modal 컴포넌트가 `claim`이 있을 때만 조건부 렌더링 → 확인 시에만 실제 mutate 호출".
새 클레임 액션에 확인 단계가 필요하면 이 패턴을 따를 것.

**주의:** 확인 Modal이 자체 `useMutation` 훅 인스턴스를 새로 만들지 말 것.
`routes/claims/index.tsx`의 `isMutating`(`approveClaim.isPending || rejectClaim.isPending`)은
`ClaimsTable`에 전달되어 승인 대기 중인 다른 행의 버튼을 비활성화하는 데도 쓰인다 —
모달이 별도 훅 인스턴스로 mutate하면 `isMutating`이 모달의 실제 mutation 상태를
반영하지 못해 이 비활성화 로직이 깨진다. `ClaimActionConfirmModal`은 그래서 `claim`
자체가 아니라 mutate 트리거(`onConfirm`)와 `loading` 상태를 prop으로 받는다
(`RefundConfirmModal`처럼 컴포넌트 내부에서 자체 훅을 호출하지 않음).

`StatusPill` 아래 보조 텍스트(예: 클레임 유형·사유 컬럼의 사유, 주문 상태 컬럼의
송장/자동확정일)를 붙일 때는 `pl-2.5`로 pill의 내부 텍스트(`px-2.5` 패딩)와 좌측을
맞추고 `mt-1.5` 이상으로 여백을 줄 것 — pill 바깥 테두리에 그냥 맞추면(패딩 없이) 보조
텍스트가 pill의 아이콘/테두리 쪽으로 치우쳐 보여 어색하다.

## web-seller 사용자 노출 문구(카피) 컨벤션

캡틴 요청으로 진행한 카피 감사(copy audit)에서 확립된 규칙 — 새 화면/문구 작성 시 그대로 적용할 것.

- **가운뎃점(`·`)을 구분자로 쓰지 말 것.** 이 앱은 이미 `/`를 지배적 구분자로 쓰고 있었다
  (`주문/배송 관리`, `취소/반품/교환`, `정산/매출`, `주문번호 / 상품` 등) — `·`가 섞여 있던
  기존 문구(컬럼 라벨 `구매자 · 수령자`/`유형 · 사유`/`귀책 · 배송비`, placeholder
  `상품명 · 상품번호 검색`/`주문번호 · 수령자명`, 클레임 화면 안내 문장의 `반품·교환`/`정산·환불`,
  mock 데이터의 카테고리(`고양이 · 급식기` 등)·클레임 사유(`단순 변심 · 배송 전` 등)·반려
  사유(`효능·효과`))를 전부 `/`로 통일했다 — 단 상품명+수량 표기(`orders.mock.ts`)만 예외로
  `상품명 · 1개` 대신 `상품명 (1개)` 괄호 표기를 썼다(수량은 대등한 두 항목의 나열이 아니라
  수식이라 `/`보다 괄호가 자연스러움). 새 문구에서 대등한 두 항목을 나란히 보여줄 때는 `/`를
  기본으로 쓸 것.
- **앱 전체 어조는 -해요체(구어체)이며 -습니다/-됩니다 같은 격식체를 섞지 말 것.** 유일하게
  섞여 있던 `orders/components/ShipmentModal.tsx`의 Alert 문구("...변경되고 ... 발송됩니다")를
  "...바뀌고 ... 알림이 가요"로 고쳐 나머지 화면(`RefundConfirmModal`, `ClaimActionConfirmModal`,
  `OrdersTable`의 오류 메시지 등)과 어조를 맞췄다. 새 안내/에러/확인 문구를 쓸 때 -습니다체가
  나오면 회귀 신호로 볼 것.
- 큰따옴표(`""`)/작은따옴표(`''`)를 직접 인용 부호로 쓰지 않는다(현재 0건, 유지할 것) — 강조가
  필요하면 `<strong>`처럼 마크업을 쓰거나 그냥 풀어 쓸 것.

---

## web-admin 앱 셸

`apps/web-admin/src/routes/__root.tsx`는 (web-seller의 별도 `AppShell.tsx`와 달리)
`AdminShell` 컴포넌트를 루트 라우트 안에 직접 정의해 `SideNav` + `<Outlet />`을 조립한다.
14개 운영 화면(대시보드/셀러 입점 심사·관리/회원 관리/상품 검수·AI 큐/신고·문의/주문·클레임/
리뷰/채팅 모니터링/공지/액션 로그) + 6개 확장 화면(배너/카테고리/정산/계정 권한/통계/세금 신고)의
라우트 경로·아이콘·그룹이 이미 정의돼 있다. **새 어드민 화면 라우트를 추가할 때 셸을 다시 만들지
말 것** — `src/routes/`에 해당 경로 파일만 추가하면 `AdminShell`이 활성 탭 하이라이트를 처리한다.

## web-admin 심사/관리 화면 — 공유 Drawer/Modal 패턴 (b9-st-2~6)

셀러 입점 심사(`sellers/applications.tsx`)/셀러 관리(`sellers/index.tsx`)/회원 관리
(`members.tsx`)/상품 검수(`products/review.tsx`)/AI 검수 큐(`products/ai-queue.tsx`) 5개
화면은 모두 "목록 `DataTable` → 행 클릭 시 상세 `Drawer` → 파괴적 액션은 확인 `Modal`"이라는
동일한 구조를 공유한다. 매번 새로 만들지 말고 `apps/web-admin/src/shared/components/`의
다음 프리미티브를 재사용할 것 (`sellers/applications.tsx`가 이 패턴을 처음 적용한 템플릿):

- **`DetailField`** — 드로어 필드 레이블 + `visibility` prop(`'visible-to-user'`는 눈
  아이콘+"사용자 노출", `'internal-only'`는 자물쇠 아이콘+"비공개"). 모든 화면에 "셀러 안내
  내용"(공개) vs "내부 메모"(비공개) 쌍으로 반복되는 패턴.
- **`SummaryGrid`** — 드로어 상단 요약 카드의 2열 label/value grid. Modal의 상세 정보
  (대상/사유/기간 등)에도 그대로 재사용 가능.
- **`DrawerSummaryCard`** — sunken 배경 + pill 묶음 + `SummaryGrid`(또는 임의 children)을
  감싸는 드로어 상단 요약 카드 래퍼.
- **`HistoryList`** — `{label, date}[]` 이력 목록(제재 이력/신고 이력 등)을 sunken border
  목록으로 렌더링.
- **`DecisionRadioGroup`** — "심사 결과"/"계정 상태"/"검수 결과" 같은 결정 라디오 카드 목록.
  **주의**: 디자인 시스템 `Radio`는 자체적으로 `<label>`로 렌더링되므로, 바깥 행을 또
  `<label>`로 감싸면 안 된다 — Checkbox 중첩 라벨 토글 상쇄 버그와 같은 문제가 생길 수 있어
  바깥 행은 `<div onClick>`으로만 감쌌다(라디오는 이미 선택된 값으로 또 onChange가 와도
  멱등이라 안전하지만, 안전을 위해 라벨 중첩 자체를 피함).
- **`ActorTag`** — "AI 자동" vs "관리자" 처리 주체 태그. `products/review.tsx`,
  `products/ai-queue.tsx`에서 공유.

확인 `Modal` 패턴(판매정지/영구정지/판매중지/강제삭제)은 모두 동일 구조: 드로어에서 위험
액션 버튼 클릭 시 로컬 `confirmOpen` state로 `Modal`을 열고, `title`은 "~할까요?" 질문형,
`description`은 1~2문장 결과 설명, `children`에 `SummaryGrid`로 대상/사유 등 상세, 취소는
항상 `Modal` 기본 취소 버튼, 확정은 `confirmVariant="danger"` + 실제 액션 라벨.

**`DecisionRadioGroup`으로 여러 결정 옵션(승인/반려/보완요청 등)을 받는 화면은 액션 버튼을
옵션 개수만큼 늘어놓지 말고 단일 "제출" 버튼 + 선택된 `decision`에 따라 내용이 바뀌는 확인
`Modal` 하나로 처리할 것** (`sellers/applications.tsx`, `products/ai-queue.tsx`, `members.tsx`가
이 패턴).
`decision` 값 → `{ title, description, confirmLabel, confirmVariant, nextStatus, message }`를
매핑하는 로컬 `Record`를 만들고, "제출" 버튼은 `setConfirmOpen(true)`만 호출, `Modal`의
`onConfirm`에서 그 매핑을 읽어 기존 `applyDecision`/`applyStatus(nextStatus, message)`를
그대로 재사용한다 — 되돌리기 쉬운 결정(예: 입점 심사의 승인)도 실수 클릭 방지를 위해 확인
모달을 거치는 쪽으로 통일했다(과거에는 "신청 단계라 되돌리기 쉬움"을 이유로 확인 모달 없이
버튼 3개를 바로 노출했었으나 폐기됨). 파괴적이지 않은 결정은 `confirmVariant="primary"`,
파괴적/비가역 결정(반려·삭제 등)은 `"danger"`로 구분.

`members.tsx`는 `decision` state 자체가 이미 `MemberAccountStatus`라서(별도의
'approve'/'reject' 같은 문자열 키가 아니라 상태값 그대로) `decisionModalMeta`를
`Record<MemberAccountStatus, {...}>`로 바로 선언하고 `nextStatus`/`message` 필드 없이
`onConfirm={() => applyStatus(decision)}`만 쓰면 된다 — `applyStatus`가 이미 상태별 토스트
메시지를 만들어주므로 메시지 매핑을 중복 선언하지 않았다. **주의**: `MemberAccountStatus`는
`DecisionRadioGroup` 옵션에 없는 `withdrawing`(탈퇴 처리)까지 포함해 5개 값이라
`Record<MemberAccountStatus, ...>`는 `withdrawing` 키도 반드시 채워야 `tsc`가 통과한다 —
`openDrawer`가 `decision`을 `row.accountStatus`로 초기화하므로 이미 탈퇴 처리된 회원의
드로어를 열었다가 그대로 제출하면 `withdrawing` 분기가 실제로 도달 가능하다.

**`StatusPill`의 `variant`는 문서(`web-components.md`)에 한때 6종만 적혀 있었지만 실제
컴포넌트 소스에는 `danger`/`accent`/`muted`까지 9종이 있다** — prop 타입 확인 시 문서보다
`packages/design-system/src/web/components/StatusPill.tsx`를 직접 열어 최신 union을 볼
것. 이 배치에서 `muted`(휴업/퇴점/자동 블라인드/탈퇴 처리 등 옅은 비활성 상태)와
`danger`(판매정지/영구정지/강제삭제 등 되돌리기 어려운 제재)를 구분해 쓰면서 발견해 문서를
갱신했다.

**`muted`를 대등한 카테고리 쌍(peer option) 중 한쪽에만 쓰지 말 것** —
`sellers/applications.tsx`의 판매자 유형 컬럼이 원래 사업자=`neutral`/개인=`muted`였는데,
`muted`는 위 문단처럼 "비활성 상태" 전용이라 개인 판매자가 사업자보다 흐릿하고 덜 강조되어
보이는 시각적 불균형이 생겼다(캡틴 피드백으로 발견). 사업자/개인처럼 단순히 다른 값이지
한쪽이 비활성 상태인 게 아닌 경우, 두 pill은 `neutral`+`info`처럼 시각적 무게(테두리·텍스트
대비)가 같은 variant 조합을 쓸 것 — `muted`는 오직 실제로 비활성/휴면 상태를 나타낼 때만.
**동일한 버그가 `sellers/index.tsx`에도 독립적으로 존재해**(테이블의 `sellerType` 컬럼 +
드로어 요약 pill 2곳) 이번 배치에서 같이 `muted` → `info`로 고쳤다 — 같은 사업자/개인 pill을
새 화면에 또 추가할 일이 있으면 처음부터 `neutral`+`info`로 시작할 것.

**5개 web-admin 심사/관리 화면의 상세 `Drawer` width는 `md`가 아니라 `lg`(480px)를 쓴다** —
`md`(384px)로는 `SummaryGrid`·`DecisionRadioGroup`·`Textarea` 등이 좁아 보인다는 피드백으로
전환됨. 이 5개 화면 계열에 새 드로어를 추가할 때는 `lg`를 기본값으로 볼 것.

### web-admin 심사/관리 5종 — 감사에서 발견한 알려진 격차 (수정 보류)

Phase 2 wave 2 사전 커밋 감사(`fm/phase2-wave2-audit-r5t`)에서 확인했지만, 위험도/범위
대비 이번 배치에서 고치지 않고 다음 배치를 위해 남겨둔 항목들:

- **`SellerAccount`/`MemberAccount`/`ProductReviewItem`이 기존 `Seller`/`User`/`Product`를
  확장하지 않고 병렬 타입으로 새로 생겼다** (`packages/domain/src/types/index.ts`). 특히
  `ProductReviewItem.saleStatus: ProductReviewSaleStatus`(`'on-sale' | 'suspended' |
  'pending-review' | 'rejected'`)와 `Product.status: ProductSaleStatus`(`'selling' |
  'sold_out' | ...`)는 이름 충돌은 이미 고쳐졌지만(51368ae) 여전히 같은 개념("이 상품이
  판매 노출 중인가")을 서로 다른 어휘로 모델링한다 — web-buyer가 나중에 상품 판매 상태를
  다뤄야 할 때 두 enum 중 무엇을 봐야 하는지 혼란이 생길 수 있다. 이번 감사에서는 타입
  구조 자체를 병합하는 건 이 배치 3개 앱(web-seller 상품/주문/클레임 + web-admin 검수 5종)
  전반을 건드리는 리스크가 커서 보류했다 — 다음 배치에서 `Product`/`Seller`/`User`를
  확장하는 형태로 재구성 검토할 것.
- **`products/review.tsx`의 검수 결과 `DecisionRadioGroup`(통과/반려 2옵션)이 실제 액션
  버튼(검수 통과/블라인드 유지/판매 중지 3개) 중 어느 것과도 "반려"가 매칭되지 않는다** —
  `saleStatus: 'rejected'`가 필터 옵션·mock 데이터에는 존재하는데 이 화면에서 상품을
  `rejected`로 전환하는 버튼이 없다. `sellers/applications.tsx`(승인/반려/보완요청 3옵션이
  버튼 3개와 1:1 대응)나 `members.tsx`(`decision` state를 `handleApply`가 그대로
  읽어 반영)가 올바른 참조 패턴이니, "반려" 액션을 추가할 때 그쪽 구조를 따를 것. 어떤
  결과 문구·재고 처리를 반려에 붙일지는 제품 결정이 필요해 이번 감사에서는 구현하지 않음.
- **5개 화면 모두 `useQuery` 데이터를 `rows/setRows` + `useEffect`로 로컬 state에
  한 번 복사해 mutate하는 패턴**(`applications.tsx`/`sellers/index.tsx`/`members.tsx`/
  `review.tsx`/`ai-queue.tsx`)을 쓴다. 반면 같은 배치의 web-seller
  `claims.queries.ts`/`claims.mock.ts`는 mock 배열을 직접 mutate하는 `mockApproveClaim`
  류 함수 + `useMutation` + `queryClient.invalidateQueries`로 더 정석적인 TanStack Query
  패턴을 쓴다. web-admin 5종도 다음에 손댈 때 이 web-seller 패턴을 참고해 전환할 것 — 이번
  감사에서는 5개 파일 × mock/queries/route 전체를 건드리는 리스크 대비 실익(마운트 시
  렌더 1회 추가 정도)이 작아 그대로 두었다.
- **`review.tsx`의 상세 드로어 요약(썸네일+제목+판매정보)은 다른 4개 화면과 달리
  `DrawerSummaryCard`를 쓰지 않고 손으로 레이아웃했다** — 이미지 썸네일이 있는 유일한
  화면이라 "pills 먼저, 나머지 내용은 아래" 구조인 `DrawerSummaryCard`에 억지로 끼워맞추면
  시각적으로 어색해질 수 있어 의도적으로 남겨뒀다. 이 화면만 정말 레이아웃이 다르다고
  판단되면 그대로 두고, 아니라면 `DrawerSummaryCard`에 `leading` 슬롯을 추가하는 방향으로
  검토할 것.

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

### 5-tab 앱 셸 (홈/마켓/SNS/채팅/마이)

`apps/mobile/app/(tabs)/_layout.tsx`(네이티브 `TabBar` + Expo Router `Tabs`)를
web-buyer로 변환한 결과물. web-seller/web-admin의 `AppShell`과 달리 별도 파일에
셸 컴포넌트를 두지 않고, TanStack Router의 **pathless layout route**
(`apps/web-buyer/src/routes/_tabs.tsx`, 파일명 `_` 접두사 — URL 세그먼트를
차지하지 않는 레이아웃 라우트)로 구현했다. 5개 탭 루트 라우트
(`_tabs/index.tsx` → `/`, `_tabs/market.tsx` → `/market`, `_tabs/sns.tsx` →
`/sns`, `_tabs/chat.tsx` → `/chat`, `_tabs/mypage.tsx` → `/mypage`)는 모두
`_tabs.tsx`의 자식이라 자동으로 하단 탭바를 공유한다. **새 셀러/어드민 앱과
달리 web-buyer의 루트 `/`는 이제 온보딩으로 리다이렉트하지 않고 홈 탭
placeholder를 직접 렌더링한다** — "첫 방문자만 온보딩으로 보내는" 인증 체크는
아직 구현되지 않은 별도(Phase 2) 범위다.

`onboarding/*.tsx` 라우트들은 `_tabs.tsx`의 자식이 아니라 `__root`에 직접
매달려 있으므로 탭바가 뜨지 않는다 — 온보딩 화면에 탭바가 보이면 그 라우트
파일이 실수로 `_tabs/` 디렉터리 밑에 들어간 것이니 위치를 확인할 것.

디자인 시스템에 새로 추가된 웹 `TabBar`(`packages/design-system/src/web/
components/TabBar.tsx`)는 네이티브 `TabBar`와 달리 `icon`이 `(isActive) =>
ReactNode` 렌더 프롭이 아니라 `ReactNode` 직접 전달 — lucide-react는 액티브
전용 별도 글리프가 없어 색상만 바꾸면 충분하기 때문. 라우팅도 컴포넌트가
직접 하지 않고 `onSelect(key)`만 호출 — 탭 전환은 `_tabs.tsx`가
`useNavigate()`로 수행 (SideNav/AppShell과 동일 컨벤션). `MobileScreen`의
`footer` 슬롯에 넣어 `BottomFixedAction`과 동일한 `env(safe-area-inset-
bottom)` 패딩 컨벤션을 공유한다.

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
