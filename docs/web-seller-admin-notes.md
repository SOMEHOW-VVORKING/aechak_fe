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

## 목업 화면 진입 차단과 nav 축소 (2026-10-17) — nav 축소는 2026-10-26에 뒤집혔다

> **주의: 아래 "nav는 상품 관리·스토어 설정 두 항목만 남겼고" 서술은 더 이상 현재 상태가 아니다.**
> 진입 차단(게이트) 자체는 유효하지만 nav 축소는 SCRUM-301에서 되돌렸다 — 바로 다음 절을 볼 것.

구매자 앱의 장바구니·주문·결제 실연동(SCRUM-237)과 같은 PR에서, BE 컨트롤러가 없는 셀러·어드민 화면을 AGENTS 6-10 규약대로 정리했다.

- **web-seller**: 대시보드(`/`)·주문(`/orders`)·클레임(`/claims`)·정산(`/settlements`)·배송 정책(`/shipping-policy`)은 라우트 파일 상단의 `SERVER_*_AVAILABLE = false` 게이트로 "준비 중" `UnavailableScreen`만 렌더한다(`/products/$productId/edit`의 `SERVER_PRODUCT_DETAIL_AVAILABLE` 선례). 원 컴포넌트·목업 queries·mutation 훅은 파일로 보존했지만 어떤 경로에서도 도달하지 않는다. nav는 상품 관리·스토어 설정 두 항목만 남겼고, 라우트 파일이 없던 항목(문의/리뷰/쿠폰/공지/계정)도 함께 뺐다. 대시보드는 로그인 복귀 URL이 `/`라 redirect 대신 안내 + "상품 관리로" 버튼으로 두었다. 상품 등록·수정 폼의 목업 배송 정책 요약은 `ShippingPolicyNotice`(준비 중 카드)로 바꿨다.
- **web-admin**: 회원 관리·상품 검수·AI 검수 큐·셀러 계정 관리 네 화면을 같은 방식으로 게이트했고, nav는 홈·셀러 입점 심사(서버 배지)만 남겼다. 라우트가 없는 nav 14개와 상수 배지 7곳을 제거했다. BE에 없는 `POST /auth/login`을 부르던 `features/auth/auth.queries.ts`는 고아 코드라 삭제했고(`LoginForm`·`auth.store`는 보존), 어드민 실로그인은 BE가 ADMIN 역할을 세우는 운영 코드를 갖춘 뒤 web-seller의 카카오 웹 로그인을 이식하는 방향이다.
- **되살리는 법**: 해당 BE API가 머지되면 라우트의 상수를 올리고 nav 항목을 복원한 뒤 `features/*/queries`의 목업 `queryFn`을 생성 fetcher로 바꾼다. 테스트는 `shared/__tests__/unavailable-routes.test.tsx`(seller)와 각 라우트 테스트의 게이트 AC를 그때 반전시킨다.
- **주문(`/orders`)은 이 목록에서 빠졌다** — 셀러 주문 API가 올라와 게이트를 걷어냈다(아래 "셀러 주문 관리 실연동" 절). 위 목록은 2026-10-17 시점의 기록이다.


## 셀러 주문 관리 실연동 (2026-10-25, SCRUM-291)

셀러 주문 API 5경로가 seller 모듈에 올라와(`GET /sellers/me/orders`, `GET …/{orderPublicId}`,
`POST …/accept`, `POST …/shipment`, `POST …/delivery-complete`) `/orders`의
`SERVER_ORDERS_AVAILABLE` 게이트를 걷어내고 nav 항목을 되돌렸다. 위 "목업 화면 진입 차단"이 적어 둔
되살리는 절차를 처음으로 실행한 자리다.

**주문 상태는 서버 열거형이 정본이다.** 문서에 허용값이 빠져 있다고 보고된 자리(SCRUM-274)라
be `domain/.../order/enums/OrderStatus.kt`를 직접 읽어 8종(`PENDING_PAYMENT` `PAID` `PREPARING`
`DISPATCH_PENDING` `SHIPPING` `DELIVERED` `PURCHASE_CONFIRMED` `CANCELLED`)을 옮겼다. 확인해 보니 dev
`/v3/api-docs`에도 8종이 다 실려 있어 이번에는 문서와 코드가 어긋나지 않았다.

**함정 셋.**

1. **목록 `status` 파라미터는 enum 이름이 아니라 세그먼트 어휘다.** be `SellerOrderStatusFilter`의
   code(`all`·`new`·`awaiting-dispatch`·`shipping`·`delivered`·`cancelled`)를 보내야 하고 하나가 상태
   여러 개를 묶는다(`awaiting-dispatch` = PREPARING + DISPATCH_PENDING, `delivered` = DELIVERED +
   PURCHASE_CONFIRMED). `all`에도 `PENDING_PAYMENT`가 없다 — 결제 전 주문이 테이블에 남는 모델이라
   셀러에게 미결제 건을 보이지 않는다. `PAID`처럼 enum 이름을 보내면 400/90001이다.
2. **송장 등록 경로는 단수 `shipment`이고 정정 경로가 아니다.** 이미 최초 배송 행이 있으면
   409/50302라서, 목업 시절의 "송장 수정" 버튼을 되살리면 셀러가 눌러도 반드시 실패한다 — 버튼을
   지우고 `canRegisterShipment(status, hasShipment)`가 송장 유무까지 본다. Modal 문구도 "등록한 송장은
   셀러센터에서 바꿀 수 없어요"로 알린다.
3. **`PREPARING`에서 송장을 등록하면 서버가 2단 전이한다**(PREPARING → DISPATCH_PENDING → SHIPPING,
   enum이 직행을 막는다). 응답 `orderStatus`가 SHIPPING으로 오는 이유이고, FE가 중간 상태를 따로
   만들어 보낼 필요가 없다.

