# web-seller · web-admin · 디자인시스템 · 모바일 구현 이력 (온디맨드 참고)

AGENTS.md에서 분리한 web-seller/web-admin 화면별 배치 구현 이력, 공용 디자인시스템 함정의 발견 서사, 모바일(Expo) 셋업 노트. 상시 로드되지 않으며 필요할 때만 참고한다. 상시 규칙·재사용 함정은 루트 `AGENTS.md`에 있다.

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

---

## 웹 디자인시스템 입력 컴포넌트 — 호출부 `className`은 반드시 병합(append)할 것

`SelectHTMLAttributes`/`TextareaHTMLAttributes` 등 네이티브 HTML attribute 인터페이스를
확장하는 웹 컴포넌트는 `className`을 구조분해하지 않으면 호출부가 넘긴 `className`이
`...props`에 그대로 담겨 JSX상 컴포넌트 내부 `className={...}` **뒤에** spread된다 —
React/JSX는 같은 엘리먼트에 동일 prop이 두 번 나오면 나중 것이 이긴다. 그 결과 호출부의
`className`이 컴포넌트가 공들여 만든 내부 스타일(`appearance-none`, 높이, 테두리 등)을
통째로 덮어써 버린다.

**실제로 `Select.tsx`가 이 버그였다** — `apps/web-seller/.../DashboardPage.tsx`가 기간
선택기에 `<Select ... className="w-[140px]" />`를 넘기자 `appearance-none`이 지워져
브라우저 네이티브 select 화살표가 되살아나고, 컴포넌트가 그리는 커스텀 SVG 셰브런과 겹쳐
화살표가 2개로 보이는 디자인 깨짐이 발생했다(캡틴이 직접 리포트). 감사 결과 `Textarea.tsx`도
동일한 구조(구조분해 없이 `{...props}`가 내부 `<textarea>`의 `className` 뒤에 옴)라 같은
버그를 잠재적으로 가지고 있었다(이 시점엔 `className`을 넘기는 호출부가 없어 아직 드러나지
않았을 뿐) — 함께 고쳤다. `Input.tsx`/`SearchInput.tsx`/`Card.tsx`/`Button.tsx`/
`DatePicker.tsx`는 이미 `className`을 구조분해해 내부 클래스 배열 뒤에 append하고
`{...props}`에서 제외하는 올바른 패턴이라 손대지 않았다.

**새 입력류 컴포넌트를 만들거나 기존 컴포넌트에 `className` 통과를 추가할 때 지킬 패턴:**
1. 구조분해 시 `className = ''`로 명시적으로 꺼낼 것(그래야 `...props`에 안 남음).
2. 실제 DOM 엘리먼트의 `className`은 `[내부 클래스1, 내부 클래스2, ..., className].filter(Boolean).join(' ')`처럼
   **항상 배열의 마지막**에 붙일 것 — 덮어쓰기(overwrite)가 아니라 병합(append)이 되어야
   호출부가 폭/마진 같은 레이아웃만 조정하고 컴포넌트의 핵심 스타일(예: `appearance-none`)은
   보존된다.
3. `{...props}`는 `className`을 구조분해한 **이후에** 스프레드할 것.

**주의 — DS `Input`(그리고 `Textarea`)에 `flex-1`을 직접 넘겨 "행에서 늘리기"를 하면
높이가 무너진다.** `Input`은 `className`을 **가장 바깥 wrapper가 아니라 안쪽 field div**
(`flex items-center h-10 px-4 ...`)에 붙이는데, 그 field div의 부모는 `Input` 자신의
`flex flex-col` wrapper다. 그래서 `flex-1`(=`flex:1 1 0%`)이 **행(main axis=가로)이 아니라
column의 세로 축에 걸려** `flex-basis:0%`가 `h-10`을 이겨 field 높이가 40px→25px로 쪼그라든다
(라벨·helper가 없는 `Input`일수록 더 잘 재현됨). 실제로 `AddressBookScreen`의 우편번호
입력과 `CheckoutScreen`의 적립금 입력 두 곳에서 이 증상이 났다(브라우저 실측: field wrapper
높이 25px). **행에서 `Input`을 늘리려면 `Input`에 `flex-1`을 주지 말고 `Input`을
`<div className="flex-1">`로 감쌀 것** — 그러면 wrapper가 행에서 가로로 늘고 field div는
`h-10`(40px)을 유지한다. `flex-1`을 꼭 컴포넌트에 직접 주고 싶다면 DS를 고치지 말고 이
래퍼 패턴을 먼저 쓸 것.

---

---

### SideNav 접기/펼치기 — SideNav가 토글 버튼과 접힌 레일을 자체 렌더링(Revision 1)

캡틴 요청("좁은 화면에서도 필요하면 접고 펼 수 있어야 한다")으로 `SideNav`
(`packages/design-system/src/web/components/SideNav.tsx`)에 `collapsed?: boolean` +
`onCollapsedChange?: (collapsed: boolean) => void` prop을 추가했다. 둘 다 옵셔널이라
안 넘기면 기존과 100% 동일 동작(`web-admin`은 아직 안 넘김) — `collapsed=true`인데
`onCollapsedChange`가 없으면 여전히 `null`(완전 숨김, 하위 호환).

**1차 구현(토글 버튼을 `AppShell`의 별도 `h-12` 상단 바에 두는 방식)은 캡틴 리뷰에서
반려되어 폐기했다** — 실제 화면에서 보니 그 바가 SideNav 헤더와도 페이지 제목과도
안 붙어 있어 붕 떠 보였다. **지금 아키텍처는 `SideNav`가 토글 버튼 렌더링 책임을
직접 가진다:**

- `onCollapsedChange`가 주어지면:
  - `collapsed=false`(펼침): 기존 `w-64` 전체 nav를 그대로 그리되, `header` slot
    바로 옆(오른쪽)에 접기 토글 버튼을 함께 그린다 — 헤더 콘텐츠는 `min-w-0 flex-1`
    div로 감싸 버튼과 한 줄에 나란히 배치.
  - `collapsed=true`: `null` 대신 **좁은 아이콘 레일**(`w-14`, 56px)을 그린다 — nav
    항목 라벨/아이콘은 렌더링하지 않고(캡틴이 원한 건 "닫기"이지 아이콘 전용 축소
    모드가 아니라는 지시를 그대로 따름), 레일 안에 펼치기 토글 버튼 하나만 놓는다.
    이 레일이 `AppShell`의 별도 상단 바를 완전히 대체한다 — 버튼이 `SideNav` 자신
    안에 있으므로 열림/닫힘 상태 전환 내내 같은 컴포넌트, 같은 상대 위치(헤더 옆 →
    레일 안)를 유지해 어색하게 붕 뜨는 문제가 구조적으로 생기지 않는다.
  - `onCollapsedChange`가 없으면(`web-admin`처럼 아직 배선 안 한 앱) 토글 버튼 자체가
    렌더링되지 않고 `collapsed` 값대로만 동작(펼침 고정, 또는 `true`면 `null`).
- **토글 아이콘은 lucide-react가 아니라 컴포넌트 내부 인라인 SVG**(`ToggleChevron`)로
  그렸다 — `packages/design-system`은 어떤 아이콘 라이브러리에도 의존하지 않는다는
  기존 컨벤션(`icon`/`icon(isActive)` prop이 항상 `ReactNode`인 이유와 동일) 때문.
  다만 `NavItem.icon`처럼 도메인 아이콘을 호출부가 주입하는 것과 달리, 토글
  버튼처럼 컴포넌트 자신의 범용 chrome(열림/닫힘 표시 화살표)은 `Drawer`의 닫기
  X, `Accordion`/`CategoryTree`의 확장 chevron과 같은 기존 패턴을 그대로 따라
  `viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"` 인라인 `<path>`로
  직접 그린다 — 새 프리미티브에 범용 chrome 아이콘이 필요하면 라이브러리를
  끌어오지 말고 이 인라인 SVG 컨벤션을 먼저 참고할 것.
- **실제 토글 배선(버튼 prop 전달, 반응형 감지)은 이번에도 `web-seller`
  (`shared/components/AppShell.tsx`)에만 넣었다** — `AppShell`은 이제 `collapsed`
  state와 `onCollapsedChange={setCollapsed}`만 `SideNav`에 넘기고, 버튼 UI 자체는
  전혀 그리지 않는다(별도 상단 바 완전히 제거, `<main>`이 다시 `SideNav`의 바로 다음
  형제).
- **반응형 감지는 `matchMedia` + `change` 리스너**
  (`apps/web-seller/src/shared/hooks/useIsNarrowViewport.ts`, 기본 `1024px` = Tailwind
  `lg`) — 디자인 시스템의 `useVisualViewportHeight`(리사이즈 이벤트 구독 패턴)와
  구조는 같지만, 픽셀 단위 `resize`가 아니라 브레이크포인트 통과 여부만 필요해
  `matchMedia`를 썼다.
- **좁아질 때만 강제로 접고, 넓어져도 자동으로 펴지 않는다.** `AppShell`은
  `isNarrow`가 `true`로 바뀌는 순간에만 `setCollapsed(true)`를 호출하는
  `useEffect`를 둔다 — 좁은 화면에서 사용자가 수동으로 편 상태를 유지하고
  싶을 수 있고, 토글 버튼으로 언제든 직접 되돌릴 수 있으므로 "넓어지면
  자동으로 다시 펴기"는 넣지 않았다(의도적 결정, 버그 아님).
- 새로 이 prop을 쓰는 앱(`web-admin` 등)을 추가할 때는 `SideNav`에 `collapsed`/
  `onCollapsedChange`만 넘기면 된다 — 토글 버튼이나 접힌 레일을 소비 앱에서 다시
  만들 필요 없음(그게 이번에 고친 핵심).

---

### 로그인 화면(`/login`, `b5-st-13`) — SideNav 없는 라우트, AppShell 예외 분기

`features/auth/`는 초기 스캐폴딩(SCRUM-65) 이후 어느 라우트에도 연결된 적이 없던
플레이스홀더였다 — `routes/login/` 자체가 존재하지 않았다. 이번에 목업(`b5-st-13`,
소셜 로그인 전용, 이메일/비밀번호 UI 없음)에 맞춰 `LoginForm.tsx`를 카카오/구글/Apple
소셜 버튼 3개로 새로 만들고 `routes/login/index.tsx`를 처음 추가했다.

- **목업의 `.social-btn`은 provider별 브랜드 색상이 없다** — 카카오/구글/Apple 버튼
  3개 모두 동일한 중립 스타일(`bg-surface-raised` + `border-default`, 아이콘도
  `--icon-muted` 회색 하나로 통일)이었다. 작업 지시에는 "provider별 브랜드 색상은
  목업 참고"라고 적혀 있었지만 실제 목업 마크업(`screen-specimen.css` `.social-btn`/
  `.social-logo`)을 직접 열어 확인한 결과 브랜드 색상 자체가 존재하지 않았다 — 지시의
  가정이 틀린 경우라 실제 목업을 따라 디자인 시스템 `Button variant="secondary"`
  (중립 스타일)로 3개 버튼을 통일했다. 이후 이 화면에 실제 브랜드 색상을 넣으라는
  요구가 새로 들어오면 그건 이번 목업 배치 이후의 스코프 확장이다.
- **`lucide-react`(현재 버전 `^1.23.0`)에는 브랜드 로고 아이콘이 없다** — `Apple`은
  우연히 이름이 겹쳐 존재하지만, 목업이 쓴 `chrome`(구글 대용)은 이 버전에 아예 없다
  (`Chrome` export 자체가 없음 — 트레이드마크 아이콘이 lucide에서 빠진 것으로 보임).
  구글 버튼은 `Globe`로 대체했다 — 새로 소셜 로그인류 버튼을 추가할 때 목업의
  `data-lucide` 이름을 그대로 믿지 말고 `ls node_modules/.pnpm/lucide-react@*/node_modules/lucide-react/dist/esm/icons/`로
  실제 export 존재 여부를 먼저 확인할 것.
- **`AppShell`(`shared/components/AppShell.tsx`)은 `pathname === '/login'`일 때
  `SideNav` 없이 `<Outlet />`만 렌더링하는 예외 분기를 탄다** — `__root.tsx`가 모든
  라우트에 무조건 `AppShell`을 씌우는 구조라, 목업처럼 SideNav 없는 중앙 카드
  단독 화면을 만들려면 라우트 트리를 pathless layout(web-buyer의 `_tabs.tsx` 패턴)으로
  쪼개거나 `AppShell` 안에서 예외 처리하는 두 가지 방법이 있었다 — 기존 5개 라우트
  파일을 전부 이동시켜야 하는 pathless layout 리팩터 대신, 위험도가 낮은 `AppShell`
  내부 조건 분기를 선택했다. **새 SideNav-less 라우트(예: 향후 운영 어드민 공용
  로그인)가 하나 더 생기면 이 if문에 조건을 계속 추가하지 말고, 그 시점에 pathless
  layout으로 전환할 것** — 지금은 예외가 하나뿐이라 조건 분기가 더 저렴했을 뿐이다.
- 로그인 성공 처리는 `auth.queries.ts`의 `useLogin`이 `auth.mock.ts`의
  `mockSocialLogin(provider)`(어느 버튼을 눌러도 동일한 mock 유저 반환, `provider`
  값만 기록)를 호출하고 `onSuccess`에서 `useAuthStore.setUser` + 라우트 쪽
  `navigate({ to: '/' })`로 대시보드 이동 — claims/products 등 기존 feature의
  "mock 함수 + useMutation" 패턴과 동일하게 맞췄다. 기존 `useLogin`은 실제로는 한
  번도 연결된 적 없는 이메일/비밀번호 + 실제 axios POST였다(사용된 적 없는 죽은
  코드) — "기존 로직을 유지"라는 표현에 속지 말고 실제 참조 여부를 먼저 확인할 것.

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

---

## web-seller 대시보드 — MetricCard 복합 footer (BarChart는 2026-07-09 제거됨)

대시보드(`apps/web-seller/src/features/dashboard/`)에 캡틴 요청으로 지표 카드 전기간 대비
증감률(`▲12%`/`▼5%`)을 스코프 확장으로 추가했다 (`screens.html` b5-st-1 목업에는 없던 내용).

- **`MetricCard`의 `footer` prop은 단일 `ReactNode` 슬롯**이라, 카드마다 기존 footer 내용이
  다른 상태(`StatusPill`이 있는 것/순수 텍스트인 것)에서 그 옆에 새 요소(증감률)를 추가하려면
  `footer` 안을 `<div className="flex flex-col gap-0.5">`로 감싸 기존 footer 내용(pill 또는
  텍스트)을 그대로 두고 그 아래 줄에 증감률 `<span>`을 붙이는 방식을 썼다 — `MetricCard`
  자체를 수정하거나 새 prop을 추가하지 않고 소비 측(`DashboardPage.tsx`)에서만 합성.
  `MetricCard`의 footer 컨테이너(`inline-flex items-center gap-1`)는 자식이 몇 개든 하나의
  flex-col div로 감싸 넣으면 레이아웃이 깨지지 않는다 — 여러 footer 요소를 나란히/위아래로
  배치해야 하는 다른 화면에서도 이 패턴(래퍼 div로 합성, 컴포넌트 prop 확장 안 함)을 먼저
  검토할 것.
- 증감률 색상은 `text-success-fg`(상승)/`text-error-fg`(하락)를 썼다 — 상승이 항상
  "좋다"는 의미가 아님(예: 배송 지연·취소 요청 상승은 나쁨)에도 캡틴 스펙이 방향(up/down)만
  기준으로 색을 정하라고 명시했으므로 지표별 긍정/부정 의미 판단 없이 방향에만 매핑했다.
  지표별 "좋은 방향"이 다르다는 이유로 색을 반전시키지 말 것 — 이번 요구사항의 의도적 결정.
- **매출 추이 `BarChart` 섹션은 2026-07-09 캡틴이 화면을 직접 보고 되돌리기 요청해 제거됐다.**
  `DashboardSummary`의 `revenueTrend`/`DashboardRevenueTrendPoint`도 이 차트 전용 필드라 함께
  삭제(`dashboard.mock.ts`) — 다른 곳에서 참조하는 곳이 없었다. `BarChart`
  (`packages/design-system`) 컴포넌트 자체는 그대로 있으니 다시 차트가 필요해지면 재사용
  가능하지만, 대시보드에 다시 추가하기 전에 이번처럼 캡틴 확인을 먼저 받을 것 — 애초에
  b5-st-1 목업에 없던 스코프 확장이었다가 되돌려진 이력이 있다. 지표 카드 증감률 뱃지는 이번
  제거와 무관하게 그대로 유지됨.

---

### 기간 선택기(전체/최근 7일/30일/90일) 실제 배선 (2026-07-09)