**수령인명·연락처는 서버가 평문으로 준다**(be `SellerOrderSummaryResponse` 주석: "마스킹은 화면이
한다"). 셀러는 송장을 붙이려면 둘 다 온전히 봐야 하므로 지울 수는 없다 — 목록에서만 연락처 가운데를
가리고(`maskContactNumber`) 실제로 발송을 준비하는 상세 Drawer에서는 그대로 보여준다. 수령인명은 송장에
찍히고 목록에서 주문을 분간하는 기준이라 가리지 않는다.

**택배사는 `shared/couriers`가 이미 서버 마스터를 읽고 있었다**(`GET /sellers/couriers`, 배송 정책 화면이
깔아둔 것). 하드코딩하지 않고 그대로 재사용했고 `courierCode`는 응답 값을 대소문자 그대로 보낸다
(소문자는 404/50303).

**되돌릴 수 없는 전이 둘(발주 확인·배송 완료)은 확인 Modal을 거친다.** 전이표가 PREPARING → PAID를
막고 배송 완료는 구매확정 시계를 시작한다. AGENTS 4절대로 뮤테이션은 Modal이 아니라 라우트가 소유해
그 `isPending`으로 목록의 다른 행 버튼까지 잠근다 — `action → {title,description,confirmLabel}` Record
하나로 Modal을 공유한다.

**`packages/domain`의 셀러 `Order`/`OrderStatus`를 지웠다.** 위 231행이 적어 둔 Batch 5 플레이스홀더
재구성의 결과물인데, web-seller가 와이어 타입을 바로 쓰게 되면서 참조가 0건이 됐다. 서버에 없는 필드
(`purchaseConfirmDeadline: 'D-5'`)를 들고 있어 남겨 두면 새 코드가 지어낸 필드를 다시 요구한다
(AGENTS 6-10). 구매자 쪽 `BuyerOrder*`는 상태머신이 다른 집계 도메인이라 그대로 남는다.

**교차검토로 드러난 함정 셋(같은 모듈을 쓰는 클레임 화면도 그대로 밟는다).**

1. **`50003`(ORDER_ACCESS_DENIED)은 "남의 주문"이 아니라 "셀러 자격"이다.** 주문 모듈에서 이 코드를
   던지는 자리는 be `SellerOrderFacade`의 `requireActiveSeller`·`requireOrderReadableSeller` 둘뿐이고,
   남의 주문·없는 주문은 주문번호 존재를 숨기려고 404/50000으로 통일된다(`findSellerOrder`·`getOwned`).
   조회는 ACTIVE·PAUSED·WITHDRAWAL_REQUESTED까지 열리지만 처리(발주확인·송장등록·배송완료)는 ACTIVE만
   되므로 **휴점 셀러는 목록은 보이고 처리만 403**이다. 셀러 상태를 알려주는 경로가 셀러센터에 없어
   버튼을 미리 감출 수는 없고(스펙의 `/sellers/**`는 couriers·orders·products뿐), 문구가 조회 실패와
   처리 실패 양쪽에서 읽혀야 한다. 상품 화면의 `40004`·`40006`은 ProductErrorCode라 주문 경로로는 오지
   않는다 — 매핑에 넣어 두면 닿지 않는 문구를 테스트가 대신 지켜 준다.
2. **배송완료 거절은 `50002`가 아니다.** be `OrderDeliveryService.complete`는 최초 배송 행을 먼저 찾아
   없으면 404/50300이고, `deliveredAt`이 있는 경우와 조건부 UPDATE(SHIPPING → DELIVERED) 실패를
   **둘 다** 409/50301로 묶는다. 그래서 "SHIPPING이 아닌 주문"도 "이미 배송완료"와 같은 코드로 돌아온다
   — 문구를 둘 다 읽히게 써야 한다. MSW 스텁을 상태만 보고 50002를 주게 두면 틀린 문구가 통과한다.
3. **DS `Modal`은 `loading` 중에도 ESC·스크림·취소를 `onClose`로 흘린다**(`design-system/web/Modal`에
   `confirmDisabled`도 없다). 되돌릴 수 없는 POST는 취소할 수도 없으니, 요청이 떠 있는 동안 창만 닫히면
   셀러는 취소된 줄로 읽는다 — 호출부에서 `isPending`이면 닫지 않게 막는다. 같은 이유로 못 보내는
   상태에서도 확인 버튼이 눌리므로, 조용히 `return`하지 말고 어느 칸이 비었는지 짚어 줘야 버튼이 죽은
   것처럼 보이지 않는다.

**뮤테이션 무효화는 `onSettled`다.** 전이 거절(409/50004·50005·50301·50302)은 대개 다른 탭·다른 사람이
먼저 처리해서 내 목록이 낡았다는 뜻이다. 성공만 무효화하면 사라져야 할 버튼이 그대로 남아 같은 요청을
다시 보내게 되고, 거절 문구가 "목록을 새로고침해 주세요"라고 말하는 일을 사람에게 떠넘긴다.

## 셀러 nav 복원과 "준비 중" 꼬리표 (2026-10-26, SCRUM-301)

위 2026-10-17 배치가 nav 항목까지 뺀 것이 **과했다.** 사장님 지적이 그대로 왔다 — "원래 셀러
대시보드가 네이버 스마트스토어처럼 더 많았는데 지금은 달랑 메뉴 3개뿐이다, 복원해라." 메뉴를
지우면 운영자는 **기능이 사라진 줄 안다.** 게이트의 목적은 "저장되지 않는다는 사실을 알리는
것"(규약 10)이지 메뉴를 감추는 것이 아니었다.

- **이제 nav는 항목을 지우지 않는다.** BE가 없는 항목은 `AppShell.tsx`의
  `tag: PENDING_TAG`(`'준비 중'`)로 표시만 한다 — 꼬리표 유무가 곧 실연동 여부다.
  꼬리표를 떼는 것은 그 경로에 seller BE가 생겼을 때뿐이다.
- **라우트 파일이 한 번도 없던 다섯**(`/inquiries`·`/reviews`·`/coupons`·`/notices`·`/account`)은
  메뉴만 되살리면 404로 갔다. 라우트를 신설하고 `UnavailableScreen`으로 제목 + muted "준비 중"
  `StatusPill` + 안내 + **"이 화면에 들어올 것" 카드**(`upcoming` 프롭)를 보여준다. **지어낸 데이터
  행·표 머리글·저장 버튼은 두지 않는다** — 행 없는 표는 "준비 중"이 아니라 "데이터가 없다"로 읽혀
  규약 10의 취지를 거꾸로 깨뜨린다. 쿠폰과 계정에는 지금 실제로 되는 화면(상품 관리 / 스토어 설정)
  으로 가는 대체 경로 버튼을 뒀다.
- **아이콘은 원래 구성(`04c402c`)의 lucide 이름을 그대로 쓴다** — 고객 문의 `MessageCircle`,
  리뷰 관리 `Star`, 혜택/쿠폰/할인 `Tag`, 알림/공지 `Megaphone`, 계정/보안 `UserCog`. 복원 작업에서
  비슷한 다른 아이콘(`MessageSquare`/`Ticket`/`Bell`/`ShieldCheck`)으로 바꿨다가 codex 교차검토에서
  지적받아 되돌렸다. 목업 `data-lucide`와 1:1이라 이름을 바꾸면 복원이 아니라 변경이 된다.
- **DS는 `NavItem.tag`(글자 꼬리표)와 `NavItem.badge`(숫자 배지)를 별개 필드로 둔다.** 처음에는
  `badge`를 `number | string`으로 넓혔는데, 어드민 nav(SCRUM-302)에 둘을 **겸하는** 항목이
  있다(셀러 입점 심사 = 대기 N건 + 열려 있음). 한 필드로는 겸할 수 없어 통합(SCRUM-304)에서
  `tag` 쪽으로 합쳤다. 렌더는 `NavTag`/`NavBadge`로 나뉘고 꼬리표가 배지보다 앞자리다 —
  꼬리표는 muted(아직 열리지 않았다), 배지는 brand(처리할 일이 쌓였다)라 같은 색으로 그리면
  "준비 중"이 처리할 일처럼 읽힌다. **숫자 경로의 0 숨김과 99+ 상한은 글자 그대로 보존했다.**
- **꼬리표가 부재 단언을 조용히 통과시킨다 — 이 함정을 기억할 것.** 꼬리표 텍스트가 버튼 안에 들어가
  접근성 이름이 `"<항목> 준비 중"`이 되므로, `queryByRole('button', { name: '대시보드' })`는 항목이
  nav에 꼬리표와 함께 올라와 있어도 **못 찾고 그냥 통과한다**(실측 확인). nav 항목 부재를 물어야 할
  때는 항목 이름 접두 정규식(`new RegExp('^' + label)` 꼴)으로 물 것. 반대로 존재를 물을 때는
  `'고객 문의 준비 중'`처럼 꼬리표까지 포함한 이름으로 물어 꼬리표 유무를 같이 검증한다
  (`unbuilt-routes.test.tsx`). 이 함정을 처음 발견한 자리는 `unavailable-routes.test.tsx`의
  `AC-SELLER-GATE-003`이었는데, 그 파일은 SCRUM-300이 게이트를 모두 열면서 `app-nav.test.tsx`로
  대체돼 사라졌다(막힌 라우트가 하나도 남지 않아 단언 대상이 없어졌다).
- 라우트를 더했으니 `routeTree.gen.ts`를 `vite build`로 갱신해 커밋했다(standalone
  `generate-routes`는 무효). 다시 돌려 diff가 비는 것으로 확인했다.

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

---

## nav 복원 세 브랜치 통합 (2026-10-26, SCRUM-304)

셀러 실연동(SCRUM-300) · 셀러 미구현 화면(SCRUM-301) · 어드민(SCRUM-302) 셋을 `origin/main` 위
한 브랜치로 합쳤다. 세 브랜치가 모두 같은 커밋에서 갈라져 나왔고 충돌은 네 자리였다.

**공유 파일 충돌과 결정.**

| 자리 | 충돌 | 결정 |
|---|---|---|
| `web-seller AppShell.tsx` | 300이 실연동 7항목, 301이 준비 중 5항목을 같은 `groups`에 넣었다 | **양쪽 보존** — 차단 이전 정본(`26e4b89^`)의 4그룹 12항목 |
| `design-system SideNav.tsx` | 301은 `badge: number \| string`, 302는 별도 `tag?: string` | **`tag`로 통일** (아래) |
| `unavailable-routes.test.tsx` | 300이 삭제, 301이 수정 | **삭제 채택** — 게이트가 다 열려 막힌 라우트가 0건이라 단언 대상이 없다 |
| `AGENTS.md`, `docs/web-seller-admin-notes.md` | 세 브랜치가 각자 서술을 더했다 | 한 벌로 합침 |

**`badge`를 넓히는 길이 막히는 이유.** 어드민 nav에는 숫자 배지와 글자 꼬리표를 **겸하는** 항목이
있다 — 셀러 입점 심사는 "대기 2건"(서버 값)이면서 동시에 "열려 있음"이다. 한 필드가 둘을 겸하면
이 조합을 표현할 수 없고, 301의 `AC-SELLER-UNBUILT-002`·302의 `AC-ADMIN-NAV-003`이 양쪽에서 같은
자리를 요구해 양립하지 않는다. 그래서 `tag`(글자, muted, 앞자리) / `badge`(숫자, brand, 뒷자리)로
나눈 302 설계를 택하고 셀러도 `tag`를 쓴다. 꼬리표 글자가 버튼 접근명에 들어가는 성질은 두 설계가
같아 **301의 테스트는 한 줄도 고치지 않고 통과**했다(`name: '고객 문의 준비 중'`).

**셀러 nav는 12항목이다** — 운영 5(대시보드·주문/배송 관리·취소/반품/교환·고객 문의·리뷰 관리) /
판매 설정 3(상품 관리·배송 정책·혜택/쿠폰/할인) / 정산 1(정산/매출) / 스토어 3(스토어 설정·
알림/공지·계정/보안). 실연동 7 + 준비 중 5다. 통합 지시서에는 "11항목"으로 적혀 있었는데 정본
파일을 세어 보면 12이고(300의 7 + 301의 5, 겹침 없음), 지시서가 "정본을 따른다"고 못박았으므로
정본을 따랐다.

**`/store-settings` 제목은 nav 라벨과 늘 같지 않다.** 입점 신청 상태별로 갈린다(none/draft →
"스토어 개설 신청", submitted/reviewing → "스토어 개설 심사", rejected → "스토어 개설 · 서류 보완",
approved → "스토어 설정"). nav 클릭 도착지를 `h1 === 라벨`로 고정하는 테스트는 **승인 셀러로
시드해야** 한다 — 시드 없이 돌리면 신청 조회가 404(=none)라 그 한 항목만 빨개진다.

**지운 파일과 대체물**(전부 SCRUM-300이 목업을 실 API 계약으로 바꾸면서 생긴 것이고, 통합에서
새로 지운 것은 맨 아래 한 줄뿐이다).

| 지운 것 | 대체물 |
|---|---|
| `features/{orders,claims,dashboard,settlements,shipping-policy}/*.mock.ts` (+ 그 `*.mock.test.ts`) | 각 feature의 `*.contract.ts` + MSW 핸들러 |
| `features/orders/__tests__/OrdersTable.test.tsx` | `features/orders/__tests__/orders-route.test.tsx` |
| `features/claims/components/{ClaimActionConfirmModal,RefundConfirmModal}.tsx` | `ClaimApproveModal` · `ClaimRejectModal` · `ClaimInvoiceModal` |
| `features/shipping-policy/components/ShippingPolicyNotice.tsx` (목업 준비 중 카드) | 실 정책을 읽는 `ShippingPolicySummary` |
| `shared/__tests__/unavailable-routes.test.tsx` | `shared/__tests__/app-nav.test.tsx` (통합에서 결정) |

**화면 코드는 하나도 지우지 않았다.** 라우트 파일은 셀러 5개(`/inquiries`·`/reviews`·`/coupons`·
`/notices`·`/account`) + 어드민 8개가 **늘었다**.

**교차검토에서 고친 것 넷**(codex read-only, 2026-10-26). 메뉴 누락·중복은 없다고 나왔고 —
셀러 12항목·어드민 15항목의 그룹·순서·아이콘이 정본과 일치하고 죽은 `key`가 없다 — 대신 결함
하나와 테스트 구멍 셋이 걸렸다. 넷 다 코드로 재현해 확인한 뒤 고쳤다.

1. **낡은 목록에서 처리 버튼이 계속 눌렸다**(목록 재조회 실패 시). 재조회가 403으로 떨어지면
   react-query가 직전 성공 데이터를 들고 있어 행이 그대로 남는데, 행 버튼은 `isMutating`만 보고
   있어 눌렸다. 확인 Modal은 **그 행의 값**으로 만들어지므로 셀러는 서버에 없는 상태를 보고
   되돌릴 수 없는 전이를 지시하게 된다. 같은 레포의 `ClaimDetailDrawer`는 이미 상세 조회 실패에
   `isMutating={isMutating || detail.isError}`로 처리를 잠그고 있었다 — 목록만 그 규칙을 안 따랐다.
   `OrdersTable`에 `isError`를 더하고(`actionsLocked`), `ClaimsTable`의 판정 버튼을
   `decisionsLocked`로 잠갔다. 행은 지우지 않는다(마지막으로 본 내용은 정보다). **클레임의
   '회수 처리'는 예외** — mutation이 아니라 상세 Drawer를 여는 버튼이고 상세가 스스로 다시
   조회하므로, 열어 보는 길까지 막으면 셀러가 확인할 방법이 없어진다.
2. **꼬리 슬래시 경로에서 활성 메뉴가 사라졌다**(어드민만). 어드민 라우트는 대부분 index 라우트라
   `/sellers/`로 들어온 경로가 그대로 유지되는데 셸이 pathname을 `activeKey`로 그냥 넘기고
   `SideNav`는 완전 일치로 비교한다 — 화면은 열리지만 `aria-current`가 **0개**가 되어 운영자는
   자기가 어느 메뉴에 있는지 알 수 없다(실측 확인). `navActiveKey`로 꼬리 슬래시만 떼어 고쳤고
   루트(`/`)는 건드리지 않는다(떼면 빈 문자열이 되어 대시보드가 영구 비활성). 셀러 `AppShell`은
   첫 세그먼트로 맞춰 와서 애초에 면역이었다. 테스트의 `normalizePath`는 **도착지 단언만** 보정해
   이 차이를 잡지 못했다 — 헬퍼가 production 버그를 가려 준 자리다.
3. **그룹 소속을 아무 테스트도 지키지 않았다.** 머리글 존재와 항목 존재를 각각 전역에서 찾기만
   해서, 어드민 '리뷰 관리'를 주문/클레임에서 운영 관리로 옮겨 봤더니 **나머지 37개가 전부
   초록**이었다(항목 수·머리글 수·클릭 도착지가 다 그대로다). 통합이 지킨 것이 바로 그 배치라
   `SideNav`가 머리글을 `role="group"` + `aria-labelledby`로 항목과 묶게 하고(스크린리더가
   그룹을 읽지 못하던 문제도 같이 해결) 두 nav 테스트에서 `within(getByRole('group'))`으로
   소속과 그룹별 항목 수를 단언한다.
4. **`tag`+`badge` 겸용을 아무 테스트도 지키지 않았다.** 필드를 나눈 근거가 "한 항목이 둘을
   겸해야 한다"인데, 테스트는 배지가 붙은 항목과 꼬리표가 붙은 항목을 **서로 다른 항목에서**
   확인해 둘 중 하나만 렌더해도 통과했다. 지금 겸하는 항목이 production에 없으므로 DS에 직접
   조합을 넘기는 `side-nav-tag-badge.test.tsx`로 계약을 고정했다(순서·0 숨김·99+ 상한 포함).
   DS 패키지에는 러너가 없어 소비앱에 둔다(AGENTS.md 4절).

넷 다 **고치기 전에 먼저 실패하는지 확인**했다(production 수정을 되돌려 빨개지는 것을 보고 복구).

---

## 어드민 예시 데이터 화면 복원 — 막는 대신 밝히기 (2026-10-27, SCRUM-308)

SCRUM-302가 nav 15항목을 되살렸지만 **꼬리표가 붙은 13항목은 눌러 들어가도 `UnavailableScreen`이
가로막아 화면 내용을 볼 수 없었다.** 사장님 지적은 "그냥 목 데이터 기반으로 잘 들어가 있었는데
그걸 다 없애버렸다"였고, 메뉴를 눌러도 기능의 모양을 볼 수 없으면 메뉴를 숨긴 것과 같다.

### 실측 — 13화면의 상태가 둘로 갈려 있었다

지시서에는 "화면 파일이 300~500줄짜리로 전부 살아 있다"고 적혀 있었지만 git 전수로 확인한 결과
그렇지 않았다. **되돌릴 화면과 처음부터 없던 화면을 섞어서 세고 있었다.**

| | 화면 | 상태 |
|---|---|---|
| 게이트 뒤에 목 화면이 살아 있던 4개 | `/sellers`(319줄) · `/members`(330줄) · `/products/review`(358줄) · `/products/ai-queue`(388줄) | `SERVER_*_AVAILABLE = false` 상수 하나가 돌려보냈고, 목 데이터는 `features/*/\*.mock.ts`에 그대로 있었다 — **게이트만 걷으면 보인다** |
| 내용이 아예 없던 9개 | `/`(대시보드) · `/reports` · `/inquiries` · `/orders/monitoring` · `/claims` · `/reviews` · `/chat-monitoring` · `/notices` · `/audit-log` | 전부 18~25줄짜리 안내 라우트. `git log --diff-filter=A`로 전수 확인한 결과 **이 경로에 목 화면이 있던 리비전이 없다**(`4c16935 [SCRUM-302]`가 꼬리표용으로 신설). 차단 이전(`26e4b89^`)의 web-admin 라우트는 7개뿐이었고 그때 `index.tsx`는 "Aechak Admin" 한 줄 플레이스홀더였다 |

즉 "없앤" 것은 4화면이고 9화면은 처음부터 없었다. 그래도 운영자가 보는 결과는 같으므로(눌러도
아무것도 못 본다) 복원과 신설을 한 배치에서 **같은 모양으로** 맞췄다.

### 결정 — 게이트를 걷고 띠를 붙인다

- **공용 띠 하나**(`shared/components/MockDataNotice.tsx`)를 만들어 13화면이 재사용한다. 화면마다
  문구를 손으로 쓰면 어떤 화면은 "저장되지 않는다"를 빼먹게 되고, 그게 규약 10이 막으려던 상태다.
  같은 파일이 쓰기 토스트 문구(`MOCK_WRITE_TOAST`)도 들고 있다.
- **쓰기는 보이되 나가지 않는다.** 네 화면의 기존 처리 함수는 이미 `useDetailList`의 `patchRow`로
  화면에만 겹쳐 그리고 있어 네트워크를 타지 않았는데, **성공 토스트(`계정 상태를 변경했어요`)가
  저장된 척을 했다.** 그 문구를 전부 `MOCK_WRITE_TOAST`로 바꾸고 Toast variant도 `success` →
  `warning`으로 내렸다. 신설 9화면도 같은 패턴을 따른다.
- **nav 꼬리표는 그대로 둔다.** 띠는 들어간 뒤에 보이므로, 들어가기 전에 알 수 있는 통로가
  꼬리표다. 둘은 역할이 갈리고 **짝이 맞아야** 한다(아래 테스트).
- **실연동 2화면에는 띠를 붙이지 않는다.** `/sellers/applications`·`/admins`에 붙이면 실데이터를
  예시로 의심하게 만들어 거꾸로 속이는 셈이 된다. (2026-10-28 SCRUM-313에서 `/members`가 붙어
  **셋이 됐다** — 아래 그 절을 볼 것.)
- **대시보드의 심사 대기 수만 실 API 값이다.** `usePendingApplicationCount`를 그대로 쓴다(nav
  배지와 같은 queryKey라 조회가 늘지 않는다). 그 칸까지 예시 숫자로 채우면 **대시보드와 nav 배지가
  서로 다른 말을 한다** — 같은 이유로 SCRUM-302가 상수 배지를 금지했다. 그 카드만 `실데이터` pill을
  달고 나머지 카드는 `예시` 꼬리말을 단다.
- **예시 타입은 `@aechak/domain`이 아니라 feature 폴더에 둔다.** 기존 4화면의 타입(`MemberAccount`
  등)은 domain에 있지만, 신설 9화면은 **맞출 와이어 계약이 아직 없다** — 계약이 생기면 그 응답
  모양으로 옮긴다. 병렬 작업(SCRUM-307)과 공유 패키지에서 충돌하는 것도 피했다.
- **`shared/components/UnavailableScreen.tsx`를 지웠다**(web-admin만). 13화면이 모두 열려 참조가
  0건이 됐고, 남겨 두면 "막는" 방식이 다시 끼어든다. web-seller의 같은 이름 파일은 SCRUM-307
  범위라 건드리지 않았다.

### 신설 9화면이 그리는 것

전부 web-admin 공유 패턴(목록 `DataTable` → 행 클릭 `Drawer`(lg) → 파괴적 액션은 확인 `Modal`)과
프리미티브 6종을 재사용했다. 새 DS 컴포넌트는 만들지 않았다.

| 화면 | 내용 | 쓰기 |
|---|---|---|
| `/` 대시보드 | 지표 8장 + 최근 7일 거래액 `BarChart` + "확인이 필요한 일" 목록(각 화면으로 이동) | 없음 |
| `/reports` | 신고 목록(대상 유형·누적 신고·상태) | 제재 결정 3종 + 확인 Modal |
| `/inquiries` | 문의 목록(유형·경과 시간, 24시간 초과 강조) | 답변 등록 + 확인 Modal |
| `/orders/monitoring` | 지표 4장 + 주문 목록(송장·지연 신호), 상세는 `Timeline` | 셀러 발송 독촉 + 확인 Modal |
| `/claims` | 클레임 목록(유형·귀책·환불 예정), 상세에 양쪽 주장 나란히 | 귀책 판정 3종 + 확인 Modal |
| `/reviews` | 리뷰 목록(별점 `RatingInput` readonly·신고 수·블라인드 주체) | 유지/블라인드/삭제 + 확인 Modal |
| `/chat-monitoring` | 상담방 목록(위험 신호), 상세에 대화 전문 | 운영자 개입 + 확인 Modal |
| `/notices` | 공지 목록(대상·푸시 도달), 상세는 제목·내용·푸시 토글 폼 | 게시하기 + 확인 Modal(푸시 켜면 danger) |
| `/audit-log` | 액션 로그 목록(관리자·액션·결과·IP), 상세에 요청 추적 ID | **없음(읽기 전용)** |

### 테스트에서 뒤집은 계약

- `admin-nav.test.tsx`의 `AC-ADMIN-NAV-004`가 **반대로 바뀌었다.** 전에는 "표가 없다 / 제출 버튼이
  없다"를 단언했는데, 지금은 꼬리표가 붙은 13 목적지에 **띠가 있어야** 한다. 짝을 맞추려고
  `AC-ADMIN-NAV-010`(실연동 2화면에는 띠가 **없어야** 한다)을 함께 뒀다 — **한쪽만 단언하면 반쪽이
  썩는다**: 띠만 보면 실데이터 화면에 띠를 붙여도 통과하고, 없음만 보면 예시 화면에서 띠가 빠져도
  통과한다.
- `AC-ADMIN-NAV-005`는 "셀러 입점 심사로" 바로가기 버튼이 사라져(대시보드가 실화면이 됐다) **심사
  대기 카드 클릭 → `/sellers/applications` 도착**으로 바꿨다.
- 새 파일 `shared/__tests__/admin-mock-screens.test.tsx`가 13화면을 **이름으로** 하나씩 확인한다 —
  제목(`h1`) + 그 화면에만 있는 문자열 + 띠 문구 + 본문 행이 있는 표. 개수만 세면 한 화면이 다른
  화면으로 바뀌어도 통과한다.
- **쓰기가 안 나가는 것은 "요청 0건"으로 단언할 수 없다.** 셸이 nav 배지를 채우려 심사 대기 수를
  한 번 조회하기 때문이다. `server.events.on('request:start')`로 URL을 모아 두고, **셸의 그 조회
  하나만 허용 목록에 두고 나머지 전부**가 0건인지 본다(`isShellBadgeRead`). MSW의
  `onUnhandledRequest: 'error'`만 믿으면 **핸들러가 있는 경로로 잘못 나가는 쓰기**(예: 어드민
  명부 POST)를 놓친다.

  **처음에는 "버튼을 누른 직후를 기준선으로 잡아 그 뒤에 늘어난 요청"을 봤는데 그게 구멍이었다**
  (교차검토에서 지적받아 실측으로 확인). 확인 Modal이 **없는** 흐름 — 셀러 관리의 `저장`, 상품
  검수의 `검수 통과` — 은 **액션 클릭 자체가 쓰기 실행**이라, 기준선을 그 클릭 뒤에 잡으면 그
  요청이 기준선에 삼켜져 단언이 영원히 통과한다. `handleSaveMemo`에 `POST /admin/admins`를 심어도
  초록이었고, 확인 Modal이 있는 회원 관리에 같은 것을 심으면 잡혔다 — **11흐름 중 2흐름에서만
  테스트가 눈이 멀어 있었고, 그 둘이 바로 게이트 때문에 한 번도 실행된 적 없는 복원 화면이다.**
  기준선을 쓰지 않는 지금 방식은 타이밍에 기대지 않아 늦게 나가는 요청도 목록에 남는다.
- 띠와 토스트가 **같은 문구를 품는다**는 함정: `findByText(/저장되지 않아요/)`는 둘을 함께 잡아
  "found multiple elements"로 깨지고, 반대로 띠 하나만으로 통과시킬 수도 있다. 토스트는 전문
  (`예시 화면이라 저장되지 않아요. 바뀐 표시는 새로 고치면 사라져요.`)으로 찾는다.
- 또 하나: **필터 `Select`의 `<option>`이 상태 pill과 같은 글자**라, `getByText('이용 제한')`으로는
  목록이 비어 있어도 통과한다. 목록 단언은 `within(screen.getByRole('table'))`로 좁혀야 한다.

### 교차검토에서 고친 것 (2026-10-27, codex `gpt-6.1-sol`)

지적 5건을 받아 하나씩 코드로 확인했다. **5건 다 타당했고 전부 고쳤다.** 고치는 과정에서 지적에
없던 결함 하나를 더 찾았다.

1. **(major) 쓰기 차단 테스트가 11흐름 중 2흐름에서 눈이 멀어 있었다** — 위 "쓰기가 안 나가는
   것은" 항목에 실측과 함께 적었다. 기준선 방식을 버리고 허용 목록 방식으로 바꿨다.
2. **토스트를 `success`로 되돌려도 통과했다.** 문구만 단언했기 때문이다. DS `Toast`는
   warning/error만 `role="alert"`로 올리고 success는 `role="status"`라(`Toast.tsx`의
   `variantStyle`), **토스트에서 `closest('[role="alert"]')`로 거슬러 올라가** 그 되돌림을 잡는다.
   띠도 `role="alert"`라 전역 `getByRole('alert')`로는 가를 수 없어 토스트 쪽에서 찾는다.
   (`variant`를 `success`로 바꿔 빨개지는 것을 확인했다.)
3. **클레임의 배송비 부담 Select가 동작하지 않는 입력이었다.** `shippingBearer`를 `Select`가
   수정하고 확인 Modal이 **그 값을 보여주는데** `patchRow`에서 빠져 있어, 드로어를 다시 열면
   사라졌다 — 저장되지 않는 것보다 나쁜 것은 **정해진 척하는 것**이다(2절의 죽은 UI 금지).
   `AdminClaim`에 `shippingBearer`를 더하고 처리에 실어 화면에 남게 했다. **귀책에서 계산하지
   않는 이유**: 플랫폼 부담(택배사 과실 등)은 귀책 두 값으로 표현할 수 없다. `AC-ADMIN-MOCK-008`이
   처리 뒤 재진입까지 고정한다.
4. **감사 로그의 읽기 전용 단언이 목록만 봤다.** 버튼 이름 4개(`제출`·`저장`·`게시하기`·`발송`)를
   금지했는데 상세 Drawer를 열지 않아 거기 붙는 쓰기를 못 보고, 목록에 없는 이름으로 붙이면 그냥
   통과했다. **이름 금지에서 허용 목록으로 뒤집었다** — `role="main"`으로 nav를 빼고 본문 버튼이
   전부 행을 여는 시각 링크인지, 상세 Drawer의 버튼이 `닫기` 하나인지 본다.
5. **새 화면에 가운뎃점(`·`)이 사용자 노출 문구로 남아 있었다**(5절 카피 규칙은 `/`). 13화면의
   라우트·목 데이터에서 **사용자에게 보이는 `·`만** `/`로 바꿨다(주석은 그대로). 복원 4화면에도
   같은 위반이 있었는데 게이트 때문에 그 문구가 운영자에게 도달한 적이 없었다 — 열어 둔 지금은
   범위에 들어온다.

**지적에 없던 결함(테스트를 돌리다 React 경고로 드러났다)**: `/notices`의 대상 필터가
`Encountered two children with the same key, 'all'`을 띄우고 있었다. **이 축에는 `'all'`이 실제
값으로 있다**(전체 회원 대상 공지) — 다른 어드민 화면의 `'all'` 미선택 센티넬 관례를 그대로 써서
같은 `value`가 옵션에 두 번 들어갔고, 더 나쁜 건 운영자가 "전체 대상"을 골라도 아래 조건이
미선택으로 읽어 **전체가 그대로 남는** 것이었다(동작 안 하는 필터 = 2절 금지). 센티넬을
`AUDIENCE_ANY = 'any'`로 갈랐고 `AC-ADMIN-MOCK-007`이 세 상태의 행 수를 고정한다.
**교훈: `'all'` 센티넬은 도메인 값에 `'all'`이 없는 축에서만 쓸 수 있다.**

고친 것 넷(2·3·4와 notices)은 **production 쪽을 되돌려 빨개지는 것을 먼저 확인**한 뒤 복구했다.

#### 2라운드 (같은 모델, 반영분 재검토)

새 지적 2건. **둘 다 타당해서 고쳤다.** 1라운드 지적의 수정에 대해서는 새 결함이 없다고 했다
(기준선 제거·토스트 role·감사 로그 허용 목록·`shippingBearer`·13화면 띠 전부 "문제 없음").

1. **(minor) 한 화면의 쓰기 핸들러가 여럿인데 대표 하나만 눌렀다.** 셀러의
   `handleConfirmSuspend`, 상품 검수의 `handleKeepBlinded`·`handleConfirmStopSale` 셋이 감시
   밖이었다 — 그 셋에 요청이 들어가도 잡히지 않는다. WRITE_FLOWS를 11 → 14흐름으로 늘렸다.
   판매정지는 사유·기간이 비면 버튼이 잠기므로 `prefill`로 Select를 먼저 채운다. **새 흐름 둘에
   요청을 심어 빨개지는 것을 확인했다** — 확인 Modal이 없는 블라인드 유지도 잡힌다(허용 목록
   방식이라 기준선이 없다).
2. **(minor) 예시 사유를 옵션 코드가 아니라 라벨 문자열로 넣어 뒀다.** `blindReason:
   '광고/스팸'` vs `{ value: 'ad-spam', label: '광고/스팸' }` — `Select`의 `value`와 맞지 않아
   상세를 열면 기존 사유가 **선택되지 않고 빈 칸**으로 보였고, 확인 Modal만 `?? 원문` 되돌림
   덕에 글자가 남아 더 헷갈렸다. `ai-review-queue`는 처음부터 코드를 쓰고 있었으니 그 패턴으로
   맞췄다. **리뷰 표는 사유를 그대로 그리고 있어** 코드로 바꾸면 `ad-spam`이 운영자에게 보인다 —
   `blindReasonText` 하나를 표와 상세가 함께 쓰게 했다.

**정정**: 2라운드에서 내가 "`value`는 건드리지 않아 조회가 그대로 맞는다"고 주장했는데,
`value`를 안 건드린 것은 맞지만 **목 데이터가 애초에 코드가 아니어서 조회가 맞은 적이 없었다.**
카피 치환이 만든 문제는 아니지만 주장은 틀렸다.

---

## 어드민 일반 회원 관리 실연동 (2026-10-28, SCRUM-313)

위 SCRUM-308 절의 숫자("13화면", "실연동 2화면")는 **2026-10-27 기준**이다. 이 티켓이
`/admin/members` 넷(목록·상세·제재·해제)을 실서버에 붙여 재고가 한 칸 움직였으니, 그 절을
읽고 띠를 다시 붙이지 말 것.

- **예시 데이터 화면 13 → 12.** `/members`가 빠졌다. `nav`의 `tag`와 화면 상단
  `MockDataNotice`를 **코드에서 함께** 뗐다 — 한쪽만 떼면 꼬리표와 띠의 짝이 어긋나
  `admin-nav.test.tsx`가 깨진다(그 짝을 단언하는 것이 그 파일의 일이다).
- **띠를 붙이지 않는 실연동 화면 2 → 3.** `/sellers/applications`·`/admins`·`/members`.
  `admin-nav.test.tsx`의 `LIVE_LABELS`도 셋이고, `admin-mock-screens.test.tsx`의 `SCREENS`는
  12행이다. **AGENTS.md 36행·규약 10 끝 문단·이 두 테스트 네 자리가 같은 숫자를 말해야 한다** —
  어긋나면 다음 사람이 이미 실연동된 화면에 예시 데이터 띠를 다시 붙인다(교차검토 지적).
- `members.mock.ts`는 지웠고 `members.map.ts` + `members.queries.ts`가 실 API 응답을 받는다.
  `MemberAccount` 류 타입은 `@aechak/domain`에 있던 것을 와이어 계약 모양으로 맞췄다.

## 어드민 문의·클레임·리뷰 실연동 (2026-10-30, SCRUM-331)

위 두 절의 숫자("13화면"·"12화면", "실연동 2화면"·"3화면")는 그 날짜 기준이다. 이 티켓이
`/admin/inquiries` 넷 · `/admin/claims` 넷 · `/admin/reviews` 다섯을 붙여 재고가 세 칸 움직였다.

- **예시 데이터 화면 12 → 9.** `/inquiries`·`/claims`·`/reviews`가 빠졌다. nav의 `tag`와 화면
  상단 `MockDataNotice`를 코드에서 함께 뗐다.
- **띠를 붙이지 않는 실연동 화면 3 → 6.** `admin-nav.test.tsx`의 `LIVE_LABELS`도 여섯이고
  `admin-mock-screens.test.tsx`의 `SCREENS`는 9행이다(AGENTS.md 36행·규약 10 끝 문단과 함께
  **네 자리가 같은 숫자를 말해야 한다**).

### 실측 — api-docs가 정본이고 springdoc 출력은 한 자리에서 거짓말한다

계약은 `GET https://admin-api-dev.aechak.co.kr/v3/api-docs`(dev 실측, 2026-10-30)와 BE
`origin/develop`의 컨트롤러·애그리거트를 맞춰 읽어 적었다. 두 군데가 어긋난다.

- `GET /admin/reviews`의 파라미터가 api-docs에는 `request`라는 **객체 하나**로 나온다 —
  `@ModelAttribute`를 springdoc이 그렇게 뽑은 것이고 실제 와이어는 `productId`·`rating`·
  `status`·`reported`·`keyword`·`cursor`·`size` **평탄 쿼리**다. 스펙에는 평탄하게 적었다.
- 블라인드·해제·삭제의 성공 응답이 api-docs에는 `200`으로 나오지만 컨트롤러는
  `ResponseEntity.noContent()`라 **204 본문 없음**이다. 스펙은 204로 적었다.
- 인증 없이 찔러 보는 방식으로는 경로 존재를 가릴 수 없다 — admin 모듈은 라우팅 전에
  시큐리티가 걸려 **없는 경로도 401(20004)** 로 돌아온다(`/admin/nope`로 확인).

### 되돌릴 수 없는 처리와 확인 Modal — 드로어까지 함께 잠가야 한다

확인 `Modal`의 `loading`은 **확인 버튼만** 잠근다. ESC·스크림·취소는 `onClose` 하나로 오고,
그보다 먼저 **`Drawer`의 ESC·스크림이 자기 `onClose`를 쏜다**. 라우트의 `closeDrawer`가
`selectedId`와 `confirmOpen`을 같이 비우므로, 요청이 떠 있는 동안 ESC를 누르면 드로어가 닫히고
그 과정에서 확인 Modal까지 사라진다 — 운영자는 삭제·개입이 들어갔는지 알 수 없다.
그래서 세 라우트 모두 닫기 제스처를 **가드 하나**로 모았다.

```ts
function resetSelection() { setSelectedId(null); setConfirmOpen(false) }   // 성공·실패 뒤의 닫기
function closeDrawer() { if (write.isPending) return; resetSelection() }   // Drawer onClose
function closeConfirm() { if (write.isPending) return; setConfirmOpen(false) } // Modal onClose
```

성공 콜백에서 `closeDrawer()`를 부르면 그 시점의 `isPending`을 믿을 수 없어 드로어가 열린 채
남는다 — 성공·실패 경로는 가드를 거치지 않는 `resetSelection()`을 쓴다. 이 계약은 세 라우트의
`[AC-ADM-*-01x] 요청이 떠 있는 동안 …` 테스트가 ESC·취소·스크림 셋을 각각 눌러 고정한다.
**같은 결함이 `/members`에도 남아 있다**(SCRUM-313 범위라 이 티켓에서 건드리지 않았다).

그런데 이 가드는 `onClose`만 막는다 — **라우트 이탈은 그 가드를 지나가지 않는다**(codex 교차검토
지적). 요청이 떠 있는 동안 브라우저 뒤로 가기나 nav 이동으로 화면이 언마운트되면, react-query는
`mutate(vars, { onSuccess, onError })`로 받은 **호출별 콜백을 실행하지 않는다** —
`query-core`의 `MutationObserver.#notify`가 `this.#mutateOptions && this.hasListeners()`로 가둬
놓았고, 관찰자가 사라지면 `hasListeners()`가 false다. 요청 자체는 `MutationCache`에 남아 끝까지
가므로 **서버에서는 삭제·개입·답변이 그대로 들어가고 토스트만 사라진다**. `useMutation` 쪽
`onSettled`(무효화)는 mutation이 options를 들고 있어 그대로 돌지만, 그건 목록을 맞춰 둘 뿐
"방금 그 처리가 어떻게 됐는지"를 말해 주지 않는다.

그래서 닫기 가드 옆에 이탈 가드를 하나 더 둔다 —
`apps/web-admin/src/shared/hooks/usePendingWriteExitGuard.ts`.

```ts
usePendingWriteExitGuard(write.isPending) // 세 라우트가 닫기 가드 바로 아래에서 부른다
```

`@tanstack/react-router`의 `useBlocker`로 **PUSH·REPLACE**(라우터 이동)와 브라우저 **뒤로 가기**를
막고, `enableBeforeUnload`로 새로고침·탭 닫기에 **경고**를 띄운다(차단이 아니다 — 운영자가 경고에서
나가기를 고르면 화면은 사라진다). 가드 함수는 ref를 읽는 **고정 참조**여야 한다 — `useBlocker`의
effect 의존성에 함수가 들어 있어 렌더마다 새 함수를 넘기면 블로커를 매 렌더 등록·해제한다.

**세션 만료의 `/login` 이동은 통과시킨다.** 401 뒤 refresh까지 실패하면 공유 클라이언트가 요청을
reject하기 **전에** 전역 콜백을 부르고, `features/auth`의 `setupAuthExpiredRedirect`가
`router.navigate({ to: '/login' })`을 쏜다. 그 이동을 막으면 ① 처리가 끝난 뒤 아무도 다시 보내
주지 않고, ② 막힌 이동의 약속이 매달려 있어 그 핸들러의 `redirecting` 플래그가 `.finally()`에서
풀리지 못하고 켜진 채 남아 **다음 만료까지 통째로 무시된다**. 인증이 끊긴 관리 화면에 남는 것이
결과를 못 보는 것보다 나쁘다(codex 교차검토 5라운드 지적, `AC-ADM-RVW-022`가 고정).

알고 두는 구멍 둘. ① 브라우저 **앞으로 가기**는 `@tanstack/history`가 막은 POP을 방향과 무관하게
`win.history.go(1)`로 되돌려(설치된 1.162.0 소스) 화면·라우터 상태는 남지만 주소창이 어긋날 수
있고 `ignoreNextPop`이 남아 다음 POP 하나를 먹는다 — 라이브러리 결함이고, 그래도 막는 쪽이
언마운트보다 낫다. ② `isPending`은 `onSettled`의 무효화 **재조회까지** 포함한다(mutation은 그
약속이 끝나야 success를 dispatch한다) — 쓰기 응답이 온 뒤에도 재조회가 늦으면 가드가 그만큼 늦게
풀린다. 그 구간에도 새로고침은 경고일 뿐이라 빠져나갈 길은 남아 있다.

테스트는 메모리 히스토리라 `back()`이 블로커를 거치지 않으므로(`createMemoryHistory`는 블로커를
push/replace에서만 본다) **`router.navigate`로 막힌 것**을 단언한다 — 그리고 막힌 이동의
`commitLocation` 약속은 **다음 성공한 이동이 올 때까지 매달려 있으므로**(router-core가 새 약속에
이전 약속의 resolve를 걸어 둔다) `await`하지 말고 `void`로 띄워야 한다(걸면 그 자리에서 멈춘다).
이탈 가드도 `/members`·`/sellers/applications`·`/admins`에는 없다(같은 이유로 손대지 않았다).

### 목록이 실패한 동안 처리 버튼을 잠근다(규약 6-7)

세 화면 모두 `keepPreviousData`를 쓰므로 재조회가 403으로 실패해도 react-query가 직전 행을 들고
있다. 행은 지우지 않고(마지막으로 본 내용은 정보다) `list.isError`를 `canSubmit`에 넣어 **처리만**
막는다. 같은 이유로 `hasNext`는 `isPlaceholderData`일 때 내린다 — 이전 조건의 `hasNext`로 더
보기를 열어 두면 새 조건의 첫 페이지가 오기 전에 옛 커서를 요구해 페이지를 건너뛴다(리뷰는
커서에 필터 지문이 실려 있어 그 요청이 400/90002로 끊긴다).

### 서버에 없는 필드는 지웠다

- 문의: `channel`(앱/웹/이메일)과 `title`이 서버에 없다. 제목 자리는 서버가 주는
  `contentPreview`(내용 앞 100자)가 쓰고, 내부 메모 입력은 저장할 칼럼이 없어 뺐다.
- 리뷰: `writerNotice`(작성자 안내 문구)가 없다. 처리 사유 메모 `reasonText` 하나뿐이고
  **해제는 본문을 받지 않아** 해제 결정에서는 사유 입력을 그리지 않는다. 운영자 선택지에서
  `PROFANITY`는 뺐다(작성 시점 자동 판정만 쓰는 값이다).
- 클레임: 배송비 부담 주체가 `BUYER`·`SELLER` 둘뿐이다(예시 시절의 `platform`은 없다). 취소
  유형이거나 클레임 불가 판정이면 서버가 명시값도 비우므로 그 조합에서는 입력 자체를 그리지 않는다.

### 실명·연락처는 서버가 가려 주지 않는다 — 화면이 가리지 않으면 아무도 가리지 않는다

BE는 수령인명·연락처를 **복호 평문**으로 내리고 마스킹을 화면 책임으로 둔다
(`AdminClaimDetailResponse.OrderResponse`: "수령인명·연락처는 복호 평문이다 — 마스킹은 화면이
한다", `SellerOrderSummaryResponse`·심사 응답도 같은 말). 클레임 상세의 배송 정보가 그 평문을
그대로 뿌리고 있었고, 테스트가 평문 표시를 단언해 그 상태를 고정하고 있었다(codex 교차검토 지적).

규칙은 `apps/web-admin/src/shared/mask.ts` 한 자리에 있다 — 심사 화면의 대표자명과 클레임의
수령인·연락처가 같은 함수를 쓴다(feature → feature import 금지라 shared로 승격했고
`seller-applications.map.ts`는 이름만 다시 내보낸다).

- `maskPersonName` — 앞뒤 한 자만 남긴다(`김보리` → `김*리`). 빈 값은 `null`.
- `maskContactNumber` — 앞 3·뒤 4만 남긴다(`010-1234-5678` → `010-****-5678`). **숫자 7자리
  이하는 원문 그대로다** — 앞 3 + 뒤 4가 이미 전부라 가려질 숫자가 없는데 그래도 조립하면
  `1234567`이 `123--4567`이 되어 가린 것도 없이 번호만 망가진다(경계 off-by-one, codex 2R 지적).
  숫자가 없는 값도 별표로 덮지 않는다 — 잘못 들어간 값임을 알아볼 수 있어야 한다.

**지우지 않고 가운데만 가리는 이유**는 운영자가 분쟁 상대를 분간해야 하기 때문이다 — 반품 송장의
끝자리와 맞춰 보는 것이 판정 근거이고, 평문 전체가 필요한 일은 어드민 콘솔에 없다. 셀러 콘솔은
판단이 다르다(송장을 붙여야 하므로 목록만 가리고 상세는 평문 — `orders.contract.ts` 주석).

### MSW 커서는 서버처럼 지문을 접어 싣는다 — 원문을 실으면 한글에서 터진다

`AdminReviewCursorCodec`는 필터를 SHA-256으로 접어 앞 16자만 싣고 "커서에 필터 원문(검색어)이
실리지 않는다"고 못박는다. 리뷰 핸들러가 원문을 그대로 이어 붙이고 있었고, 그래서 **한글 검색어 +
두 쪽 이상**이라는 조합에서 `btoa`가 `InvalidCharacterError`로 죽어(latin1 밖) 그 조합을 아예
테스트할 수 없었다(codex 교차검토 지적). 지문은 FNV-1a로 접어 아스키 16진수로 싣고,
공용 `encodeCursorPayload`/`decodeCursorPayload`는 **UTF-8 바이트를 거치게** 고쳤다
(`decodeCursorPayload`는 `TextDecoder(..., { fatal: true })` — U+FFFD로 되살리면 깨진 커서가
조용히 통과한다). 계약은 `src/testing/msw/__tests__/base.test.ts`가 고정한다.