기간 선택기(`Select`)가 값만 바뀌고 실제로는 항상 같은 mock을 보여주는 장식용 상태였다 —
캡틴이 화면을 직접 써보다가 발견(정산/매출 화면의 월 선택기와 같은 종류의 문제). "전체"를
맨 앞 기본값으로 추가하고, `useDashboardSummary(period)`가 선택된 기간의 mock을 반환하도록
`useSellerApplication(status?)` 관례(`store-settings.queries.ts`)를 그대로 따라 배선했다 —
`queryKey`에 `period`를 포함시켜 기간 전환 시 TanStack Query가 별개 캐시 엔트리로 취급한다.

- **7개 지표 카드(신규주문/발송대기/배송지연/취소요청/반품요청/교환요청/미응답문의)만
  기간별로 값·증감률이 달라진다.** `dashboard.mock.ts`에 `DASHBOARD_METRIC_META`(라벨·아이콘·
  footer 문구 — 기간과 무관)와 `DASHBOARD_METRIC_VALUES_BY_PERIOD`(값·증감률만 4세트: `all`/
  `7d`/`30d`/`90d`, 기간이 길수록 누적 카운트가 커지는 방향)로 분리해 `getDashboardSummaryMock
  (period)`가 두 조각을 합성한다 — 라벨/아이콘/footer 문구를 4번 반복하지 않기 위한 구조.
- **정산 예정 금액 카드·상품 상태 카드는 의도적으로 기간과 무관하게 고정.** 둘 다 "지금 이
  순간의 스냅샷"(현재 정산 대기 금액, 현재 상품 상태)이라 과거 시점 데이터가 없고, 기간을
  바꿔도 같은 값을 보여주는 게 정답이다 — `DASHBOARD_SETTLEMENT_MOCK`/
  `DASHBOARD_PRODUCT_STATUSES_MOCK`을 기간별로 쪼개지 말 것. 지표 카드와 달리 이 두 카드는
  "이 화면에서 절대 기간에 반응하면 안 되는 것" 사례이니, 새 요구사항이 들어와도 먼저 이게
  스냅샷 성격인지 누적 성격인지부터 판단할 것.
- **정산/매출 화면의 월 선택기도 같은 종류의 장식용 선택기였다** — 이 항목을 적을 당시엔
  대시보드만 고치고 "다른 화면에도 남아있을 수 있다"고 남겨뒀는데, 같은 날 별도 배치
  (`cbe0e7f`/`40b70af`, `apps/web-seller/src/features/settlements/`)에서 정산/매출 쪽도
  독립적으로 고쳐졌다 — 두 화면 모두 이제 실제 필터링 상태. 새로 장식용 선택기를 발견하면
  이 두 배치의 구조(메타/값 분리 + 쿼리 훅에 옵셔널 파라미터 추가 + `queryKey`에 포함)를
  그대로 참고할 것.

---

### Revision 1 — "긴급만" 토글 실제 필터링 + 지표 카드 4열 그리드를 flex-wrap으로 전환

같은 배치에서 캡틴이 화면을 보고 지적한 두 가지를 추가로 고쳤다:

- **`urgentOnly` state가 `Toggle`의 `checked`/`onChange`에만 연결되고 카드 목록 필터링에는
  전혀 안 쓰이던 장식용 상태였다** — `data.metrics.filter(metric => !urgentOnly ||
  metric.variant === 'urgent')`로 실제 필터링하도록 고쳤다. **기본값도 `useState(true)`에서
  `useState(false)`로 함께 바꿨다** — 필터링을 켜면서 초기값을 `true`로 그대로 두면 첫
  로드부터 카드 7개 중 6개(현재 mock 기준 `variant: 'urgent'`는 "배송 지연" 하나뿐)가
  사라져 캡틴이 지금까지 보던 화면과 완전히 다른 첫인상이 된다 — 새 boolean 상태를 실제
  동작에 연결할 때는 그 상태의 초기값이 "필터링이 켜진 채 시작"을 의미하지 않는지 항상
  같이 점검할 것(토글 이름과 무관하게 state 자체는 계속 `true`였다는 게 문제였다).
- **`grid grid-cols-4`(고정 4열) + 카드 7개 조합이 마지막 줄에 3개만 남아 4번째 칸이 빈
  채로 어색해 보이는 문제**를 `flex flex-wrap gap-3` 컨테이너 + 각 `MetricCard`에
  `className="flex-auto basis-[210px]"`로 바꿔 해결했다. `flex-auto`(`flex: 1 1 auto`)가
  `flex-basis: 210px`와 결합되면, 브라우저의 줄바꿈 판단 자체는 여전히 210px 기준으로
  이뤄지지만(4열 유지) 마지막 줄처럼 항목 수가 남는 경우 `flex-grow`가 그 줄의 남는 폭을
  나머지 항목에 고르게 분배한다 — 즉 "고정 폭 카드 + 빈 칸"이 아니라 "그 줄의 카드들이
  넓어져 꽉 채움" 형태로 자연스럽게 재배치된다(실측: 4개 줄은 카드당 ~210px, 3개 줄은
  카드당 ~280px). **긴급만 필터로 카드가 1개만 남을 때도 같은 원리로 그 1장이 전체 폭을
  채운다** — 별도 분기 없이 동일한 flex 레이아웃 하나로 카드 개수가 몇 개든(1~7개) 항상
  마지막 줄이 자연스럽게 채워진다. `MetricCard`는 이미 `className`을 배열 마지막에 병합하는
  올바른 패턴(위 "웹 디자인시스템 입력 컴포넌트" 절 참고)이라 컴포넌트 자체는 손대지 않고
  호출부(`DashboardPage.tsx`)에서만 `flex-auto basis-[210px]`를 얹어 해결했다. 로딩 중
  `Skeleton` 8개 그리드는 `grid grid-cols-4` 그대로 뒀다 — 8은 4로 나누어떨어져 이 문제가
  애초에 재현되지 않는다(고정 스켈레톤 개수라 실제 필터링된 카드 수와 무관).

---

### 도메인 타입 이원화 정리 — `SellerApplication`을 확장, 새 병렬 타입 안 만듦

`AGENTS.md`의 "web-admin 심사/관리 5종 — 알려진 격차" 절이 지적했던 "SellerApplication이
`Seller`와 병렬 타입으로 존재" 문제가 이 화면(셀러 자신의 재제출 화면)에서 실제로 부딪혔다.
`Seller`는 `shopName`만 있어 이 폼에 전혀 못 쓰고, 기존 `SellerApplication`(web-admin
`sellers/applications.tsx` 전용으로 만들어짐)은 반려 사유·서류 목록 등 뼈대는 있지만 전부
**마스킹된** 필드(`representativeNameMasked`, `phoneMasked`)뿐이라 셀러 자신이 보는
비마스킹 값(전화번호 실번호, 이메일, 사업장 주소, 정산 계좌, 서류별 상태)이 없었다.

**결정: 새 병렬 타입을 만들지 않고 `SellerApplication`(`packages/domain/src/types/index.ts`)을
확장했다.** 마스킹 필드는 그대로 두고(admin 표시용), 셀러 자신의 뷰에서만 채워지는 비마스킹
필드를 optional로 추가: `representativeName`/`phone`/`phoneVerified`/`email`/
`businessAddress`/`bankName`/`bankAccountNumber`/`bankAccountHolder`. `documents`는 인라인
`{key,label}[]`에서 이름 있는 `SellerApplicationDocument`(`status?`/`note?`/`required?`
추가)로 승격했다 — 전부 optional이라 web-admin의 기존 mock 리터럴(`{key,label}`만 있는
객체)이 그대로 타입 체크를 통과한다(실제로 `pnpm --filter @aechak/web-admin typecheck`로
확인, 회귀 없음). `sellerType: 'business' | 'individual'`(admin이 필터·표시에 쓰는 굵은
분류)은 그대로 두고, 목업의 3-way 셀러 유형(개인 일반/개인 사업자/법인 사업자)은 별도
optional 필드 `legalType: SellerLegalType`으로 추가 — `sellerType`을 3-way로 바꾸면
admin의 `row.sellerType === 'business'` 이분법 체크가 깨지므로, 세분류가 필요한 화면만
새 필드를 보고 `sellerType`은 그로부터 파생시켜 저장한다(`StoreSettingsForm.tsx`의
`handleLegalTypeChange`: `legalType` 변경 시 `sellerType`도 함께 계산해 항상 일관성 유지).
**판단 기준**: 필드가 부족하면 우선 기존 타입에 optional 필드로 확장하고, 기존 필수 필드의
의미·유니온을 바꿔야 완전히 새로운 개념이 되는 경우에만(이번엔 아님) 새 타입을 고려할 것 —
이번처럼 "이미 있는 필드의 마스킹 안 된 버전이 필요하다" 정도는 병렬 타입을 만들 이유가
못 된다.

---

### "FileUpload row" — `PhotoUpload`를 그대로 쓰지 않고 행 안에 토글로 내장

목업 스펙 칩 목록(`FormSection(stepper), Segmented, TextField, Select, TextArea, FileUpload
row, Alert, StatusPill`)의 "FileUpload row"는 디자인 시스템에 존재하는 컴포넌트 이름이
아니다 — 나머지 칩(FormSection/Segmented/TextField/Select/TextArea/Alert/StatusPill)은
전부 실제 컴포넌트(`FormSection`/`SegmentedControl`/`Input`/`Select`/`Textarea`/`Alert`/
`StatusPill`)와 1:1 대응하는데 "FileUpload row"만 대응 컴포넌트가 없다는 게 이 화면을
구현하며 확인한 사실 — 목업이 그리는 실제 레이아웃(서류명 + 상태 pill + 작은 버튼 한 줄)은
`PhotoUpload`(썸네일 그리드 업로더)와 시각적으로 안 맞는다. 그래서 `DocumentRow`
(`features/store-settings/components/DocumentRow.tsx`)를 새로 만들어 기본 상태는 목업 그대로
한 줄(라벨 + `StatusPill` + `Button`)로 렌더링하고, "업로드"/"교체" 버튼을 누르면 그 아래
`PhotoUpload`(`max={1}`)가 펼쳐지는 방식으로 컴포넌트 갭 없이(`PhotoUpload` 재사용) 목업
레이아웃을 보존했다 — 새 컴포넌트를 만들되 디자인 시스템에 올리지 않고 feature 로컬
컴포넌트로 둔 이유는 이 "행 + 토글식 업로더" 조합이 지금은 이 화면 하나뿐이라서다. 같은
패턴이 다른 화면에서도 필요해지면 그때 `packages/design-system`으로 승격 검토할 것.

파일을 선택하면(`DocumentRow`의 `onAdd`) 실제 업로드 없이 로컬에서 해당 서류
`status`를 바로 `'submitted'`로 바꾼다(페이지 상단 "재제출하기" 버튼은 `required &&
status === 'resubmission-required'`인 서류가 하나라도 남아있으면 비활성화 — 통장 사본을
갈아끼우기 전까지는 재제출 자체를 막는다). 목업엔 없는 스코프 확장이지만 통장 사본에
붙은 `required` 표시(`*`)의 의미를 실제로 강제한 것이라 최소 범위 안에 있다고 판단했다.

---

### Revision 1 — `SellerApplicationStatus` 6종 전체 분기 (홀딩 뷰 + 승인 안내)

최초 배치는 mock이 항상 `rejected`만 반환하고 라우트가 `form.status`로 분기하지 않아,
`pending`/`reviewing`/`approved`/`resubmitted`를 포함한 나머지 5개 상태도 전부 반려·재제출
폼을 그대로 보여주는 버그가 있었다(캡틴이 실제 화면을 열어보고 발견). 캡틴 지시로 6개 상태를
3개 그룹으로 좁혀 분기했다:

- **`pending`/`reviewing`/`resubmitted` → 홀딩 뷰 하나로 통합.** "셀러가 할 일이 없고
  기다리는 중"이라는 공통점으로 묶어 `EmptyState`(디자인 시스템 컴포넌트 재사용, 새 컴포넌트
  안 만듦) + 상태별 안내 문구만 보여준다(폼/서류 목록 없음, 편집 불가). 진행 파이프라인은
  그대로 유지 — 이 3개 상태의 mock 픽스처는 전부 `resubmissionCount: 1`로 만들어 "한 번
  반려됐다가 재제출한 뒤 다시 심사 중"이라는 동일한 서사를 공유하게 했다. 그래서 파이프라인의
  "서류 반려"=error/"재제출"=success/"최종 승인"=info(현재) 배색이 세 상태 모두에서 그대로
  말이 된다 — `pending`을 "한 번도 반려된 적 없는 최초 신청"으로 모델링했다면 파이프라인의
  "서류 반려" 단계가 거짓이 되므로, 픽스처 데이터 자체를 파이프라인 서사와 일치하게 설계한
  것이 핵심 판단이었다(코드 변경 없이 mock으로 해결).
- **`rejected`/`revision-requested` → 기존 폼 화면 그대로, 문구까지 완전히 동일하게 유지.**
  두 상태를 구분하는 새 카피를 만들지 않고 `HEADER_META`에서 동일한 객체를 공유한다 —
  "이미 구현된 화면은 손대지 말 것" 지시를 문자 그대로 지키는 가장 낮은 리스크 선택.
  분기 이전엔 `revision-requested`가 애초에 도달 불가능한 코드였다(mock이 항상 `rejected`만
  반환) — 이번에 분기가 생기면서 실제로 렌더링 가능해졌지만 시각적으로는 변경 없음.
- **`approved` → 짧은 안내만(2-B는 여전히 범위 밖).** 파이프라인·폼·서류 목록 전부 숨기고
  `EmptyState`로 "입점 신청이 승인됐어요 / 스토어 정보를 설정하는 화면은 곧 제공될 예정이에요"
  한 줄만 보여준다 — `PageHeader` 타이틀도 이때만 "스토어 개설 · 서류 보완"이 아니라 "스토어
  설정"으로 바뀐다(2-B가 생기면 이 타이틀의 화면이 될 자리).
- **mock 상태 스위치 메커니즘**: `mockFetchSellerApplication(status?)`가 이제
  `SELLER_APPLICATION_FIXTURES: Record<SellerApplicationStatus, SellerApplication>`에서
  픽스처를 골라 반환한다 — 인자 없이 호출하면 항상 `'rejected'`(기존 회귀 테스트·프로덕션
  라우트가 전제하는 값, `MOCK_SELLER_APPLICATION`은 `SELLER_APPLICATION_FIXTURES.rejected`와
  동일 참조). `useSellerApplication(status?)`도 동일하게 optional로 통과시킨다. 프로덕션
  라우트는 여전히 `useSellerApplication()`(인자 없음)만 호출 — 상태를 바꿔 확인하고 싶을
  때만 개발 중 일시적으로 인자를 넘겨 `chrome-devtools-axi`로 스크린샷 찍고 원복하는 방식을
  썼다(URL 파라미터나 UI 토글 같은 영구 디버그 기능은 추가하지 않음, 스코프 최소화).
- **재제출 버튼을 누른 직후 폼이 계속 열려 있던 버그도 이번에 같이 해소됐다** —
  `handleResubmit`의 `onSuccess`가 mutation 응답(`updated`, `status: 'resubmitted'`)으로
  `setForm`을 갱신하고, 라우트가 `form.status`로 분기하게 되면서 `resubmitted`가 자동으로
  홀딩 뷰로 전환된다(별도의 "재제출 후 폼 잠금" 로직을 추가로 짤 필요가 없었음 — 상태
  분기 자체가 이 문제를 흡수했다).

---

### Revision 2 — 중복 필드 제거 + 셀프 리뷰 단순화

캡틴이 `StoreSettingsForm.tsx`의 "판매자 유형" 섹션에서 "셀러 유형"(3단
`SegmentedControl`, `legalType` 기반)과 "사업자번호 보유"(`Select`)가 같은 값을 라벨만
바꿔 중복 질문하고 있다고 지적 — `BUSINESS_NUMBER_OPTIONS`가 `LEGAL_TYPE_OPTIONS`와
정확히 같은 3개 `SellerLegalType` 값이었다. **`BUSINESS_NUMBER_OPTIONS`와 그 `Select`를
완전히 제거**하고 "셀러 유형" `SegmentedControl` 하나만 남겼다(`store-settings.queries.ts`/
`index.ts` 배럴의 관련 export도 함께 제거 — 죽은 export 안 남김). **새 필드를 추가할 때
"이미 있는 값과 실제로 다른 정보인가"를 먼저 확인할 것** — 이번 케이스는 다른 이름의 Select를
추가하면서 그 값이 옆에 있는 다른 필드와 항상 1:1로 같이 움직인다는 걸 놓친 경우였다.

이어서 이번에 새로 추가된 코드 전체(`features/store-settings/**`,
`routes/store-settings/index.tsx`)를 셀프 리뷰해 같은 종류의 중복을 추가로 찾아 정리했다:

- `store-settings.mock.ts`의 `rejected`/`revision-requested` 픽스처가 `status` 한 필드만
  다르고 `appliedAt`/`resubmissionCount`/`rejectionReason`/`revisionNote`(문장 전체)를
  리터럴로 두 번 반복하고 있었다 — `REJECTED_FORM_FIELDS` 공유 객체로 추출해 스프레드하고
  `status`만 오버라이드하게 정리(`documents`는 상태별로 새 배열이 필요해 각자
  `baseDocuments(...)`를 그대로 호출 — 공유 객체 안에 넣으면 배열 참조가 공유돼 버그가 될
  수 있어 의도적으로 제외).
- `routes/store-settings/index.tsx`의 `HEADER_META`도 `rejected`/`revision-requested`
  키에 완전히 동일한 객체 리터럴을 복붙해뒀던 걸 `FORM_HEADER_META` 상수 하나로 합쳐 두 키가
  같은 참조를 공유하게 했다.
- 같은 파일의 `isHolding`/`isApproved` 분기가 시각적으로 거의 같은 `<EmptyState>` 블록
  두 개(홀딩 뷰/승인 안내)로 중복 렌더링되고 있었고, `holdingCopy(form.status)`도 title과
  description을 얻으려고 같은 인자로 두 번 호출되고 있었다 — 렌더 직전에 `notice = isHolding
  ? {...} : isApproved ? {...} : null` 하나로 합쳐 `holdingCopy`를 한 번만 호출하고
  `<EmptyState>`도 한 곳에서만 렌더링하도록 정리.
- **손대지 않은 것**: `isHolding`(3개 상태 OR)과 `pastResubmission`(2개 상태의 부정)은 서로
  다른 상태 부분집합을 가리키고 각각 다른 곳(폼 분기 vs 파이프라인 배색)에도 쓰이고 있어
  하나로 합치면 오히려 읽기 어려워질 위험이 있다고 판단해 그대로 뒀다 — "애매하면 그대로
  둘 것" 기준 적용.

검증: `pnpm --filter @aechak/web-seller typecheck`, `pnpm --filter @aechak/web-admin
typecheck`(도메인 타입 비영향 확인), `lint`, `test`(21개) 전부 재통과. `chrome-devtools-axi`로
`rejected` 상태를 다시 렌더링해 "사업자번호 보유" 필드가 사라지고 나머지 폼/서류 섹션은
그대로인 것을 확인.

---

---

## web-seller 정산/매출(`/settlements`, b5-st-10) — 캡틴 지시로 단순 표 하나로 축소

목업(`screens.html` b5-st-10)은 탭 2개(정산 내역/성과 분석) + MetricCard 4종 + 월 선택기 +
정산 테이블 + 건별 상세 분해 카드 + 보류 내역 사이드리스트 + 정산 계좌 카드 + 파일 다운로드
Modal로 8개 화면 중 가장 무거웠지만, 캡틴이 이번 배치에서 "단순 표 하나"로 범위를 크게
줄였다. Revision 1에서 월 선택기(당시엔 장식용) + 행 클릭 시 건별 정산 상세(당시엔 표 아래
인라인 `Card`)가 추가됐고, **Revision 2에서 캡틴이 그 두 가지를 다시 조정했다: (1) 상세를
`Drawer`로 전환, (2) 월 선택기를 실제 필터링 + 기본값 "전체"로 전환.** 다운로드 관련 요소(상단/
테이블 헤더의 "내보내기" 버튼, 액션 컬럼의 다운로드 아이콘, 다운로드 Modal)는 Revision 2에서도
여전히 전부 범위 밖 — 탭 구조·MetricCard 4종·보류 내역 사이드리스트·정산 계좌 카드·성과 분석
탭도 마찬가지로 범위 밖으로 유지됨.

- **건별 정산 상세는 web-admin 5종 심사/관리 화면과 동일한 "행 클릭 → 상세 `Drawer`"
  패턴으로 전환됐다(Revision 2).** Revision 1의 "표 아래 인라인 `Card`, 기본 선택 첫 번째
  행" 방식은 폐기 — 지금은 `Drawer(open/onClose/title="건별 정산 상세"/width="md")` 안에
  `SettlementDetailContent`(`features/settlements/components/`, 예전 이름
  `SettlementDetailCard`에서 개명 — 더 이상 자체 `Card`/제목을 그리지 않고 `Drawer`가 그
  chrome을 담당하므로 내용만 렌더링)를 넣는다. **닫힌 상태가 기본**(Revision 1과 달리 첫
  행을 자동으로 열어두지 않음) — `selectedOrderId: string | null` state가 `null`이면
  `Drawer`도 닫힘. `width`는 `md`(384px)로 충분함을 실제 렌더링(`chrome-devtools-axi`
  스크린샷)으로 확인했다 — 내용이 label/value 한 줄짜리 행뿐이라 여유 있게 들어감, `lg`로
  올릴 필요 없었음. `정산 대기`/`정산 보류` 건처럼 아직 구매확정 전이라 분해 데이터가 없는
  행을 클릭하면 Drawer 안에 "구매확정 전이라 상세 내역이 아직 없어요" 안내만 보여준다
  (`Settlement.platformFeeAmount == null`로 분기, 로직 자체는 Revision 1과 동일).
- **월 선택기는 이제 실제로 목록을 필터링한다(Revision 2)** — 옵션 맨 앞에 `전체`(기본값)를
  추가하고, `Settlement`에 필수 필드 `settlementMonth: string`('YYYY-MM')을 새로 추가해
  `settlements.filter(s => s.settlementMonth === month)`로 거른다. **`confirmedAt`
  (표시용 'MM.DD' 문자열)이 아니라 별도 `settlementMonth` 필드를 쓰는 이유** — `정산 대기`/
  `정산 보류` 건은 구매확정 전이라 `confirmedAt`이 아예 없는데, 이런 행도 특정 월을
  선택했을 때 필터링 대상이 되어야 하므로(주문이 발생한 월 기준으로 분류) `confirmedAt`과
  독립적인 필수 필드가 필요했다 — optional 상세 분해 필드들과 달리 이 필드는 모든 mock
  행에 반드시 채워야 `tsc`가 통과한다.
- **필터링을 실제로 시연하려고 mock 데이터를 6월 4건 → 6월 4건 + 5월 2건 + 4월 1건(총
  7건)으로 늘렸다** — 5월 1건은 `정산 완료`(전체 분해 필드 포함), 5월 1건은 `정산 보류`
  (분해 없음), 4월 1건은 `정산 완료`. `__tests__/settlements.mock.test.ts`의
  `AC-SETTLEMENTS-003`이 월 선택기가 제공하는 각 월(`2026-06`/`2026-05`/`2026-04`)에
  최소 1건이 존재하는지 검사한다 — 새 월 옵션을 추가하면서 mock 데이터를 깜빡하면 이 테스트가
  잡아낸다.
- **`Settlement` 도메인 타입의 상세 분해 필드(`shippingFee`/`couponBurden`/
  `platformFeeAmount`/`pgFeeAmount`/`refundDeduction`)는 전부 optional이고, 채워진 4개
  항목(쿠폰부담+플랫폼수수료+PG수수료+환불차감)의 합이 항상 `feeAmount`와 같아야 하는
  불변식이 있다** — 목업 실측값(상품금액 64,000 기준 플랫폼수수료 8%=5,120, PG수수료
  2.8%=1,792)으로 검증 완료, `__tests__/settlements.mock.test.ts`의
  `AC-SETTLEMENTS-002`가 이 불변식을 mock 데이터 전체에 대해 검사한다. 새 정산 mock 행을
  추가할 때 이 합계가 깨지면 그 테스트가 바로 잡아낸다. 새로 추가한 5월/4월 mock 행은 이
  불변식은 지키되, `상품금액 - feeAmount = finalAmount`라는 (목업 원본 첫 행에는 실제로는
  안 맞던) 두 번째 관계식까지 맞춰서 만들었다 — 목업을 그대로 베낀 기존 첫 행(`20260613-0182`)의
  `finalAmount`는 이 두 번째 관계식과 어긋나지만(목업 자체의 산술 오차로 보임) 손대지 않았고,
  새로 만드는 행은 처음부터 일관되게 설계했다.
- **목업 원문의 "구매확정일 OO.OO · 정산예정일 OO.OO" 안내 텍스트는 `·`를 `/`로 바꿔서
  구현했다** — "web-seller 사용자 노출 문구(카피) 컨벤션" 절이 명시한 "가운뎃점을 구분자로
  쓰지 말 것" 규칙이 목업 텍스트 자체보다 우선한다는 걸 이번에 재확인한 사례. 목업 마크업을
  그대로 베끼면 이 규칙을 어기게 되는 경우가 종종 있으니, 목업에 `·`가 있어도 항상 `/`로
  변환해서 옮길 것.

## web-seller 상품 관리(`/products`, `/products/new`, `/products/$productId/edit`, b5-st-3) (SCRUM-119/120)

실연동 전이라 `features/products/products.mock.ts`의 메모리 스토어로 동작한다. 목업은 BE `origin/develop`의
`SellerProductController`(SCRUM-114/116/117/118/195)와 같은 DTO, 검증 순서, 에러 코드, 자동 품절 규칙을 따른다.
각 목업 함수는 실 fetcher처럼 `{ data }`를 돌려주고 `products.queries.ts`가 벗긴다. 실패는 AxiosError 모양
(`response.status`, `response.data = { errorCode, message }`)으로 reject한다. 실연동 때는 queries의 `mock*` 호출을
생성 fetcher로 바꾸면 된다. DTO와 폼 변환은 `products.contract.ts`에 있다. localStorage는 쓰지 않으므로
새로고침하면 시드로 돌아간다(E2E도 첫 goto 이후 SPA 내비게이션만 쓴다).

BE 코드로 확인해 맞춘 것
- **날짜**: 요청과 응답 모두 오프셋 없는 `LocalDateTime`(KST 벽시계)이다. 할인 기간은 `YYYY-MM-DDT00:00:00`,
  `YYYY-MM-DDT23:59:59`로 보낸다. `+09:00`을 붙이면 400/90001이다.
- **검증 실패 코드**: `@Valid`, 본문 파싱, 파라미터 타입 오류는 전부 400/90001이다. 90002는 `INVALID_CURSOR`라
  셀러 상품 API가 보내지 않는다. `productErrorMessage`가 errorCode별 FE 문구로 바꾼다(서버 message는 격식체라
  띄우지 않는다). 409/90003은 동시 수정 안내로만 쓴다.
- **옵션 없는 상품**: `optionGroups: null`과 `optionCombinations: [{ optionValues: [], additionalPrice: 0,
  stockQuantity }]`를 보낸다. `optionCombinations`는 필수다. 옵션값 이름은 그룹을 넘어서도 겹치면 40005라
  `OptionBuilder`가 모든 그룹을 보고 막는다. 조합 이름은 요청 순서대로 ` / `로 잇고 옵션 없는 상품은 `기본`이다.
- **등록 직후 상태**: 재고와 상관없이 `ON_SALE`/`APPROVED`다. 자동 품절은 판매 상태 변경과 옵션 PATCH 때만 일어난다.
- **판매 상태 PATCH**: `ON_SALE`/`SUSPENDED`만 받고 현재 상태는 보지 않는다. 판매종료도 다시 판매할 수 있어
  토글을 모든 행에 둔다. 판매 가능한 재고(`isActive && stockQuantity > 0`)가 없으면 `ON_SALE` 요청의 응답이
  바로 `OUT_OF_STOCK`이다.
- **재고**: `PATCH /{productId}/options/{combinationId}`는 `stockDelta`(0 금지, ±1,000,000 이내)와 `isActive`만
  받는다. 재고 Drawer는 셀러가 적은 목표 재고와 지금 재고의 차이를 보내고, 응답 `stockQuantity`가 목표와
  다르면(그사이 주문 등) 실제 값을 토스트로 알린다. 응답에 판매 상태가 없고 BE는 커밋 후 비동기로 자동
  품절/복귀를 하므로 목록을 다시 불러와 반영한다(목업은 바로 적용). 옵션별 판매 토글도 Drawer에 있다.
- **목록**: `GET /sellers/me/products`의 파라미터로 검색(상품명만), 카테고리(어느 깊이든, 하위 포함), 판매 상태,
  검수 상태, 정렬(최신/가격), 페이지(20개)를 건다. 행은 `SellerProductSummaryResponse` 필드만 쓰고 와이어
  enum 라벨 매핑은 feature 안에 둔다(공유 도메인 타입은 그대로). BE에 없는 상품번호, 판매 이력 수, 처리 필요
  체크박스, 반려 사유 확인과 재검수/이의 신청 Modal(`InspectionReviewModal`)은 뺐다. 등록일 범위와 재고 필터는
  목업과 타입에는 있지만 화면에는 아직 두지 않았다.
- **이미지**: 업로드는 api 호스트 `POST /files/presigned-url`(purpose=PRODUCT, png/jpeg/webp)이고 tmp 키를 본문에
  싣는다. BE 크기 제한은 없어 10MB는 FE 정책이다. 목록과 프리필은 저장 키(`products/...`)만 주므로
  `productImageUrl`이 `VITE_MEDIA_BASE_URL`로 URL을 만든다(없으면 목업 URL). 수정은 남긴 이미지의 저장 키와
  새 tmp 키를 보내고, 목록 단위로 통째 교체되며 한 목록 안 중복 키는 90001이라 보내기 전에 뺀다.
- **수정 폼**: PUT은 옵션/재고/판매 상태를 바꾸지 않는다. 수정 화면 5번 칸은 `GET /{productId}/options`로 현재
  조합을 읽기 전용 표로 보여주고 목록의 재고 버튼을 안내한다.
- **카테고리**: `GET /categories`는 api 호스트에만 있다(셀러 호스트에는 없음). 연쇄 `Select` 3개로 소분류(깊이 3)만
  보낸다.

BE 엔드포인트가 없어 목업으로만 동작하는 것(`products.mock.ts`, `products.queries.ts`의 `BE 엔드포인트 없음` 구역)
- **수정 폼 프리필 단건 조회**: BE에 현재 `categoryId`, 설명, 할인 기간, 추가/상세 이미지 키를 돌려주는 API가 없다.
  `SellerProductDetail`은 PUT 본문 필드 + `productId`만 담는다.
- **삭제**: DELETE가 없다. 판매 이력 규칙(CRQ-PRD-05)과 에러 코드는 BE가 생길 때 정한다. 목업은 항상 지운다.
- **임시저장**: 목록, 단건, upsert, 등록 후 삭제. 등록 본문에는 임시저장 id를 실을 자리가 없어 등록 성공 뒤
  `useRegisterProduct`가 따로 지운다.

그 밖의 화면 결정
- **배송 정책**: 셀러 단위(CRQ-SLR-04)라 등록 본문에 넣지 않는다. 폼 6번 칸은 `ShippingPolicySummary`
  (shipping-policy feature) 읽기 전용 요약과 새 탭 `배송 정책 수정` 링크다. feature끼리 import할 수 없어 라우트가
  `shippingSummary` 슬롯으로 넘긴다.
- **가격 UI**: 정가 필수 + `할인 설정` 토글(할인가, 할인율, 시작일/종료일). 할인가는 0부터 정가까지, 시작일 필수,
  종료일은 비우면 계속 할인이다.
- **목업에서 뺀 칸**: 상품 속성, 사료/간식 정보, 검수/저장은 BE 필드가 없어 넣지 않았다. 한 페이지 단일 제출이라
  `다음 단계` 버튼도 없다.
- **필수값 안내(CRQ-PRD-02)**: 필드를 `FieldAnchor`(id=`product-field-{key}`) div로 감싼다. 제출 시 첫 오류 키로
  `scrollIntoView` + 포커스 + `role=tooltip` 말풍선을 띄운다. DS에 Tooltip이 없어 말풍선은 feature에 둔다.
- **미리보기**: 고를 때는 objectURL 미리보기만 만들고 업로드는 제출/임시저장 직전에 한다(presigned 10분). 삭제 시와
  언마운트 시 이 화면이 만든 objectURL만 해제한다.

실연동 때 확인할 것 (be origin/develop terraform 기준, 2026-10-07)

셀러 웹 배포 도메인은 `seller-dev.aechak.co.kr`(prod `seller.aechak.co.kr`, Cloudflare Pages `aechak-seller`)이다.
web-seller는 로그인/토큰 갱신/업로드/카테고리를 api 호스트(`api-dev.aechak.co.kr`)에서, 상품 API를 seller 호스트
(`seller-api-dev.aechak.co.kr`)에서 쓴다. seller 호스트는 api가 발급한 토큰을 공개키로 검증만 한다.

1. **CORS와 로그인 복귀 URL에 셀러 웹 도메인이 없다.** 배포와 로컬 모두 막힌다.
   - seller 호스트: `dev.tfvars`의 `seller_frontend_origins`가 `http://localhost:5174` 하나뿐이고 local 프로파일도
     같다. 배포된 셀러 웹과 로컬 web-seller(5173) 둘 다 상품 API가 CORS에 막힌다. 5174는 이 리포의 web-admin 포트다.
   - api 호스트: CORS와 `AUTH_WEB_RETURN_URLS`가 `https://dev.aechak.co.kr`, `localhost:5175`, `localhost:5173`만
     담는다. 로컬 web-seller는 통과하지만 배포된 셀러 웹은 로그인 복귀, refresh, 업로드, 카테고리가 모두 막힌다.
   - be에 필요한 변경: `seller_frontend_origins`에 `https://seller-dev.aechak.co.kr`과 `http://localhost:5173`,
     api 쪽 허용 목록(`web_origins`)에 `https://seller-dev.aechak.co.kr`.
2. **API base URL이 둘 필요하다.** 지금은 `VITE_API_BASE_URL` 하나다. seller 호스트용 env를 추가하고 Cloudflare Pages
   `aechak-seller` 프로젝트 환경변수에도 둘 다 넣어야 한다.
3. **미디어 base URL.** 목록은 `thumbnailImageKey`만 내려준다. `VITE_MEDIA_BASE_URL`을 `https://media-dev.aechak.co.kr`
   (prod `https://media.aechak.co.kr`)로 로컬 `.env`와 Pages 환경변수 양쪽에 둬야 썸네일이 보인다.
4. **seller 호스트에는 prod 프로파일이 아직 없다.** `boot/seller` 리소스에 `application-dev.yml`과 `-local.yml`만 있다.

---

---

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

## 셀러 상품·어드민 심사 실연동 (2026-10-08)

목업이던 셀러 상품 6종과 어드민 심사 4종을 BE `develop` 계약으로 전환한 배치다. 전환 자체보다
**전환이 새로 만든 실패 경로와 호스트 분기**가 이 절의 본론이다.

### 호스트가 셋으로 갈린 뒤에 생긴 일

BE 실행 모듈이 api·seller·admin 셋인데 FE는 단일 axios 인스턴스를 공유한다. 인스턴스를 복제하는
안을 먼저 검토했다가 접었다 — `accessToken`·`refreshPromise`·`onAuthExpired`가 `client.ts`의 모듈
스코프 변수라 복제하면 세션 상태가 갈리고, 그 상태를 공유하는 별도 저장소를 설계해야 한다. 그래서
인스턴스는 하나로 두고 요청 인터셉터가 경로 접두로 `config.baseURL`만 바꾸는 쪽을 골랐다.

그 과정에서 걸린 것 넷을 남긴다.

1. **"호출부가 api 호스트를 명시했다"를 표현할 수 없다.** `mergeConfig`가 defaults의 `baseURL`을
   늘 채우므로 인터셉터가 보는 `config.baseURL`은 명시했든 안 했든 값이 들어 있다. 기본값과 같은지로
   가르면 "api를 콕 집은 요청"이 기능 호스트로 끌려간다. 전용 표식 `forceApiHost`를 둔 이유다.
2. **`retriedRequests` WeakSet이 재시도를 막지 못하고 있었다.** axios는 `request()`마다
   `mergeConfig(defaults, config)`로 새 config 객체를 만들어서(`Object.create(null)`) 재시도의 401이
   WeakSet에 없는 객체로 돌아온다. "refresh는 성공하는데 원 요청은 계속 401"인 서버를 MSW로 세우고
   가드를 떼어 보니 테스트가 5분이 지나도 끝나지 않았다 — 무한 루프다. mergeConfig가 모르는 키를
   그대로 옮기는 성질을 이용해 `config.authRetried` 불리언으로 막았고 테스트로 고정했다.
3. **모바일이 `configureApiHosts`를 쓰지 않는다.** `_layout.tsx`가 `defaults.baseURL`을 직접 덮으므로
   refresh에 api 호스트를 무조건 명시하면 모바일이 엉뚱한 origin으로 나간다. 기능 호스트가 설정된
   앱에서만 호스트를 고정하도록 조건을 걸어 모바일 동작을 그대로 뒀다.
4. **MSW가 호스트를 합치고 있으면 오배치를 못 잡는다.** 테스트 base가 하나면 셀러 상품 요청이 api로
   나가도 MSW가 똑같이 받아 준다. `API_ORIGIN`·`SELLER_ORIGIN`으로 나누고 `test-setup.ts`가
   실제 앱과 같은 `configureApiHosts`를 부르게 바꿨다. E2E `page.route` 글롭에도 origin을 적었다.

### 목업을 실 API로 바꾸면 실패 경로가 새로 생긴다

목업 시절에는 조회가 실패할 수 없었다. 전환 뒤 세 화면이 실패를 빈 상태로 위장하고 있었다 —
상품 목록은 403/40006을 "조건에 맞는 상품이 없어요"로, 등록 폼은 카테고리 조회 실패에 `return null`로
영구 백지를, 재고 Drawer는 옵션 조회 실패를 빈 서랍으로 내보냈다. 실 API 전환 배치에서는 쿼리마다
`isError`를 어디에 드러낼지 먼저 정하고 시작하는 편이 낫다.

### BE에 대응이 없는 화면은 진입점을 막고 코드는 남겼다

셀러 상품 수정 프리필(`GET /sellers/me/products/{productId}` 부재)·임시저장(BE에 개념 없음)·
삭제(`DELETE` 없음)가 그렇다. 목록과 옵션 응답을 합쳐도 `categoryId`·`description`·할인 기간·
이미지 키를 복원할 수 없고, **PUT이 이미지 목록을 전체 교체하므로 부족한 프리필로 저장하면 기존
이미지와 할인 설정을 잃는다.** 그래서 수정 라우트는 안내만 띄우고 폼 구현은 같은 파일에 보존했다.
삭제는 판매 중지가 노출 제어를 담당하므로 제거했다.

어드민 쪽에서는 화면이 요구하던 세 필드가 서버에 아예 없었다 — 목록의 사업자번호(목록 응답에
필드 자체가 없고 상세에만 평문으로 있다), 상세의 전화번호(`telesalesNumber`는 통신판매업 신고번호이지
전화번호가 아니다), 내부 메모(저장할 엔드포인트가 없다). 셋 다 화면에서 뺐다.

### 어드민 서류 열기 — presigned 5분 만료가 만든 함정 둘

상세 응답의 `downloadUrl`은 유효기간 5분이라 캐시된 상세로 열면 403이다. 그래서 열기 직전에 상세를
재조회하는데, 그 배선에서 둘이 걸렸다.

- **react-query v5의 `refetch()`는 실패해도 reject하지 않는다.** `QueryObserverResult`로 resolve하고
  `data`에 캐시된 직전 값이 그대로 남아서, 재조회가 실패하면 만료된 URL을 그대로 새 탭에 띄운다.
  `refetch`가 `{ detail, isError }`를 돌려주게 바꿔 실패를 호출부가 보게 했다.
- **`await` 뒤의 `window.open`은 팝업 차단에 걸린다.** 사용자 제스처와의 연결이 끊기기 때문이다.
  클릭 안에서 빈 탭을 먼저 열고 재조회가 끝나면 `location.href`를 채우는 순서로 바꿨으며,
  `noopener`를 세 번째 인자로 주면 핸들이 `null`로 와서 URL을 채울 수 없으므로 핸들을 받은 뒤
  `opener`를 끊었다.

### 어드민 앱에는 테스트 기반이 아예 없었다

`vitest.config.ts`에 `exclude: e2e/**`가 없어서 첫 Playwright spec을 넣는 순간 vitest가 그것을
집어삼켜 전체가 깨지는 상태였고, `msw` 의존성도 `src/testing/`도 없었으며 `test-setup.ts`는 한 줄이었다.
E2E spec은 0개였다. 네 가지를 함께 세웠고, 어드민 E2E는 이 저장소 최초다.

어드민 E2E 스텁에서 한 가지가 다르다 — **어드민 요청은 `withCredentials=false`로 나가므로 CORS 응답에
`Access-Control-Allow-Credentials`를 넣으면 안 된다.** 넣으면 스텁이 실제 서버와 달라져서, BE가 그
헤더를 주지 않는다는 사실(이 분기를 만든 이유 자체)을 테스트가 못 잡는다.

### CI

세 앱의 E2E가 모두 `ci.yml`의 `e2e` 잡에서 돈다. 그전에는 web-buyer만 돌았고 주석은 "web-seller/
web-admin은 spec이 0개"라고 적고 있었는데, 셀러 spec 2개가 두 달 전에 들어온 뒤로 갱신되지 않아
그동안 CI 보호 없이 방치돼 있었다.

## 목업 화면 진입 차단과 nav 축소 (2026-10-17)

구매자 앱의 장바구니·주문·결제 실연동(SCRUM-237)과 같은 PR에서, BE 컨트롤러가 없는 셀러·어드민 화면을 AGENTS 6-10 규약대로 정리했다.

- **web-seller**: 대시보드(`/`)·주문(`/orders`)·클레임(`/claims`)·정산(`/settlements`)·배송 정책(`/shipping-policy`)은 라우트 파일 상단의 `SERVER_*_AVAILABLE = false` 게이트로 "준비 중" `UnavailableScreen`만 렌더한다(`/products/$productId/edit`의 `SERVER_PRODUCT_DETAIL_AVAILABLE` 선례). 원 컴포넌트·목업 queries·mutation 훅은 파일로 보존했지만 어떤 경로에서도 도달하지 않는다. nav는 상품 관리·스토어 설정 두 항목만 남겼고, 라우트 파일이 없던 항목(문의/리뷰/쿠폰/공지/계정)도 함께 뺐다. 대시보드는 로그인 복귀 URL이 `/`라 redirect 대신 안내 + "상품 관리로" 버튼으로 두었다. 상품 등록·수정 폼의 목업 배송 정책 요약은 `ShippingPolicyNotice`(준비 중 카드)로 바꿨다.
- **web-admin**: 회원 관리·상품 검수·AI 검수 큐·셀러 계정 관리 네 화면을 같은 방식으로 게이트했고, nav는 홈·셀러 입점 심사(서버 배지)만 남겼다. 라우트가 없는 nav 14개와 상수 배지 7곳을 제거했다. BE에 없는 `POST /auth/login`을 부르던 `features/auth/auth.queries.ts`는 고아 코드라 삭제했고(`LoginForm`·`auth.store`는 보존), 어드민 실로그인은 BE가 ADMIN 역할을 세우는 운영 코드를 갖춘 뒤 web-seller의 카카오 웹 로그인을 이식하는 방향이다.
- **되살리는 법**: 해당 BE API가 머지되면 라우트의 상수를 올리고 nav 항목을 복원한 뒤 `features/*/queries`의 목업 `queryFn`을 생성 fetcher로 바꾼다. 테스트는 `shared/__tests__/unavailable-routes.test.tsx`(seller)와 각 라우트 테스트의 게이트 AC를 그때 반전시킨다.


---

## 어드민 nav 복원 — 숨기지 않고 "준비 중"으로 밝히기 (2026-10-26, SCRUM-302)

위 "목업 화면 진입 차단과 nav 축소"가 **메뉴 항목까지** 걷어낸 것이 문제로 돌아왔다. 어드민 메뉴가
홈·셀러 입점 심사·관리자 관리 셋만 남아, 운영자는 이 도구가 무엇을 다루는지조차 알 수 없었다.

**규약 10의 목적은 "메뉴를 숨겨라"가 아니라 "운영자가 속지 않게 하라"다.** 저장되지 않는 화면을
멀쩡한 화면처럼 보여주면 운영자가 입력하고 저장한 줄 안다 — 막아야 하는 것은 그것이지 메뉴가 아니다.
그래서 이번에는 **메뉴는 전부 되살리고, BE 유무를 글자로 밝히는** 쪽으로 바꿨다.

- **nav 구성**: 차단 이전(26e4b89^)의 5그룹을 그대로 되살리고 그 뒤 생긴 `/admins`(관리자 관리)를
  운영 관리 그룹에 더해 **15항목**이다. 차단 이전의 "확장 예정" 6항목(홈 배너·카테고리·정산·어드민
  계정 권한·고급 통계·세금 신고)은 복원 대상이 아니고, 그중 어드민 계정 권한 관리는 `/admins`가 대신한다.
- **꼬리표**: DS `NavItem`에 `tag?: string`을 더해 라벨 옆에 글자 pill(`'준비 중'`)을 그린다.
  숫자 `badge`와 **필드를 나눈** 이유는 쓰임이 다르기 때문이다 — 배지는 "처리 대기 N건", 꼬리표는
  "아직 열리지 않았다"라 입점 심사처럼 둘을 겸해야 하는 항목에서 한 자리에 겹쳐 쓸 수 없다.
  색이나 점만으로 구별하게 두면 운영자가 알아보지 못하므로 글자로 적고, 그 글자가 **버튼 접근명에
  포함**되어 테스트가 `name: '리뷰 관리 준비 중'`으로 "어느 항목에 붙었는지"까지 고정할 수 있다.
- **BE 실측(2026-10-26 dev)**: admin-api-dev에 있는 것은 `/admin/admins`(+`/{userId}`)와
  `/admin/seller-applications` 계열 넷이 **전부**다. seller·api 호스트에 이름이 닮은 경로
  (`/sellers/me/orders`·`/reviews`·`/inquiries`)가 있어도 셀러·구매자 **본인 스코프**라 운영자가
  전체를 들여다볼 수 없고, 애초에 web-admin은 `sellerOrigin`을 설정하지 않아 `/sellers/**`를 부르면
  어드민이 아니라 api 호스트로 나간다. 그래서 실연동은 셀러 입점 심사·관리자 관리 둘뿐이다.
- **열린 PR**: 상품 검수 관리·AI 검수 큐는 BE #149(SCRUM-282 관리자 확인 큐) + #153~#157이 본체고,
  신고 제재 관리는 #100(SCRUM-231)에 **접수**만 있다(운영자용 제재 조회는 그 PR에도 없다).
- **라우트 파일이 없던 8항목**: 어드민은 셀러와 달리 목업 화면조차 없던 항목이 많았다
  (`/reports`·`/inquiries`·`/orders/monitoring`·`/claims`·`/reviews`·`/chat-monitoring`·
  `/notices`·`/audit-log`). nav 항목만 올리면 404로 가는 죽은 nav(AGENTS 2절 금지)라,
  목업 화면이 아니라 **`UnavailableScreen` 안내만 렌더하는 15줄짜리 라우트**를 새로 뒀다.
- **대시보드(`/`)**: 로그인 복귀 지점이라 비울 수 없다. 집계 API가 없으므로 숫자를 만들지 않고
  안내 + "셀러 입점 심사로" 바로가기를 둔다(web-seller 대시보드 게이트와 같은 모양).
- **되살리는 법**: 해당 BE가 머지되면 `__root.tsx`에서 그 항목의 `tag`만 떼고, 라우트의 게이트
  상수를 올리거나 안내 라우트를 실화면으로 바꾼다. 고정 테스트는
  `apps/web-admin/src/shared/__tests__/admin-nav.test.tsx`의 `LIVE_LABELS`/`PENDING_LABELS`
  두 배열 사이로 항목을 옮기면 된다.
- **도착지까지 고정한다**(codex 교차검토 반영): 주소로 직접 열어 안내를 확인하는 단언은 라벨과
  `key`가 어긋난 것을 **잡지 못한다** — 라벨을 그대로 두고 `key`만 다른 경로로 바꿔도 통과하기
  때문이다. `NAV_DESTINATIONS`가 15항목을 실제로 눌러 (1) `location.pathname`이 그 `key`와 같고
  (2) 도착지 화면의 `h1`이 nav 라벨과 같은 글자인지 본다(15항목 모두 제목=라벨이다). 항목을
  더하면 이 배열에도 넣어야 한다. 대시보드 바로가기도 존재 단언이 아니라 도착지로 확인한다.
- **배지는 실패하면 사라져야 한다**(같은 교차검토): react-query는 재조회가 403·5xx로 실패해도
  캐시된 `data`를 들고 있어, 그대로 반환하면 권한이 끊긴 뒤에도 nav에 **옛 대기 건수**가 남는다.
  `usePendingApplicationCount`는 `query.isError`면 `null`을 돌려준다(상세 재조회의
  `ApplicationDetailRefetch`와 같은 판단). 서버 값을 쓰는 배지를 더할 때도 같게 할 것.
- **권한으로 막힌 화면의 쓰기 버튼은 비활성이다**(같은 교차검토): 명부 조회가 401/20004·403/20005·
  403/20011로 막혔다면 같은 토큰으로 나가는 쓰기도 반드시 거절된다 — `/admins`의 "관리자로 승격"은
  `needsRelogin(error)`일 때 비활성이다. 재시도로 풀릴 수 있는 5xx는 막지 않는다(구별이 요점이다).
- **안내 화면 문구도 -해요체다**: 차단 배치(SCRUM-238) 때 들어간 `~합니다`·가운뎃점 구분자를 네
  게이트 화면(`members`·`sellers`·`products/review`·`products/ai-queue`)까지 함께 고쳤다(5절 카피
  규칙). 게이트 뒤 목업 Drawer의 `${id} · ${닉네임}` 같은 **메타데이터 조합**은 렌더되지 않아
  그대로 뒀다 — 게이트를 열 때 함께 본다.
