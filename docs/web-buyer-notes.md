# web-buyer 배치/화면 구현 이력 (온디맨드 참고)

AGENTS.md에서 분리한 web-buyer 화면별 배치 구현 이력·리비전·결정 배경. 상시 로드되지 않으며, 특정 화면을 깊게 팔 때만 참고한다. 상시 규칙·재사용 함정은 루트 `AGENTS.md`에 있다.

---
### web-buyer 화면 목업 Phase 0 — 공용 파운데이션 (신규 web DS 컴포넌트 5종)

구매자 화면 전체 구현의 선행 단계로, `packages/design-system/src/web/components/`에 native
쌍둥이를 미러한 web 컴포넌트 5종을 **순수 additive**로 추가했다(기존 시그니처 무변경 —
web-seller/web-admin도 import하므로). 모두 `docs/design-system/web-components.md`에 문서화됨.
새 구매자 화면에서 이 개념이 필요하면 새로 만들지 말고 아래를 재사용/확장할 것:

- **`ProductCard`** — native `ProductCard` 미러 + 그리드 목업 요구사항(찜 하트 오버레이) 추가.
  할인율은 `originalPrice`로 자동 계산되어 **두 군데**(썸네일 좌상단 코랄 세일 뱃지 + 가격 행의
  `%`)에 표시된다(목업 `prod-card` 마크업 근거, 의도된 중복 — 테스트도 `getAllByText`로 2개
  확인). 반올림이 0%면 뱃지/할인 라벨/원가 취소선을 숨긴다. 품절은 썸네일 dim + 중앙
  `StatusPill variant="muted"` "품절". 찜 하트는 아이콘 라이브러리 없이 인라인 SVG(채움=brand).
  **카드 이동과 찜은 중첩이 아니라 형제로 분리한다**(Revision 1): 루트는 인터랙티브가 아닌 `div`,
  이동은 카드 전체를 덮는 `absolute inset-0` stretched 버튼(z-1), 찜은 그 위(z-2) 버튼. 둘이
  형제라 이벤트 전파 자체가 없어 마우스·키보드(Enter/Space) 모두에서 "하트=찜만 / 카드=이동만"이
  독립 동작한다(예전 `role="button"` div 안에 `<button>`을 중첩하고 마우스 `stopPropagation`만
  하던 구조는 키보드 Enter/Space가 카드 이동까지 유발하는 버그가 있어 폐기 — stopPropagation
  불필요). 커서는 `cursor`가 상속 속성인 점을 이용해 루트에 걸어(비품절+onClick=`cursor-pointer`,
  품절=`cursor-not-allowed`) 이름/가격 등 자식까지 텍스트 커서가 아닌 카드 커서를 따르게 한다.
  품절 카드는 이동 불가라 stretched 이동 버튼을 아예 렌더링하지 않는다. `onWishToggle` 없으면
  하트 자체를 안 그림.
- **`RatingInput`** — native 미러. readonly/`onChange` 없으면 표시 전용(소수값 부분 채움),
  입력 모드는 정수 탭(`role="radio"`). 채워진 별 색은 **앰버(`text-warning`)** — 목업
  `stars-sm`는 accent(코랄)를 쓰지만 native `RatingInput`/`ReviewCard`가 앰버라 native 미러
  원칙에 따라 앰버로 통일했다.
- **`ReviewCard`** — native 미러 + 목업(b4-st-3) **구매 인증 pill**(`verifiedPurchase?`)을 옵션
  추가. 별점은 `RatingInput readonly`를 재사용(별도 star 컴포넌트 안 만듦).
- **`Timeline`** — native 미러. done=초록 점·선, active=brand, todo=옅은 회색. 목업의 아이콘
  기반 rail(check-circle 등)이 아니라 native의 dot 기반을 따랐다(DS는 아이콘 라이브러리 무의존).
- **`BottomSheet`** — web엔 side `Drawer`만 있어 신규. `Modal`/`Drawer`의 스크림·ESC·포커스
  트랩·바디 스크롤 잠금·닫힘 애니메이션 중 mount 유지 패턴을 그대로 복제하되 하단 앵커
  (`items-end`, `translate-y-full→0`, `rounded-t-bottomsheet`, `z-bottomsheet`). prop은
  native의 `visible`이 아니라 `Modal`/`Drawer`와 맞춘 **`open`**을 쓴다.

**오버레이 프레임 이탈 방지는 소비 앱 레벨 한 곳에서 처리한다(Revision 1).** `position:fixed`
오버레이(BottomSheet/Modal/Drawer/Toast)는 뷰포트 기준이라 데스크톱에서 폰 프레임
(`web-buyer/src/routes/__root.tsx`의 `sm:max-w-[430px]` div) 밖으로 삐져나온다. DS 컴포넌트에
프레임 폭을 하드코딩하지 말고(초기엔 `BottomSheet`에 `sm:max-w-[430px]`를 박았다가 폐기),
**프레임 div에 `[transform:translateZ(0)]`를 걸어 containing block을 만든다** — non-`none`
transform이 있으면 그 하위 `fixed` 요소가 뷰포트가 아니라 그 div 기준으로 배치되므로 스크림·패널이
430px 프레임 안에 갇힌다(모든 오버레이가 한 번에 해결됨, 실측으로 sheet 좌우가 프레임과 정확히
일치 확인). 전제: 실제 탭 화면은 `MobileScreen`이 높이를 visual viewport로 고정(overflow-hidden)해
프레임이 뷰포트보다 커지지 않으므로 `fixed`가 스크롤에 딸려 올라가지 않는다 — `MobileScreen`을
쓰지 않는 화면(예: `/preview`)에서 이 오버레이를 시연하려면 그 화면도 `MobileScreen`으로 감싸
같은 전제를 만들 것.

**DS 패키지에는 테스트 러너가 없다** — 그래서 이 5종의 AC 테스트는 소비 앱인 web-buyer
(`apps/web-buyer/src/shared/components/__tests__/`)에 두고 `@aechak/design-system/web`에서
import해 렌더링한다. 새 DS web 컴포넌트를 추가하면 같은 위치에 테스트를 둘 것(DS에 vitest를
새로 세팅하지 말 것 — 이번 배치에서 러너 도입은 4개 앱이 쓰는 공용 패키지 리스크 대비 실익이
작다고 판단해 보류).

**`packages/domain`의 `Product`는 구매자 그리드/상세용 optional 필드로 확장**했다
(`originalPrice`/`storeName`/`thumbnailUrl`/`rating`/`reviewCount`/`isSoldOut`). 전부 optional이라
web-seller/web-admin typecheck 무영향(확인함). 장바구니/주소/리뷰/펫 등은 각 화면 단계에서
추가 — 임의 병렬 타입을 만들지 말고 우선 기존 타입 optional 확장을 검토할 것.

**공용 유틸/컴포넌트**: `apps/web-buyer/src/shared/formatKRW.ts`(→ `'64,000원'`, 이후 화면
공용), `src/shared/components/ComingSoon.tsx`(MVP에서 컷된 SNS/채팅 탭의 "준비 중" 안내).
`ComingSoon`은 부모 `_tabs.tsx`가 이미 `MobileScreen`으로 감싸므로 **다시 `MobileScreen`으로
감싸지 않고** 콘텐츠 영역을 꽉 채우는 중앙 `EmptyState`만 렌더링한다(이중 중첩 방지). SNS/채팅
탭바 5탭 구조(`_tabs.tsx`)는 그대로 유지하고 안내만 보여준다.

**주의 — `apps/web-buyer/src/routes/preview.tsx`(`/preview`)는 리뷰용 임시 프리뷰 라우트**다
(파일 상단에 표시). 5종 컴포넌트를 mock으로 여러 상태로 렌더링해 눈으로 확인하는 용도이며
실제 구매자 화면이 아니다 — 리뷰가 끝나면 이 파일만 삭제하고 `routeTree.gen.ts`를 재생성하면
다른 코드 영향 없이 빠진다.

---

### web-buyer Phase 1 — 탐색·상품 화면 6종 (마켓 퍼널 상단)

구매자가 상품을 탐색·검색·상세조회·찜하는 6개 화면을 구현했다. 라우트: 홈(`_tabs/index.tsx`,
b1-st-1), 마켓/카테고리 탐색(`_tabs/market.tsx`, b3-st-1), 검색 입력(`routes/search/index.tsx`,
b3-st-2), 검색 결과(`routes/search/results.tsx`, b3-st-3), 상품 상세
(`routes/products/$productId.tsx`, b1-st-2), 찜 목록(`routes/wishlist.tsx`, b3-st-4). feature
모듈은 `features/{home,catalog,search,product,wishlist}`이고 `search`가 랜딩+결과 두 화면을 함께
가진다(같은 도메인).

- **공용 상품 데이터·찜 상태는 `src/shared/catalog/` 폴더 하나(= 단일 boundaries element)에 모은다.**
  eslint `boundaries`가 `shared → shared` 교차 import를 금지(`{ from: ['shared'], allow: [] }`)하므로,
  서로 참조해야 하는 shared 코드(카탈로그 상품 + 찜 스토어 + `ProductGrid`)를 각각 다른 `src/shared/*`
  하위 폴더에 두면 그 사이 import가 lint 에러가 난다. 대신 한 폴더(`src/shared/catalog/`)에 모으면
  폴더 내부 상대 import는 같은 element라 허용되고, feature/route는 `@/shared/catalog` 배럴에서 읽는다.
  같은 이유로 여러 화면이 공유하는 새 shared 로직을 추가할 땐 관련 파일을 한 폴더로 묶을 것.
- **찜(위시) 전역 스토어(`shared/catalog/wishlist.store.ts`)는 zustand가 아니라 React 내장
  `useSyncExternalStore`로 구현했다** — web-buyer엔 zustand 의존성이 없고(새로 추가해 lockfile을
  건드리지 않으려고) 찜은 서버 상태가 아닌 순수 클라이언트 토글이라 앱 전역 1개 인스턴스면 충분하다.
  홈/카테고리/검색결과/상세/찜목록 어디서 하트를 눌러도 같은 상태를 공유한다(한 화면에서 찜하면 다른
  화면·찜목록에 즉시 반영). `SEED_IDS`로 초기 찜 상품 4개를 시드하고 `resetWishlist()`(테스트 격리용)를
  둔다. 새 전역 클라이언트 상태가 필요하면 이 패턴을 먼저 볼 것(zustand 도입 전에).
- **공용 상품 타입은 도메인 `Product`를 그대로 쓰되 필터용 `mainCategory`만 얹은 `CatalogProduct`로
  확장한다**(`shared/catalog/products.ts`, 임의 병렬 타입 아님). `make()` 팩토리가 seller 지향 필수
  필드(sellerId/code/stock/status/inspectionStatus)를 기본값으로 채워 픽스처를 간결하게 유지한다.
  썸네일은 네트워크 의존 없이 `placeholderImage(tone)`(인라인 SVG data-URI, preview.tsx 방식).
- **`ProductGrid`(`shared/catalog/`)가 DS `ProductCard`를 찜 스토어·네비게이션에 배선하는 얇은
  래퍼다** — 카테고리/검색결과/찜목록이 모두 재사용(2열 그리드 중복 구현 금지). `onSelect`(카드 탭 →
  상세 이동), `onWishChange`(하트 토글 후 콜백 → 찜해제 토스트), `renderExtra`(카드 하단 덧붙임 — 검색
  결과의 별점 라인, 찜목록 품절상품의 "재입고 알림" 버튼)를 받는다. 상품 카드가 필요한 새 화면은 이걸 쓸 것.
- **상단 앱바 2종은 `src/shared/components/`에**: `MarketAppBar`(탭 화면용, 브랜드/타이틀 + 검색/장바구니/
  알림)와 `BackAppBar`(full-bleed 화면용, 뒤로가기 + 타이틀/children/actions). 둘 다 router 비의존(검색은
  `onSearch` 콜백으로 위임 — DS `SideNav`/`TabBar` 관례와 동일). **장바구니·알림 아이콘은 이번 단계
  범위 밖(장바구니 b1-st-3·알림 화면 미구현)이라 죽은 버튼 대신 시각적 `span` 아이콘으로만 뒀다** — 그
  화면들이 생기면 버튼으로 승격.
- **홈은 개인화(AI) 추천 OFF**(요구사항). 펫 등록 1-A(등록됨)/1-B(미등록 → 펫 등록 유도 CTA) 분기만
  `useHomeFeed(petRegistered)`로 구현했다 — 프로덕션 라우트는 인자 없이 호출(1-A 기본, 펫 이름 "코코").
  1-B를 확인하려면 개발 중 일시적으로 `useHomeFeed(false)`로 바꿔 스크린샷 찍고 원복(store-settings의
  mock 스위치 관례와 동일, URL/UI 토글 같은 영구 디버그 기능은 안 넣음). 펫 등록 CTA는 `/mypage`로
  이동(b10-st-8 펫 프로필은 범위 밖이라 존재하는 최근접 라우트로 배선). 홈 랭킹 행은 실제 상세 네비게이션
  (품절 랭킹행은 상세 이동 불가). 홈 카테고리 칩은 초기 배치에선 /market 이동(바로가기)이었으나 이후 인플레이스
  필터로 바뀌었다 — 아래 "홈 카테고리 칩은 이제 ... 인플레이스 필터다" Revision 참고. **컷된 AI 추천 슬롯
  (SALE 배너 아래)은 이후 비개인화 "추천 상품" 가로 캐러셀로 채워졌다 — 아래 "홈 '추천 상품' 가로 캐러셀"
  Revision 참고. "개인화 OFF"는 여전히 유효(펫 이름/AI/sparkles 없음)하고, 캐러셀은 그 제약 안에서 홈을
  채우는 비개인화 큐레이션이다.**
- **상품 상세: 문의(채팅) 버튼 OFF, 쿠폰 트리거/시트 OFF.** 옵션 선택 `BottomSheet`는 포함(옵션 Select +
  수량 NumberInput + 재고 + 합계 + 장바구니 담기/바로 구매). 하단 액션바는 찜/장바구니/구매하기. 장바구니
  담기·바로 구매는 장바구니(b1-st-3)·결제 화면이 범위 밖이라 실제 이동 대신 `Toast`로 피드백만 준다(죽은
  네비 방지). `ProductDetail`은 `Product`를 상속한 상세 뷰모델(images/specs/options/reviewSummary/
  reviews 추가) — 병렬 타입 아님. 리뷰 요약은 DS `RatingInput`(readonly, 앰버)/`ReviewCard` 재사용, 별점
  분포 막대는 손수 렌더.
- **검색 결과 필터 시트**: 가격대(프리셋 칩)/무료배송만/품절 제외/최소 평점. 무료배송은 상품 데이터에
  플래그가 없어 `FREE_SHIPPING_THRESHOLD`(30,000원) 이상으로 파생 계산한다. "결과 N개 보기" 버튼 라벨은
  `buildSearchResults(query, draft, sort).total`로 draft 필터 기준 실시간 미리보기 카운트를 보여준다.
  결과 0건이면 3-C 빈 상태(`SearchX` 아이콘 + 대체 검색어 칩). 검색어 매칭은 이름/카테고리/셀러명에 대해
  토큰 전부 포함(AND).
- **찜 목록은 상품 찜 탭만(스토어 찜 탭 OFF).** 데이터는 서버 상태가 아니라 찜 스토어 파생값이라 TanStack
  Query 대신 셀렉터 훅(`useWishlistProducts`, 스토어 구독 + 카탈로그 조회)을 쓴다. 하트 해제 시 실행 취소
  `Toast`(undo = `addWish`). 빈 상태 → "상품 둘러보기"(→ /market).
- **라우트 파일은 index 형태로 만든다**: `routes/search/index.tsx`(/search) + `routes/search/results.tsx`
  (/search/results) — `routes/search.tsx`(단일 파일 레이아웃)로 두면 자식(`results`)의 부모가 되어
  `<Outlet/>`을 강제하므로 index 형태로 회피. `search/results`는 `validateSearch`로 `?q=`를 파싱해
  화면에 넘긴다. 라우트 추가 후 `routeTree.gen.ts`는 standalone generate로는 안 갱신되니 `pnpm --filter
  web-buyer dev`를 잠깐 띄워 갱신·커밋(AGENTS 상단 규칙과 동일).
- **카테고리 라벨 구분자는 `·`가 아니라 `/`**(사료/간식 등, 카피 컨벤션). 목업이 `·`를 써도 변환한다.
- **DS 신규 컴포넌트 AC 테스트는 소비 앱(web-buyer)에 두는 Phase 0 관례**대로, 이번 화면들의 AC 테스트도
  각 feature `__tests__/`에 둔다(mock 필터/정렬 로직 단위 테스트 + `routeTree` memory-router 화면 테스트).
  찜 스토어 테스트는 `shared/catalog/__tests__/`.

#### Phase 1 Revision 1 — 정밀 리뷰 반영(장식용 UI 제거 등)

정밀 리뷰에서 "겉보기와 다르게 동작하는 UI"를 최우선으로 잡았다 — 새 화면 만들 때 재발 방지:

- **무료배송 판정은 `shared/catalog`의 `isFreeShipping`(가격 ≥ `FREE_SHIPPING_THRESHOLD` 30,000)이
  단일 원본**이다. 검색 무료배송 필터·상품 상세 배송 문구가 이 함수를 함께 써서 "검색에선 무료배송인데
  상세에선 배송비 3,000원" 같은 모순이 안 난다(초기엔 search.mock에만 임계값이 있었음 → shared로 승격).
  상세 `ProductDetail.freeShipping`도 이 값으로 계산. 배송비 표기는 `formatKRW`로 통일.
- **홈 카테고리 칩은 이제 "바로가기"가 아니라 "인플레이스 필터"다(2026-07-11 캡틴 지시로 위 Revision 1의
  '바로가기' 결정을 뒤집음)** — "필터처럼 생긴 걸 눌렀는데 다른 탭(마켓)으로 순간이동한다"는 어색함 때문.
  `HomeScreen`이 `useState<string>(선택 카테고리 라벨, 기본 '전체')`를 소유하고, 칩을 탭하면 화면 이동 없이
  `filterRankingByCategory(data.ranking, selectedCategory)`(`home.mock.ts`, 단일 원본 순수 함수)로 아래 "지금
  인기 있는 상품" 랭킹만 그 자리에서 좁힌다. **필터 기준은 상품 자신의 `category`(서브카테고리) 필드** — 칩
  라벨과 정확히 일치(별도 매핑 테이블 없음). '전체'는 필터 없음. 선택 칩은 `border-brand bg-brand
  font-semibold text-brand-on`(마켓 대분류 pill과 동일 톤) + `aria-pressed`로 표시. 섹션 헤더도 선택 시
  "지금 인기 있는 상품 (사료/간식)" 괄호 표기(라벨에 '/'가 있어 가운뎃점 대신 괄호, 카피 컨벤션).
  **기존 '바로가기' 가치는 섹션 헤더 옆 "마켓에서 더 보기" 링크로 보존** — 특정 칩 선택 시
  `navigate({ to:'/market', search:{ category: 선택라벨 } })`, '전체'면 `navigate({ to:'/market' })`.
  `_tabs/market` 라우트가 `validateSearch`로 `category?`를 받아 `CatalogScreen`의 `initialSubCategory`로
  초기 선택하는 구조(홈 칩 라벨 = 카탈로그 중분류 라벨 일치)는 그대로 재사용한다. **이 변경은
  `features/home/**`(HomeScreen/home.mock/index/__tests__)만 건드림 — 도메인/shared 타입 무변경, 새 라우트
  없음(`routeTree.gen.ts` 재생성 불필요).**
  - **빈 카테고리 방어**: 어떤 칩을 눌러도 죽은 빈 화면이 안 나오게 두 겹으로 처리한다. (1) 랭킹 mock
    (`RANKING_IDS`)에 노즈워크 장난감(`p-nose-toy`)을 추가해 '전체' 외 4개 칩(사료/간식·장난감·위생/미용·
    건강/영양제)이 각각 최소 1개씩 매칭되게 했다(스크래쳐=침구/하우스는 어떤 칩에도 안 걸려 '전체'에서만
    보임). (2) 그래도 매칭 0개면 `EmptyState`("이 카테고리 인기 상품이 아직 없어요" + "마켓에서 더 보기"
    액션)로 방어. `home.mock.test.ts`의 [AC-HOME-007]이 4개 칩 각 최소 1개 매칭을 강제한다.
- **홈 인기 상품 제목은 비개인화**("지금 인기 있는 상품") — 컷된 AI/개인화 뉘앙스(펫 이름)를 되살리지 말 것.
- **홈 '추천 상품' 가로 캐러셀(2026-07-11 추가)** — 컷된 "코코를 위한 AI 추천" 슬롯(SALE 배너 아래,
  인기 랭킹 위)이 비어 홈이 휑해 보여, 그 자리를 **비개인화** 가로 스크롤 상품 스트립으로 채웠다. 섹션
  헤더는 "이런 상품은 어때요?"(AI/펫 이름/sparkles 금지). `ProductGrid`(2열 고정)는 못 쓰므로
  `HomeScreen`의 로컬 `RecommendedSection`이 DS `ProductCard`를 `overflow-x-auto` + 각 카드 `w-[152px]
  flex-none`로 직접 배치한다(캐러셀 = 그리드 아님). 큐레이션 상품은 `home.mock.ts`의 `RECOMMENDED_IDS`
  (판매중만, 인기+세일 섞음) → `productsByIds`로 조회, `HomeFeed.recommended`로 노출하며 두 펫 상태(등록/
  미등록) 모두에서 항상 렌더된다. **`RECOMMENDED_IDS`는 `RANKING_IDS`와 의도적으로 겹치지 않게 골랐다** —
  겹치면 같은 상품명이 캐러셀·랭킹에 이중 렌더돼 홈이 지저분해질 뿐 아니라, 카테고리 칩이 랭킹만 필터하고
  캐러셀은 안 거르므로 기존 `home-route` 테스트(칩 필터 후 특정 상품 부재/단일 존재 단언)가 깨진다(중복
  매칭). 새 추천 상품을 넣을 때 `RANKING_IDS`·`p-brush`(기존 테스트가 홈에 부재로 단언) 같은 상품과 겹치지
  않는지 확인할 것. **찜 하트는 반드시 게이트를 거친다** — `ProductGrid`의 `wishGuard`와 동일 목적으로,
  `HomeScreen`이 `useLoginGate().requireAuth('wish', () => toggleWish(id))`로 감싸고 `<LoginGate>`를 렌더한다.
  캐러셀에서 bare `toggleWish`를 게이트 없이 호출하면 Phase 5에서 고친 게이트 우회(MAJOR) 버그가 재발하니
  금지(하트를 안 그리는 선택지도 있으나 여기선 게이트된 하트를 채택). 변경 범위는 `features/home`만
  (도메인/DS/`shared/catalog`는 무변경 — catalog는 읽기만).
- **카탈로그 중분류 아이콘은 중분류별로 다른 `lucide-react` 아이콘**을 쓴다(`SUBCAT_ICONS` 맵, 없으면
  `PawPrint` 폴백). 전부 같은 아이콘으로 두지 말 것.
- **검색결과 필터바는 상세 필터 `BottomSheet` 버튼 + 인라인 퀵필터 칩**(무료배송 즉시 토글 / 가격 → 시트 /
  별점 4↑ 즉시 토글)을 함께 둔다. **상태 뱃지·pill은 실제 필터와 일치**시킬 것: `activeFilterCount`는
  "품절 제외 off"(기본 on에서 벗어남)도 카운트하고, 헤더의 "품절 제외" pill은 `filters.excludeSoldOut`일
  때만 조건부 렌더(끄면 pill도 사라져야 함).
- **인페이지 재검색(같은 `/search/results` 라우트로 재이동) 시 검색창은 `useEffect(() => setDraftQuery(query),
  [query])`로 `query` prop에 동기화**한다 — 안 하면 컴포넌트가 언마운트되지 않아 이전 실패 키워드가 남는다.
- **알 수 없는 `productId`는 첫 상품으로 조용히 fallback하지 말고 `getProductDetailMock`이 `null` 반환** →
  `ProductDetailScreen`이 `EmptyState`로 not-found("상품을 찾을 수 없어요")를 렌더(하단 액션바 미표시).
  잘못된 URL에 엉뚱한 상품·찜 상태가 보이는 걸 막는다.
- **상품 상세 리뷰 정렬 칩(최신순/별점높은순/포토리뷰만)은 실제로 목록을 재정렬/필터링**한다(`sortReviews`).
- **`/wishlist` 인앱 진입점은 일부러 안 붙였다**(Phase 4 마이 허브에서 연결 예정) — 앱바 아이콘 등으로 억지
  진입점을 추가하지 말 것. 지금은 직접 URL 접근이 정상.
- **`Checkbox`(DS)의 `<input>`은 `sr-only`**라 브라우저 자동화로 체크박스 노드를 직접 클릭하면 빗나간다 —
  실제 토글은 감싸는 `<label>`(라벨 텍스트 포함) 클릭으로 일어난다. 자동화 검증 시 라벨을 클릭할 것(앱 버그 아님).

#### 마켓 탭(카테고리 탐색) Revision — 카테고리 접기/정렬 폭/품절 제외 토글 (2026-07-11)

캡틴이 라이브 앱을 리뷰하며 찾은 마켓 탭(`features/catalog` — `CatalogScreen` + `catalog.mock`/
`catalog.queries`) UI/UX 3건. 전부 `features/catalog` 안에서만 고쳤고 `shared/catalog`·도메인·DS는
안 건드렸다.

- **중분류(서브카테고리) 아이콘 그리드는 이제 접을 수 있다.** 11개 아이콘 그리드가 항상 펼쳐져 상단을
  많이 차지한다는 지적으로 `CatalogScreen`에 로컬 `categoryOpen`(기본 `true`=펼침) state + "카테고리"
  헤더 토글 버튼(lucide `ChevronDown`, 펼침 시 `rotate-180`)을 추가했다. **기본을 펼침으로 둔 이유** —
  카테고리 탐색이 이 탭의 핵심 기능이라 발견성을 유지하고 캡틴이 보던 첫인상을 바꾸지 않기 위함(대시보드
  `urgentOnly` 기본값 교훈과 동일). **접힘 상태에선 선택된 중분류를 `카테고리` 옆 brand-subtle pill로
  표기**해 뭘 골랐는지 항상 보이게 했다('전체' 선택 시엔 pill 없음).
- **정렬 `SegmentedControl`은 `className="w-full"`로 준다 — 안 주면 라벨이 줄바꿈된다.** DS
  `SegmentedControl`은 컨테이너가 `inline-flex`(shrink-to-content)라 폭을 안 주면 3버튼 `flex-1`이
  intrinsic 폭(실측 200px, 버튼당 61px)만 나눠 가져 "낮은가격"(4글자)이 "낮은가/격"으로 깨진다
  (`px-4` 부모 안에서 좌측 정렬로 좁게 렌더링됨). `w-full`을 주면 컨테이너가 전체 폭으로 늘어 버튼당
  ~116px가 되어 한 줄로 나온다 — DS는 `className`을 배열 마지막에 append하므로 `inline-flex` 뒤에
  `w-full`(width:100%)이 이겨 안전하다. **좁은 컨테이너에서 `SegmentedControl` 라벨이 깨지면 폭부터
  줄 것.**
- **결과 헤더의 "품절 제외"는 장식 pill이 아니라 실제 토글이다.** 예전엔 클릭 불가 `StatusPill
  variant="muted"`였는데, 이제 `aria-pressed` 토글 버튼(활성 시 brand-subtle + lucide `Check`, 검색
  결과의 `FilterChipButton` 스타일과 동일)으로 바꾸고 `excludeSoldOut` state(기본 `true`, 검색
  `DEFAULT_FILTERS`와 동일)를 `useCatalog`에 넘긴다. `buildCatalog`가 `CatalogParams.excludeSoldOut`
  (필수 필드)를 받아 `true`면 품절 상품을 빼고 `false`면 포함하며, `useCatalog`의 `queryKey`에도
  포함시켜 토글 시 별개 캐시로 취급한다. 실측: 토글 off 시 유일한 품절 시드(`p-scratcher` 스크래쳐
  하우스 2종 세트)가 나타나며 카운트가 19→20으로 는다. **품절 필터를 `shared/catalog`가 아니라
  `features/catalog`의 `buildCatalog`에서 처리**해 공용 카탈로그 데이터를 안 건드렸다(장식/죽은 UI
  금지 원칙 — 캡틴 반복 지적 항목).

#### 마켓 브랜드관 탭 제거 (2026-07-12)

- **`브랜드관` 대분류 탭은 브랜드 큐레이션 데이터가 없어 눌러도 `전체`와 동일한 전 상품만
  보여주던 죽은 탭이라 마켓에서 제거했다**(장식/죽은 UI 금지 원칙). 변경은 `features/catalog`
  안에서만: `CatalogScreen`이 이제 shared의 `MAIN_CATEGORIES` 대신 로컬 상수
  `MARKET_MAIN_CATEGORIES = MAIN_CATEGORIES.filter(c => c.value !== 'brand')`로 대분류 칩을
  렌더하고, `catalog.mock.ts`의 `buildCatalog`에서 브랜드관 전용 가드(`&& mainCategory !== 'brand'`)를
  걷어냈다(이제 `mainCategory !== 'all'`이면 그대로 대분류로 필터).
- **`shared/catalog`의 `MAIN_CATEGORIES`/`MainCategory` 유니온에는 `'brand'`가 아직 남아 있다** —
  스코프가 `features/catalog`로 한정돼 shared를 건드리지 않았고, `mainCategoryLabel` 등 다른
  소비처와의 호환을 위해 그대로 뒀다. **그래서 shared의 `'brand'`는 렌더되지 않는 phantom 값이다:
  마켓 탭을 다시 추가하지 말 것이며, `'brand'`를 shared에서 완전히 제거하려면 `CatalogScreen`의
  `MARKET_MAIN_CATEGORIES` 필터도 함께 없앨 것**(안 그러면 필터가 존재하지 않는 값을 거르는
  죽은 코드가 된다). 회귀: `catalog-route.test`의 `[AC-CATALOG-009]`가 브랜드관 탭 부재 + 남은
  탭 전환 동작을 단언한다.

---

### web-buyer Phase 2 — 구매 퍼널 하단(장바구니 → 주문서 → 결제)

장바구니(`routes/cart.tsx`, b1-st-3) / 주문서(`routes/checkout.tsx`, b1-st-4) / 배송지 주소록
(`routes/addresses.tsx`, b10-st-4) / 결제 진행·완료·실패(`routes/payment/result.tsx`, b1-st-5) 4개
full-bleed 화면을 구현했다. feature 모듈은 `features/{cart,checkout,address,payment}`. 진입점: 홈/마켓
`MarketAppBar`의 장바구니 아이콘(실 배지), 상품 상세 옵션 시트의 `장바구니 담기`/`바로 구매`. 쿠폰·정기배송·
비회원 게이트·실 PG는 범위 밖.

- **장바구니·배송지는 shared 전역 스토어**(`src/shared/cart/cart.store.ts`, `src/shared/address/address.store.ts`).
  찜(`shared/catalog/wishlist.store.ts`)과 동일하게 zustand 없이 `useSyncExternalStore`로 구현 —
  상품 상세·앱바 배지·장바구니·주문서가 한 소스를 본다. feature 간 직접 import 금지라 여러 feature가 공유하는
  카트/주소 상태는 반드시 `src/shared/`에 둔다. 테스트 격리용 `resetCart`/`resetAddresses`(+ 비구독
  `getCartItems`/`getAddresses`) 제공.
- **핵심 경계 결정 — 장바구니 파생 로직(`buildCartView`)은 `shared/cart`가 아니라 `shared/catalog/cart-view.ts`에
  둔다.** 셀러 그룹핑·배송비 계산에 상품 데이터(`findProduct`/`isFreeShipping`/`BASE_SHIPPING_FEE`)가 필요한데
  eslint `boundaries`가 `shared → shared` 교차 import를 금지하므로, 원본 라인 스토어(`shared/cart`, catalog 무의존
  순수 상태)와 상품 데이터가 있는 `shared/catalog`를 분리하되 파생 로직은 catalog 쪽에 뒀다. 두 곳이 공유해야 하는
  라인 키 함수 `cartLineKey`는 어느 shared에도 못 둬서 `@aechak/domain`(외부 패키지라 boundaries 무관)으로
  옮겼다 — 장바구니/주문서 두 feature가 모두 `@/shared/catalog`의 `buildCartView` + `@/shared/cart`의 스토어를
  가져다 쓴다(중복 구현 금지). 새 카트 관련 파생 로직도 이 분할을 따를 것.
- **무료배송·배송비 규칙은 셀러 그룹별로 `isFreeShipping`(선택 합계 ≥ `FREE_SHIPPING_THRESHOLD`)이 단일 원본**이고,
  미달 시 셀러당 `BASE_SHIPPING_FEE`(3,000, `shared/catalog/products.ts`, 상품 상세 deliveryFee와 동일값)를 매긴다.
  선택 항목이 없는 셀러는 배송비 0. 상품 상세/검색/장바구니/주문서가 한 규칙을 공유한다.
- **`buildCartView`의 "선택"은 두 의미로 분리돼 있다(2026-07-11 캡틴 라이브 리뷰) — 품절 상품도 체크는
  되지만 주문 금액엔 안 들어간다.** 초기 구현은 `selectable = !soldOut`이라 품절을 아예 체크할 수 없어
  "전체 선택 → 선택 삭제"로 품절을 한 번에 못 지웠다(품절만 X 버튼으로 일일이 삭제). 지금은
  `CartLineView`에 `selected`(체크박스 상태, 품절 포함 원본 그대로)·`selectable`(체크/삭제 가능, 해석된
  라인은 **항상 true**)·`orderable`(=`!soldOut`)을 나눠 둔다. 판정 기준: **(a) 체크/전체선택/선택삭제 =
  `selected`만**(품절 포함), **(b) 주문 합계·주문 가능 = `selected && orderable`**(품절 제외). 그래서
  `selectableKeys`는 이제 품절 포함 전체 라인 키이고, `selectedSubtotal`/`itemsTotal`/`selectedQuantity`/
  배송비·무료배송 판정은 `selected && orderable`만 센다. 뷰 파생값: `selectedLineCount`(체크 수, 품절 포함,
  전체선택 라벨용)와 `orderableLineCount`(주문 대상 수, 주문하기 라벨·활성용)를 **구분**하고,
  `hasSelectedSoldOut`(체크에 품절이 섞였는가)을 노출한다. `CartScreen`은 `주문하기 (${orderableLineCount})`
  라벨 + `disabled = orderableLineCount === 0 || hasSelectedSoldOut` + 품절 선택 시 `text-error-fg` 안내
  ("품절 상품이 포함되어 주문할 수 없어요", 해요체)로 소비한다. **결제 성공 후 라인 제거·checkout의
  `orderedKeys`는 여전히 `filter(l => l.selected)`를 쓰지만 안전하다** — 품절이 하나라도 선택되면 주문하기가
  비활성이라 checkout에 도달할 때 선택분엔 품절이 없기 때문(gated). 다만 checkout 밖에서 `orderedKeys`류를
  다시 계산할 땐 `selected && orderable`을 쓸 것(`order-removal.test`의 `[AC-CART-ORDER-001]`가 이 불변식을
  검증). 회귀는 `cart-view.test`(`[AC-CART-002/006]`)·`cart-route.test`(`[AC-CART-SOLDOUT-001~003]`)에 있다.
- **`Product`/도메인**: `CartItem`(productId/option/quantity/selected), `DeliveryAddress`, `PaymentMethod`
  (`'kakaopay'|'tosspay'|'card'`), 순수 함수 `cartLineKey`를 `packages/domain`에 추가하고 barrel도 갱신했다
  (전부 additive라 web-seller/web-admin typecheck 무영향, 확인함). 임의 병렬 타입 대신 이 타입들을 재사용/확장할 것.
- **주문서(checkout)는 항상 기본 배송지를 쓴다** — `useDefaultAddress()`를 읽고 "변경/추가"는 `/addresses?from=checkout`으로
  보낸다(주소록에서 `기본 배송지로 설정`으로 선택, 뒤로가기로 복귀). 별도 "이 주문용 선택" 상태를 만들지 않았다.
  적립금은 인라인 입력 + `전액사용`(`clampPoints`/`maxUsablePoints`/`finalPayable`, `checkout.mock.ts`), 쿠폰 행 OFF.
  **바로 구매**는 `?buyNow=<id>&option=&qty=` search param으로 단일 상품을 넘기고, checkout이 합성 `CartItem[]` 하나로
  `buildCartView`를 그대로 호출해 같은 배송비 규칙을 적용한다(장바구니 경로면 스토어의 선택 항목 사용).
- **배송지 주소록은 한 라우트에서 목록/폼(추가·편집)/삭제 Modal을 mode 전환으로 처리**(별도 라우트 없음). `setDefaultAddress`는
  항상 정확히 하나만 기본으로 정규화하고, **기본 배송지를 삭제하면 남은 첫 항목을 자동으로 기본으로 승격**해 "기본 없음"
  상태(checkout가 참조)를 막는다. 우편번호 검색은 목업이라 샘플 주소를 순환 채움. 최대 10개(`MAX_ADDRESSES`).
- **결제 결과 화면은 진입 시 `useProcessPayment` mutation을 발화해 진행 스피너 → 성공/실패로 전환**한다.
  결정적 목업 분기: `willPaymentFail(method)` = `method === 'card'`(카드는 항상 한도 초과 실패, 카카오/토스는 성공) —
  리뷰 시 카카오페이(기본)로 성공, 신용/체크카드로 실패를 그대로 재현. 성공 시 `source === 'cart'`면
  `removeSelectedFromCart()`로 주문한(선택된) 라인만 비운다(바로 구매는 장바구니 미변경).
  **주의 — 마운트 시 mutation을 `useRef` 가드로 "한 번만" 발화시키면 안 된다**: `React.StrictMode`(main.tsx) 하에서
  리마운트 시 살아남는 인스턴스의 mutation이 발화되지 않아 진행 스피너에서 영구히 멈춘다(실측으로 확인). mutate와
  `removeSelectedFromCart`가 멱등이므로 가드 없이 `useEffect(() => run(), [])`로 발화한다(개발 중 이중 발화는 무해).
- **`MarketAppBar`에 `onCart?` prop 추가** — 주면 장바구니 아이콘이 실 버튼(`/cart` 이동)이 되고, 없으면 기존처럼
  비인터랙티브 아이콘. `cartCount`는 `useCartCount()`(스토어 파생)로 실제 담긴 수량을 반영(과거 하드코딩 `cartCount={2}`
  제거). 검색과 동일하게 라우팅은 호출부가 담당.
- DS 변경 없음(앱 내부 화면만 구현). 신규 화면 AC 테스트는 각 feature/shared `__tests__/`에 둔다(스토어 CRUD·
  buildCartView 합계·적립금 계산·결제 성공/실패 분기 + cart/addresses 라우트 상호작용 테스트).

---

### web-buyer Phase 3 — 구매 후 여정(주문 조회 → 배송 추적 → 취소 → 리뷰)

주문 목록(`routes/orders/index.tsx`, b4-st-1) / 주문 상세·배송추적(`routes/orders/$orderId/index.tsx`, b1-st-6) /
주문 취소(`routes/orders/$orderId/cancel.tsx`, b4-st-4) / 리뷰 작성(`routes/reviews/write.tsx`, b4-st-2) /
상품 리뷰 목록(`routes/reviews/product/$productId.tsx`, b4-st-3) / 내 리뷰(`routes/reviews/mine.tsx`, b4-st-6) 6개
full-bleed 화면. feature 모듈은 `features/{order,review}`. DS 변경 없음(도메인만 additive 확장).

- **구매자 주문은 셀러 `Order`/`OrderStatus`와 별개인 additive 도메인 타입이다** (`packages/domain`:
  `BuyerOrder`/`BuyerOrderStatus`(paid/preparing/shipping/delivered/confirmed/cancelled)/`BuyerOrderItem`/
  `BuyerOrderSellerGroup`/`OrderShipment` + `Review`/`ReviewDraft`, barrel 갱신). **셀러 `OrderStatus`
  유니온을 확장하지 않은 이유**: web-seller의 `ORDER_STATUS_LABEL`/`ORDER_STATUS_VARIANT`가
  `Record<OrderStatus, ...>`라 값을 추가하면 키 누락으로 typecheck가 깨진다. 셀러 주문은 "셀러 1명의 단일
  상품 행"이고 구매자 주문은 "여러 셀러 상품 집계 + 구매확정/취소 상태머신"이라 개념 자체가 달라 병렬 타입이
  정당하다(임의 병렬 타입 금지 규칙의 예외 — 필드가 부족한 게 아니라 상태머신이 다름).
- **주문/리뷰 공유 상태는 `src/shared/order`·`src/shared/review` 전역 스토어**(Phase 1/2 찜·장바구니와 동일한
  `useSyncExternalStore` 패턴, zustand 미도입). 취소·구매확정·리뷰 작성이 한 곳에서 일어나면 목록/상세/내
  리뷰가 즉시 갱신된다. `order.store`는 6개 상태를 모두 덮는 시드 6건을 들고 있고(denormalize 스냅샷이라
  catalog 무의존), `review.store`는 시드 리뷰 2건(작성 완료 탭·상품 리뷰 반영용, orderId가 주문 스토어에
  없어 작성 대기엔 영향 없음). `addOrder`/`addReview`는 **id로 upsert**한다 — 주문번호·리뷰 id가
  결정적이라(주문=`orderNoForAmount(amount)`, 리뷰=`rv-<orderId>-<productId>`) StrictMode 이중 발화에도
  중복 레코드가 안 생긴다.
- **결제 성공 → 주문 생성·이력 반영은 shared/catalog의 `buildOrderFromContext`가 담당한다**
  (`cart-view`와 같은 이유로 catalog에 둠 — 상품 스냅샷/배송비 규칙이 필요한데 shared→shared 금지).
  `PaymentResultScreen.onSuccess`가 **장바구니를 비우기 전에** 주문된 라인을 조립→`addOrder`한 뒤
  `removeManyFromCart`한다(순서 중요). 성공 화면의 "주문 상세 보기"가 그 주문(`/orders/$orderId`)으로 간다.
  사용 적립금은 `(itemsTotal+shippingTotal) − paidAmount`로 역산(결제 파라미터에 points 분해가 없어서).
- **읽기는 스토어 셀렉터 훅(`useOrderList`/`useOrder`/`useMyReviews`/`useProductReviews`), 상태 전이만
  `useMutation`으로 감싼다**(취소/구매확정/리뷰 CRUD의 버튼·Modal 로딩용 setTimeout mock) — Phase 1
  wishlist 셀렉터 + Phase 2 payment mutation 관례를 그대로 따랐다. 상품 리뷰 목록(b4-st-3)은 "다른 구매자
  목업 리뷰"와 "내가 쓴 리뷰(스토어)"를 합쳐 보여줘 방금 쓴 리뷰가 즉시 반영된다.
- **취소 가능 판정은 `isCancelable`(paid/preparing만)**. 배송중/완료/구매확정/취소완료는 취소 화면이
  "취소 불가" 안내(warning Alert)를 보여준다(반품/교환은 범위 밖). 취소는 확인 `Modal` 경유(claims 관례).
- **배송 타임라인은 `buildOrderTimeline`이 상태로부터 done/active/todo를 계산**해 DS `Timeline`에 넘긴다
  (배송완료면 구매확정 단계 sublabel이 `autoConfirmAt` "자동 구매확정 예정"). 취소완료 주문은 타임라인 대신
  환불 카드를 렌더.
- **리뷰 검증은 `validateReview`(별점 필수 + 최소 10자 + 금칙어)가 단일 원본**. 등록 버튼 활성/Textarea 에러
  메시지가 같은 함수를 본다. 정렬/포토필터(`sortReviews`)는 Phase 1 상품 상세 정렬 칩과 규칙 공유
  (최신순/별점높은순/포토리뷰만). "작성 대기"는 배송완료/구매확정 주문 상품 중 리뷰 없는 것으로 파생
  (`buildPendingReviews`). 리뷰 등록 후 `/reviews/mine?submitted=true`로 이동해 완료 탭 + 성공 토스트.
- **진입점 배선(실동작)**: 결제 성공→주문 상세 / 주문 카드→상세 / 상세(배송완료)→리뷰 작성·구매확정 /
  상세(배송 전)→주문 취소 / 상품 상세 리뷰 요약→"리뷰 전체보기"(b4-st-3) / 내 리뷰 대기→리뷰 작성. 주문
  목록·내 리뷰의 상단 진입점(마이 허브)은 Phase 4 범위라 붙이지 않음(억지 앱바 아이콘 금지) — 지금은 위
  경로 + 직접 URL로 접근.
- **DS Radio/Checkbox의 `<input>`은 `sr-only`** — 브라우저 자동화로 취소 사유 라디오를 검증할 땐 라벨
  텍스트를 클릭할 것(라디오 노드 직접 클릭은 빗나감, Phase 1 노트와 동일). 컨트롤드 Textarea는 자동화 `fill`이
  아니라 `type`(실 키입력)으로 채워야 React onChange가 반영된다.

---

### web-buyer Phase 4 — 마이/계정/펫(마이 허브 → 프로필/펫/본인인증/탈퇴)

마이페이지 허브(`_tabs/mypage.tsx`, b10-st-1, placeholder 교체) + 프로필 수정
(`routes/mypage/profile.tsx`, b10-st-2) / 펫 관리(`routes/mypage/pets/index.tsx`, b10-st-3) /
펫 작성(`routes/mypage/pets/new.tsx`, b10-st-8) / 본인 인증(`routes/mypage/verify.tsx`, b10-st-9) /
회원 탈퇴(`routes/mypage/withdraw.tsx`, b10-st-5) 6개 화면 + 설정 placeholder(`routes/settings/index.tsx`).
feature 모듈은 `features/{mypage,pet,account}`. DS 변경 없음(도메인만 additive 확장).

- **계정/펫 공유 상태는 `src/shared/account`·`src/shared/pet` 전역 스토어**(Phase 1~3 찜/장바구니/주문과
  동일한 `useSyncExternalStore` 패턴, zustand 미도입). 본인 인증 상태·닉네임은 마이 허브 배지/프로필/인증
  화면이 한 소스를 본다 — 인증 화면에서 verified로 바꾸면 허브 배지가 즉시 `미인증→본인인증`으로 바뀐다(실측
  확인). `feature 간 직접 import 금지`라 여러 화면이 쓰는 계정/펫 상태는 shared에 둔다.
- **대표 펫은 항상 정확히 하나로 정규화**(`withSingleRepresentative`) — 배송지(shared/address)의 "정확히
  하나만 기본" 규칙과 동일. 대표 펫 삭제 시 남은 첫 펫이 자동 승격, 첫 펫 추가 시 자동 대표. 새 펫 추가는
  대표를 뺏지 않는다(기존 대표 유지).
- **탈퇴 차단 판정은 `shared/order`의 주문 목록을 읽어** 진행 중 주문(paid/preparing/shipping)이 하나라도
  있으면 차단(`isWithdrawBlocked`/`getBlockingOrders`/`blockingBreakdown`). 반품/교환은 web-buyer 범위
  밖이라 진행 중 주문만으로 판정한다(시드 주문에 진행 중 3건이 있어 기본이 5-A 차단 화면). 차단 시 "탈퇴하기"
  버튼 disabled + 배송 준비 중/배송 중 건수 분해 안내.
- **본인 인증은 휴대폰 OTP 목업** — 고정 인증번호 `TEST_OTP_CODE`(`000000`)만 통과(`isValidOtp`). 미인증(9-A,
  번호+인증번호 받기/재전송 → OTP 입력) → verified(9-B, 인증완료 pill+마스킹 번호+인증일). DS에 OTP 박스
  컴포넌트가 없어 목업의 6칸 대신 6자리 숫자 `Input` 하나로 구현(숫자만 필터). `verifyPhone`이 마스킹 번호·
  인증일(세션 고정 `2026.07.10`)을 찍는다.
- **펫 종 선택은 `Radio`가 아니라 `SegmentedControl`**(강아지/고양이 2종) — 브리프/리맵 리포는 'Radio'로
  적었지만 실제 b10-st-8 목업 마크업이 `segmented`라 목업을 따랐다(브리프 표기보다 실제 목업 우선, 로그인
  소셜버튼·카테고리 구분자 사례와 동일).
  **성별(`gender`) 필드는 2026-07-12 캡틴 지시로 완전히 제거됐다** — 한때 목업엔 없지만 브리프 요구로
  `SegmentedControl`(남아/여아/모름)을 넣었다가, 수집 불필요로 판단해 `PetProfile.gender`/`PetGender` 타입/
  `GENDER_LABEL`/`GENDER_OPTIONS`/폼 섹션/시드/`PetInput`에서 전부 삭제했다(도메인 barrel의 `PetGender`
  재수출도 제거). `PetProfile`은 구매자 전용이라 seller/admin 무영향(전체 `pnpm typecheck` 확인). 펫이
  수집하는 필드는 이제 종/이름/품종/생년월/체중/사진뿐 — 성별을 다시 추가하지 말 것.
  **`PetSpecies`는 강아지/고양이 2종이다(`'dog' | 'cat'`)** — 한때 `'etc'`(기타)까지 3종이었으나 목업이
  2종이라 캡틴 지시로 제거했다. `SPECIES_LABEL`/`SPECIES_OPTIONS`/`SPECIES_ICON`/`BREEDS`(전부
  `Record<PetSpecies, ...>` 또는 그에 준하는 맵)의 `etc` 키를 함께 지워야 typecheck가 통과한다.
  각 종의 품종(`breed`) 리스트 끝의 `'기타'`는 종이 아니라 품종(모름/직접 입력 대용)이라 그대로 둔다.
- **생년월은 생년(`birthYear`, 연도)+생월(`birthMonth`, 1~12)을 모두 받고 '모름'을 명시적으로 처리한다
  (2026-07-12, 최초 배치의 '연도만'에서 확장).** 폼(`PetFormScreen`)은 생년/생월 두 `Select` + `생년월을
  몰라요` `Checkbox`로 세 경우를 지원한다: (a) 생년+생월 둘 다 선택, (b) 생년만(생월은 placeholder 유지),
  (c) 완전 모름(체크박스 켜면 두 Select 비활성·비우고 저장 시 둘 다 `undefined`). **생월은 생년이 있어야만
  의미가 있어**, 생년 미선택이거나 '모름'이면 생월 Select를 `disabled`로 두고 저장 시 무시한다(생년월 '모름' =
  `birthYear`/`birthMonth` 둘 다 `undefined`). 편집 프리필: `birthYear`가 없는 펫은 체크박스 켠 상태로
  프리필(`unknownBirth = target != null && target.birthYear == null`). 나이 파생 `petAge(birthYear, birthMonth?)`
  는 생월이 있으면 올해 생일 경과 여부(`CURRENT_MONTH < birthMonth`면 한 살 어리게, 음수 방지)까지 반영하고,
  생월이 없으면 연도만으로 근사, 생년이 없으면 `undefined`(카드 보조 텍스트에서 나이 항목 생략). `CURRENT_MONTH`도
  `CURRENT_YEAR`처럼 `pet.mock.ts`의 세션 고정 상수(`new Date()` 금지). `PetProfile.birthMonth`와 `PetInput`
  (`shared/pet`)의 `birthMonth`는 순수 additive optional이라 seller/admin typecheck 무영향(확인함).
- **`/settings`는 Phase 5(buyer-settings-p5)가 만드는 화면이라 최소 placeholder만** 만들었다
  (`routes/settings/index.tsx`, 파일 맨 위 `// PLACEHOLDER:` 주석). 하위 정책 화면 링크는 절대 넣지 않는다
  (그 라우트는 Phase 5 트리에만 있어 타입드 라우팅이 깨진다). 병합 시 Phase 5의 실제 설정 홈으로 대체된다 —
  병렬 크루와의 유일한 교차점이라 최소로 유지. 마이 허브의 "설정"은 목업 appbar 기어 아이콘 + 메뉴 항목
  둘 다 `/settings`로 간다.
- **도메인 additive**: `PetProfile`/`PetSpecies`/`PetGender`(펫) + `BuyerAccount`/`VerificationStatus`(계정)를
  새로 추가하고 barrel 갱신(전부 신규 타입이라 web-seller/web-admin typecheck 무영향, 확인함). 셀러/어드민과
  무관한 구매자 전용 개념이라 병렬 타입이 정당(임의 병렬 타입 금지의 예외 — Phase 3 BuyerOrder와 같은 근거).
- **읽기는 스토어 셀렉터 훅(`usePets`/`useAccount`/`useOrders`), 저장/전이만 `useMutation`으로 감싼다**(폼
  저장·OTP 발송/인증·탈퇴의 버튼 로딩용 setTimeout 목업) — Phase 3 관례 그대로. 프로필 폼은 시드에서 한 번만
  초기화(주소록 폼과 동일, 저장 후 재시딩 안 함). AC 테스트는 각 feature/shared `__tests__/`에(대표펫 단일
  정규화·OTP 검증·탈퇴 차단 판정·펫 나이/메타 파생).

---

### web-buyer Phase 5 — 설정/정책/비회원 게이트/상품 신고(크로스컷 마무리)

설정 홈(`routes/settings/index.tsx`, b11-st-1, Phase 4 placeholder 대체) + 알림 설정
(`settings/notifications.tsx`, b11-st-2) / 동의 관리(`settings/consents.tsx`, b11-st-3) /
개인정보 처리방침(`settings/privacy.tsx`, b11-st-4) / FAQ(`settings/faq.tsx`, b11-st-5) /
커뮤니티 가이드라인(`settings/guidelines.tsx`, b11-st-6) / 계정·데이터 삭제 안내
(`settings/data-deletion.tsx`, b11-st-7) + 비회원 로그인 게이트(b13-st-2, 공용) + 상품 신고
(`routes/products/$productId/report.tsx`, b8-st-1-product) 화면. feature 모듈은
`features/{settings,report}` + 공용 `src/shared/auth`. DS 변경 없음(도메인만 additive 확장).
**Phase 4와 병렬로 진행돼 옛 main 기반에서 rebase**했다 — `settings/index.tsx`(add/add)는
placeholder 버리고 실제 홈 채택, `routeTree.gen.ts`는 재생성으로 union, domain barrel/types는
Phase 4(account/pet)와 내 블록(report)이 서로 다른 위치라 자동 병합됨.

- **로그인 여부는 `src/shared/auth/auth.store.ts`의 전역 mock 플래그**(Phase 1~4 찜/장바구니/주문/
  계정과 동일한 `useSyncExternalStore`, zustand 미도입). **기본값은 `loggedIn = true`** — 기존
  화면(찜/장바구니/주문)이 회원 흐름을 전제하기 때문. 로그아웃은 설정 홈에서만 하고, 새로고침하면
  다시 로그인으로 리셋되는 순수 세션 상태. `login()`은 온보딩 소셜 로그인 성공 시에도 호출한다
  (`onboarding/login.tsx`). **주의(자동화 검증)**: `chrome-devtools-axi open`은 풀 리로드라 이
  싱글턴이 `true`로 리셋된다 — 게이트를 시연하려면 로그아웃 후 `open` 대신 SPA 클라이언트 내비게이션
  (홈 랭킹행/카드 클릭)으로 상품 상세에 도달해야 로그아웃 상태가 유지된다.
- **비회원 게이트는 `shared/auth/LoginGate.tsx`의 재사용 컴포넌트 + `useLoginGate` 훅**. 독립 화면이
  아니라 어느 화면 위에서든 띄우는 `BottomSheet` 오버레이. `requireAuth(feature, action)`이 로그인
  상태면 `action` 즉시 실행, 비회원이면 게이트만 열고 액션 실행 안 함(feature별 문구 5종:
  wish/cart/buy/write/chat). 상품 상세(`ProductDetailScreen`)의 찜/장바구니/구매가 이 패턴으로
  분기(실측: 로그아웃 후 찜 클릭 시 토글 없이 게이트 노출). 새 회원 전용 액션도 이 훅으로 감쌀 것.
- **설정 하위 화면은 모두 `MobileScreen` + `BackAppBar` full-bleed**, `goBack`은 히스토리 있으면
  `router.history.back()` 없으면 `/settings`로. 설정 홈 진입은 `/mypage`(Phase 4). **존재하지 않는
  라우트로의 죽은 nav 금지 원칙**을 지켜: 설정 홈은 이번 배치가 실제 소유한 하위 화면(알림/FAQ/정책/
  가이드라인/동의/데이터삭제)으로만 이동하고, 본인인증/펫/고객센터 문의는 안 넣었다. `data-deletion`의
  "회원 탈퇴 진행"은 Phase 4 소관 `/mypage/withdraw`가 내 트리에 없어 최근접 `/mypage`로 보냈다
  (병합 후 탈퇴 플로우로 정합성 조정 대상 — 코드 주석에 명시).
- **설정 화면 공용 컴포넌트**: `SettingsSection.tsx`(`SettingsGroup`/`SettingsNavRow`/
  `SettingsControlRow` — 목업 set-group/set-card 패턴), `DocLayout.tsx`(`DocSection`/`DocParagraph`
  — 정책·안내 문서 3종 공유). 알림/동의 토글은 **실제 상태 반영**(전체 알림 마스터가 꺼지면 야간
  알림 종속 비활성 + 토스트, 마케팅 수신 철회 시 success 토스트). FAQ는 `filterFaq`(카테고리+검색어
  AND, 대소문자 무시, 질문/답변 부분일치) 순수 함수가 실제로 아코디언 목록을 좁힌다(0건이면
  `EmptyState`). 정적 콘텐츠·기본값은 전부 `settings.mock.ts`.
- **상품 신고는 additive 도메인 `ProductReport`/`ProductReportReason`(5종)**. 목업은 상품 위
  BottomSheet지만 전용 full-bleed 라우트로 구현(대상 카드 + 사유 `Radio` 5종 + 상세 `Textarea`(선택)
  + 제출→접수 완료). 신고자 식별 정보는 타입/제출에 담지 않음(비공개 보호). 사유 미선택 시 제출
  disabled(`isValidReportReason`). SNS/유저 신고는 범위 밖. 진입점은 상품 상세 리뷰 하단 "상품
  신고하기"(Phase 4가 안 건드리는 파일). `report.queries.ts`의 `useSubmitReport`는 결정적 id
  `rp-<productId>-<reason>`로 mock 지연 후 반환(Phase 2 payment mutation 관례).
- AC 테스트는 각 feature/shared `__tests__/`(FAQ 필터·auth 스토어 로그인/로그아웃·신고 사유/대상 mock).

#### Phase 5 Revision 1 — 게이트 일관성(MAJOR) + 낡은 표시/구분자 정리

정밀 리뷰 반영. 핵심은 **비회원 게이트가 상품 상세에서만 동작하고 정작 흔한 진입점(그리드 카드
하트·장바구니 주문하기)에서 우회되던 MAJOR 버그**:

- **`ProductGrid`(`shared/catalog`)는 `shared/auth`를 직접 import할 수 없다**(ESLint boundaries의
  `shared → shared` 금지). 그래서 하트 토글을 실행 전에 통과시키는 **`wishGuard?: (proceed: () => void)
  => void` 주입 프롭**을 `ProductGrid`에 추가하고, `ProductGrid`를 렌더하는 세 feature 화면
  (`CatalogScreen`/`SearchResultsScreen`/`WishlistScreen`)이 `useLoginGate().requireAuth`로 감싼
  `wishGuard={proceed => requireAuth('wish', proceed)}`를 주입한다(+ 각 화면이 `<LoginGate>` 렌더).
  프롭 미주입 시 즉시 토글(하위 호환) — 기존 테스트 무영향. **shared 컴포넌트가 다른 shared element의
  로직(auth 등)을 써야 하면 직접 import하지 말고 이 "콜백 주입" 패턴을 먼저 볼 것.**
- **장바구니 "주문하기"**(`CartScreen`)도 `requireAuth('buy', () => navigate('/checkout'))`로 감싸
  상품 상세 "구매하기"와 일관되게 게이트를 거친다.
- **회귀 테스트 필수**(리뷰 지시): `wishlist-route`에 카드 하트 비회원 게이트(찜 토글 안 됨),
  `cart-route`에 비회원 주문하기 게이트 + 회원 주문하기→주문서 이동을 추가. 두 테스트 파일 모두
  `beforeEach`에 `resetAuth()`를 넣어 auth 싱글턴 오염을 막는다(로그인이 기본값이므로 다른 테스트는
  기존대로 통과).
- **B**: `DataDeletionScreen`의 "회원 탈퇴 진행"이 리베이스로 존재하게 된 Phase 4 실제 탈퇴 화면
  `/mypage/withdraw`로 이동(이전 임시 `/mypage`에서 교정).
- **C**: 마케팅 수신 동의 토글이 낡은 표시를 남기던 문제 — 설명 문구를 `marketingOn`으로 분기하고,
  토스트도 마지막 동작(동의/철회)을 기억해 문구·아이콘·variant를 맞춘다(철회 시 원래 동의 날짜를
  더 이상 찍지 않음). 새 토글 상태를 표시에 반영할 때 설명·토스트가 상태와 어긋나지 않는지 점검할 것.
- **D**: 설정/정책/FAQ/가이드라인/삭제안내/신고 사유의 **사용자 노출 문자열** 가운뎃점(`·`)을 `/`로
  일괄 치환(코드 주석의 `·`는 보존 — `perl -pe 's/·/\//g unless m{^\s*//}'`로 주석 라인만 제외).
  `report.mock`의 사유 라벨을 바꿨으므로 해당 AC 테스트 기대값도 함께 갱신.

---

### web-buyer Phase 6 — 구매 퍼널 UI/UX 정밀 수정 14건

캡틴이 라이브 앱을 리뷰하며 찾은 주문서/배송지/결제/주문·취소 다듬기. 전부 consumer
레벨(`features/{checkout,address,payment,order}`)에서 고쳤고 도메인/shared/DS는 안 건드렸다.
재발 방지 관점에서 남길 것:

- **결제 결과 화면(`PaymentResultScreen`)은 일회성 전환 화면이라 모든 진입/이탈 네비게이션을
  `replace: true`로 한다.** `CheckoutScreen.handlePay`(주문서→결제결과)와 결제결과의 모든 exit
  (성공 홈으로/주문상세, 실패 결제수단변경/뒤로가기)에 `replace: true`를 걸어, 결제 완료 후
  뒤로가기가 결제 진행/결과 화면을 재진입해 `useProcessPayment`를 재실행하는 버그를 막는다
  (`useEffect(() => run(), [])`가 마운트마다 결제를 발화하므로 히스토리에 이 화면이 남으면
  안 됨). 회귀: `payment-order.test.tsx`의 `[AC-PAYMENT-009]`가 `createMemoryHistory
  (['/cart', 결제결과])`에서 완료→주문상세→`history.back()`이 결제 화면이 아니라 장바구니로
  가는지 검증한다. **결과/진행성 일회성 화면을 새로 만들면 이 replace 규칙을 기본으로 적용할 것.**
- **결제 완료(성공) 화면은 `replace`에 더해 상단 뒤로가기(←) 어포던스 자체를 두지 않는다
  (2026-07-11 캡틴 지시).** `replace`는 `history.back()`이 결제 화면을 재진입하지 않게 막지만,
  완료 화면에 ← chevron이 보이면 사용자가 그걸 눌러 주문서/장바구니로 되돌아가려 하는데 완료
  후엔 그게 맞는 흐름이 아니다 — 이동은 '홈으로'/'주문 상세 보기' CTA로만 하게 성공 분기의
  `MobileScreen`에서 `header`를 아예 빼(진행 스피너 화면과 동일한 headerless 형태) 뒤로가기를
  없앴다. `BackAppBar`는 항상 ← 버튼을 그리고 `src/shared`라 수정 불가라, 버튼 없는 헤더가
  필요하면 `BackAppBar`를 고치지 말고 `header`를 미지정하면 된다(content 슬롯이 top safe-area를
  대신 짊어짐). **실패 화면은 ←를 유지**(장바구니로 돌아가 재시도가 맞는 흐름). **완료/결과성
  화면을 새로 만들 때 뒤로가기가 되돌리면 안 되는 지점(결제/제출 완료 등)이면 header 없이 CTA만
  둘 것.** 회귀: `payment-route.test.tsx`의 `[AC-PAYMENT-010]`이 성공 화면엔 '뒤로 가기' 버튼이
  없고(홈으로/주문 상세 보기 CTA만) 실패 화면엔 남는지 검증한다.
- **결과/완료를 화면 문구·아이콘이 이미 명확히 알려주는 자리에 작은 상태 pill(StatusPill)을
  중복으로 두지 말 것.** 이번에 결제 진행 중(`info` pill)/결제 완료(`success` pill)/취소 완료
  화면의 환불 완료(`success` pill) 3곳을 캡틴 지시로 제거했다 — 큰 스피너/체크 아이콘 + 제목이
  이미 상태를 전하므로 pill은 노이즈였다. 결제 실패의 "임시로 차감된 재고/적립금 자동 복구"
  안내 문구도 제거(목업 스코프 밖 카피).
- **주문 상세의 "배송 조회" 버튼은 배송 추적 타임라인(운송장/택배사가 `shipping` 단계 sublabel에
  이미 표시됨)과 중복이라 제거했다.** 죽은/중복 버튼은 남기지 말 것 — 제거 후 `shipping` 상태는
  하단 액션이 없어지므로 `DetailActionBar`가 `hasAction` 계산으로 `null`을 반환(빈 바 방지,
  `cancelled`와 동일 처리).
- **~~믿을 만한 목 우편번호 검색 UX(`BottomSheet` + 검색어 입력 → 지연 → 후보 목록 → 선택)~~
  → 이후 Daum 우편번호 서비스 실연동으로 대체됨** (아래 "배송지 우편번호 검색 — Daum 우편번호
  서비스 실연동" 절 참고). 목업 검색 로직(`searchPostal`/`POSTAL_MOCK_RESULTS`/
  `POSTAL_SEARCH_DELAY_MS`/`PostalSearchResult`)은 전부 제거됐다. **폼 휴대폰 검증은 그대로
  유지**(`address.mock.ts`의 `sanitizePhone`=숫자/하이픈만 남김, `isValidPhone`=0으로 시작
  10~11자리) — 기능 로컬 순수 로직은 `.mock.ts` 파일에 두는 기존 컨벤션(checkout/order.mock) 그대로.
- **배송지 없음 상태의 CTA**: 주문서(`CheckoutScreen`)에서 기본 배송지가 없으면 흐릿한 점선
  버튼 대신 명시적 카드(안내 문구 + full-width primary "배송지 추가" → `/addresses?from=checkout`)
  를 보여준다. 회귀는 `checkout-route.test.tsx`가 `resetAddresses()` 후 시드 2건(`addr-1`/
  `addr-2`)을 `removeAddress`로 비워 재현한다(shared 스토어에 clear 헬퍼가 없어 id로 지움 —
  `getAddresses`는 배럴에 없으니 shared를 고치지 말고 알려진 시드 id로 제거할 것).
- 배송지 카드 배경은 `bg-surface-base`(화면 배경과 동일 톤)로 두고, 리스트 "배송지 추가"
  버튼의 `h-13`(스페이스 스케일에 13이 없어 미해석→22px로 쪼그라듦)은 `h-12`로 고쳤다 —
  높이 클래스를 쓸 때 `packages/design-system/src/tokens.ts`의 `spacing`에 그 키가 실제로
  있는지 확인할 것(13은 없음). 우편번호/적립금 입력 높이 무너짐은 위 "DS Input에 flex-1" 절 참고.

---

### web-buyer 배송지 우편번호 검색 — Daum 우편번호 서비스 실연동 (이 목업 앱 최초의 실외부 API)

캡틴 지시로 배송지 폼(`features/address`)의 우편번호 검색을 목업(`searchPostal` 필터링)에서
**Daum(Kakao) 우편번호 서비스**로 교체했다 — 이 목업 앱 전체에서 처음으로 붙인 실제 외부 API다.
Daum 우편번호는 **API 키 불필요·무료·한국 주소 표준**이라 이 목업의 자연스러운 실연동 대상이라
선택했다. 변경 범위는 `features/address`(+ `daum-postcode.ts` 신규)에 한정 — 도메인/DS 무변경.

- **스크립트는 온디맨드 동적 로드**(`features/address/daum-postcode.ts`의 `loadDaumPostcode()`) —
  시트를 처음 열 때 `https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js`를
  `<script>`로 주입하고 `onload`를 Promise로 기다린다. 모듈 레벨 `loadPromise` once-guard로
  중복 주입을 막고(이미 `window.daum?.Postcode` 있으면 즉시 resolve), 로드 실패 시 캐시를 비워
  다음 열기에서 재시도 가능. `index.html`에 `<script defer>`로 넣지 않고 온디맨드를 택한 이유는
  초기 로드 비용이 없어서다.
- **embed 모드로 시트 안에 렌더**: 팝업(새 창)은 모바일/웹뷰에 나쁘므로
  `new window.daum.Postcode({ oncomplete, width:'100%', height:'100%' }).embed(container)`로
  `BottomSheet` 내부 div(높이 460px)에 임베드한다 — 폰 프레임(`__root`의 `translateZ`
  containing block) 안에서 뜨는 오버레이 관례 그대로라 데스크톱 1200px에서도 430px 프레임 안에
  스크림·시트가 클리핑됨을 실측 확인(실브라우저 검색·선택까지 검증).
- **`oncomplete(data)` 채움 계약**: `data.zonecode` → `form.zipcode`, `data.roadAddress` →
  `form.address1`(건물명 `data.buildingName`이 있으면 `도로명 (건물명)`으로 괄호 덧붙임) 후
  시트 닫음. 상세 주소 `address2`는 사용자 입력 그대로. 기존 `set({ zipcode, address1 })` 계약
  유지(`PostalSearchSheet`의 prop이 `onSelect(result)` → `onComplete({ zipcode, address1 })`로 바뀜).
- **`window.daum` 타입은 `daum-postcode.ts`에서 좁게 선언**(`declare global` + `DaumPostcodeData`
  = `zonecode`/`roadAddress`/`jibunAddress`/`buildingName`/`apartment`만) — `any` 지양.
- **effect는 콜백을 ref로 잡고 `[open]`에만 의존**해 폼 리렌더마다 재임베드되지 않게 하고, 재열기
  시 `container.replaceChildren()`로 이전 iframe을 비운다. StrictMode 이중 마운트는 `cancelled`
  플래그로 한 번만 embed.
- **테스트(jsdom)**: 외부 스크립트/`window.daum`이 없으므로 회귀 테스트
  (`address-route.test.tsx`)는 `window.daum = { Postcode: MockPostcode }`를 주입한다 —
  `loadDaumPostcode`가 `window.daum?.Postcode` 있으면 즉시 resolve하므로 `<script>` fetch를
  안 탄다. `MockPostcode.embed`는 클릭 가능한 후보 버튼 하나를 그려 클릭 시 `oncomplete`를
  발화하고, 테스트는 그 결과로 `zipcode`(13529)·`address1`이 폼에 채워지는지 검증한다.
  `address.mock.test.ts`의 옛 `searchPostal` 테스트는 제거(휴대폰 검증 테스트는 유지).
  **jsdom에서 외부 스크립트 실제 로드를 시도하지 말 것** — `window.daum` 목 주입이 정답.

---

### web-buyer Phase 7 — 계정/콘텐츠/설정 화면 UI/UX 정밀 수정 14건

캡틴이 라이브 앱을 리뷰하며 찾은 리뷰/본인인증/프로필/마이/찜/펫/설정 다듬기. 전부 consumer
레벨(`features/{review,account,mypage,wishlist,pet,settings}`)에서 고쳤고 도메인/shared/DS는 안
건드렸다. 재발 방지 관점에서 남길 것 — 특히 아래 두 root-cause는 새 화면에서도 그대로 재현된다:

- **하단 중앙 고정 `Toast`에 한글 메시지를 넣으면 2줄로 깨진다 — 메시지 ReactNode를
  `whitespace-nowrap` span으로 감쌀 것.** `Toast`는 `position:fixed left-1/2 -translate-x-1/2`로
  폭을 명시하지 않아 shrink-to-fit인데, 한글(CJK)은 `word-break:normal`에서도 글자 사이 어디서나
  줄바꿈이 허용돼 shrink-to-fit 폭이 좁게 계산되며 텍스트가 2줄로 접힌다(실측: `프로필이
  저장되었어요.` 11자가 toast 높이 64px=2줄로 깨졌고, 찜 해제 undo 토스트도 동일). **DS `Toast`는
  공용이라 수정 금지** — `message`가 `ReactNode`이므로 호출부에서 `<span className="whitespace-nowrap">
  …</span>`로 감싸 한 줄 유지(실측: 64→44px 단일 줄). 이 배치에서 프로필 저장 토스트/찜 해제·재입고
  알림 토스트에 적용. 새 화면에서 한글 토스트가 줄바꿈되면 폭/문구를 만지기 전에 이 nowrap 래핑부터 할 것.
- **DS `Alert`(그리고 `Toast`)는 variant별 아이콘을 스스로 렌더한다 — children에 아이콘을 또
  넣으면 아이콘이 2개로 보인다.** `Alert.tsx`가 `<svg>`를 항상 그리는데(variant별 iconPath),
  호출부가 안내 문구 앞에 `<ShieldCheck/>`·`<Sparkles/>` 같은 lucide 아이콘을 또 붙여 중복됐다
  (`VerifyScreen`의 "안전한 거래…" Alert, `PetListScreen`의 "맞춤 상품 추천" Alert 두 곳 — 같은
  뿌리). 고칠 때 children에서 아이콘+wrapper span을 제거하고 순수 텍스트만 넘길 것. **새 화면에서
  `Alert`/`Toast`에 아이콘을 직접 넣지 말 것** — 컴포넌트가 이미 그린다.
- **`ListItem`의 hover 배경(`hover:bg-surface-hover`)은 자기 루트 div에 걸리므로, 부모 카드에
  `px-4`를 주면 hover가 좌우 16px 안쪽만 칠해진다(행 전체 폭이 아님).** 마이 허브 메뉴 카드가
  그랬다 — `px-4`를 카드에서 빼서 `ListItem`에 `className="px-4"`로 옮기고(hover가 카드 full
  width로 확장), 카드에 `overflow-hidden`(둥근 모서리 클리핑), 항목 사이 구분선은 `mx-4`로
  안쪽에 유지했다(실측: ListItem 좌우가 카드 경계와 1px=보더만 남기고 일치). `ListItem`을 카드에
  나열할 때 이 패턴을 기본으로 볼 것.
- **일회성 완료 화면(리뷰 작성/수정)은 완료 후 `navigate({ replace: true })`로 히스토리에서
  뺀다** — Phase 6 결제 결과 화면과 같은 부류. `ReviewWriteScreen`이 수정/작성 완료 후 `/reviews/mine`으로
  갈 때 replace를 안 걸어, 뒤로가기가 프리필된 작성/수정 화면을 재진입하는 버그가 있었다(edit·create
  onSuccess 양쪽에 `replace: true` 적용). 회귀: `review-route.test`의 `[AC-REVIEW-ROUTE-004]`이
  `createMemoryHistory(['/reviews/mine', '/reviews/write?reviewId=…'])`에서 수정 완료→뒤로가기가
  작성 화면('상품은 만족하셨나요?')이 아니라 내 리뷰로 가는지 검증한다. **결과/완료성 화면을 새로 만들면
  이 replace 규칙을 기본 적용할 것.**
- **DS `Input`에 `className="flex-1"`을 직접 주면 field가 40→25px로 무너진다 — `flex-1` 래퍼 div로
  감쌀 것**(`VerifyScreen`의 휴대폰 번호 입력, 실측 25→40px 복구). Phase 6 우편번호 입력과 동일
  root-cause라 위 "DS Input에 flex-1" 절이 정본 — 새 행-입력에서 반복 확인.
- **결과/완료 문구·큰 아이콘이 이미 상태를 전하는 자리에 장식용 안내/뱃지·정보 블록을 중복으로 두지
  말 것** — 펫 프로필 작성 화면의 상단 파란 Alert("맞춤 상품 추천")와 하단 두 안내 블록(알레르기 추후
  추가/맞춤 추천 활용), 커뮤니티 가이드라인 하단 노란 Alert의 제재 단계 pill 묶음, 내 리뷰 '작성 대기'
  카드의 "작성 가능" pill('리뷰 쓰기' 버튼이 이미 표현), 완료 리뷰 카드의 보더+내부 디바이더 중복(디바이더
  제거)을 캡틴 지시로 각각 걷어냈다. 죽은/중복 UI 금지는 이 앱 전반의 반복 지적 항목.
- **ProfileEditScreen의 "본인 인증하기"는 필드 밑에 낀 caption text-link였던 걸 full-width
  `Button variant="secondary"` CTA로 승격**(화면 관례 = PetCard "대표 펫으로 지정"류 secondary
  버튼). 캡틴 노트의 "(VerifyScreen)"은 진입 흐름 기준 표기였고 실제 버튼은 ProfileEditScreen에 있었다
  — 버튼 라벨은 정확하고 화면 괄호는 틀릴 수 있으니 라벨로 대상을 특정할 것.

---

### web-buyer Phase 8 — 찜/본인인증/가이드라인/검색 화면 UI/UX 정밀 수정 7건

캡틴 라이브 리뷰 피드백. 전부 consumer 레벨(`features/{wishlist,account,settings,search}` + 각
`__tests__`)에서만 고쳤고 도메인/shared/DS는 안 건드렸다. 재발 방지 관점에서 남길 것:

- **검색 결과 "품절 제외"는 이제 헤더의 표시 전용 pill이 아니라 인라인 퀵필터 칩(실토글)이다** —
  마켓 탭(`features/catalog`)이 이미 채택한 "품절 제외 실토글" 패턴과 동일하게 맞췄다(무료배송/별점
  4↑ 칩과 같은 `FilterChipButton` + `aria-pressed` + 활성 시 lucide `Check`, 기본 `excludeSoldOut:
  true`라 칩이 기본 활성). 클릭 시 `patchFilters({ excludeSoldOut: !filters.excludeSoldOut })`로 바로
  결과를 다시 거른다. 예전의 `StatusPill variant="muted" 품절 제외` 헤더 표기는 퀵칩과 중복이라 제거
  (`StatusPill` import도 함께 제거). **검색·마켓 두 화면 모두 품절 제외가 실토글로 통일됐으니, 새
  결과 화면에서 이걸 다시 표시 전용 pill로 만들지 말 것**(장식/죽은 UI 금지 반복 지적).
- **검색 "가격" 칩은 전체 필터 시트가 아니라 가격대 전용 `BottomSheet`(제목 "가격대")를 연다** —
  무료배송/별점은 그 자리에서 즉시 토글되는데 가격만 큰 필터 시트를 여는 게 어색하다는 피드백. 정렬
  시트와 동일하게 프리셋(`PRICE_PRESETS` 재사용) 선택 즉시 `patchFilters({ minPrice, maxPrice })` +
  시트 닫힘. 칩 라벨은 선택 가격대가 있으면 그 프리셋 라벨('3만원 이하' 등)을, 없으면 '가격'을
  보여준다(`priceActive && activePricePreset`). 전체 "필터"(`SlidersHorizontal`) 버튼과 그 안의
  가격대 섹션은 그대로 둬(가격은 두 경로 모두에서 조정 가능, 같은 `filters.minPrice/maxPrice` 공유).
  **가격 칩을 다시 전체 필터 시트로 돌리지 말 것** — 이번 결정이 그 반대다.
- **정렬 `BottomSheet`의 선택 마커는 별(Star)이 아니라 체크(`Check`)다** — 선택 표시가 왜 라디오/
  체크가 아니라 별이냐는 지적. 정렬 시트 선택 행(약 238행)만 `Star fill` → `Check`로 교체했고, 검색
  결과 카드의 정당한 평점 별(`text-warning`)은 그대로 뒀다. 선택/완료 마커에 별을 쓰지 말 것.
- **찜 목록 품절 상품의 "재입고 알림" 버튼 제거**(`WishlistScreen`의 `renderExtra` 삭제) — 목업 스코프
  밖 기능이라 걷어냄. `toast.kind`('unwish'|'restock') 분기도 단일 `unwish` 토스트로 단순화(찜 해제
  실행취소 토스트는 유지). 품절 카드의 dim + "품절" pill(DS `ProductCard` 자체 렌더)은 그대로.
- **본인 인증 OTP 힌트에서 테스트 코드(`000000`) 노출 제거** — helperText를 `error ?
  '인증번호가 올바르지 않아요.' : undefined`로 바꿔 에러일 때만 힌트를 띄운다. `TEST_OTP_CODE`는
  검증(`isValidOtp`)에서만 쓰고 화면엔 안 보인다(`VerifyScreen`의 import에서 제거). **목업 화면이라도
  테스트용 고정 코드/시크릿을 UI 카피로 노출하지 말 것.**
- **본인 인증 완료(9-B)의 인증 상태/번호/일시 3개 상세 행 제거** — 상단 체크 아이콘 + "본인 인증
  완료" 제목이 이미 상태를 전하므로 상세 행은 노이즈였다(결과/완료 문구가 명확한 자리에 중복 정보
  두지 말 것 = Phase 6/7 반복 지적). 미사용이 된 `InfoRow`/`StatusPill`/`maskPhone` 참조도 정리.
  `account.store`의 `verifiedAt`/`verifiedPhoneMasked` 필드 자체는 shared라 안 건드렸다.
- **커뮤니티 가이드라인 개정 표기에서 "애착 SNS/리뷰/채팅 공통 / " 부제 제거**
  (`settings.mock.ts`의 `GUIDELINE_REVISION` → `'최종 개정 2026.04.20'`).

---

### web-buyer Phase 9 — 상품 상세 정리 + 리뷰 이미지 확대 뷰어 + 토스트 공통 정리 (8건)

캡틴 라이브 리뷰. 상세(`features/product`)·리뷰(`features/review`)·DS `ReviewCard`·`src/shared`만 건드렸고
도메인/다른 shared 타입은 무변경. 재발 방지 관점에서 남길 것:

- **공용 토스트는 이제 `src/shared/components/AppToast.tsx`를 쓴다(Phase 7의 수동 `whitespace-nowrap`
  span 관례를 대체).** DS `Toast`는 하단 중앙 고정 + 폭 미명시(shrink-to-fit)라 한글(CJK)이 어디서나
  줄바꿈돼 2줄로 깨지는데, DS `Toast`는 4개 앱 공용이라 수정 금지 — `AppToast`가 `Toast`를 감싸
  `message`를 항상 `whitespace-nowrap` span으로 감싼다(`ToastVariant`만 DS에서 import, `ToastProps`는
  DS가 export하지 않아 래퍼가 자체 선언). 새 화면에서 한글 토스트를 띄울 땐 `Toast` 대신 `AppToast`를
  쓸 것 — 화면마다 손으로 nowrap span을 붙이지 말 것(Phase 7에 개별로 붙은 것들은 무해해 그대로 뒀다).
- **리뷰 이미지 확대는 DS `ReviewCard`의 옵셔널 `onImageClick?: (index) => void`(additive, 미주입 시
  100% 동일 동작) + `src/shared/components/ImageLightbox.tsx` 조합이다.** `ReviewCard`는 `onImageClick`이
  있으면 각 썸네일을 `버튼`으로 감싸(`aria-label="리뷰 사진 N 확대 보기"`) index를 통지만 하고 뷰어는
  내장하지 않는다(DS는 뷰어/아이콘 라이브러리 무의존 — 기존 컨벤션). `ImageLightbox`는 `src: string|null`
  (null=닫힘) 단일 이미지 뷰어로, 스크림 클릭/닫기(X, lucide)/ESC로 닫히고 `z-modal` + `bg-scrim`을 쓴다 —
  `__root`의 폰 프레임 `translateZ` containing block 덕에 데스크톱에서도 프레임 안에 갇힌다(BottomSheet/
  Modal과 동일 전제). 3개 리뷰 표시 화면(`ProductDetailScreen`/`ProductReviewsScreen`/`MyReviewsScreen`)이
  각자 로컬 `lightboxSrc` state를 소유하고 `onImageClick={i => setLightboxSrc(images[i])}`로 배선한다.
- **상세 breadcrumb의 카테고리 crumb는 카탈로그 중분류(`SUB_CATEGORIES`)와 일치할 때만 클릭 가능**하며,
  누르면 `navigate({ to:'/market', search:{ category: crumb } })`로 홈 카테고리 칩과 **동일 메커니즘**의
  마켓 이동을 한다(`_tabs/market`이 `validateSearch`로 받아 `CatalogScreen` 초기 중분류로 사용). breadcrumb는
  `['반려동물용품', 대분류라벨, base.category]` 구조라 실질적으로 마지막 crump(=`base.category`, 중분류)만
  매칭돼 버튼이 되고 상위 crumb는 정적 텍스트로 둔다(죽은 이동 금지 — `SUB_CATEGORIES.includes(crumb)`로 판정).
- **상세 리뷰 섹션은 이제 정렬 칩 없이 최신 상위 3개만 미리보기**(`data.reviews.slice(0, DETAIL_REVIEW_LIMIT)`)로
  노출하고, 정렬·전체 목록은 헤더 "전체보기"(`ProductReviewsScreen`)에서만 제공한다 — 상세의 `sortReviews`/
  `REVIEW_SORTS`/`ReviewSort`는 이 배치에서 완전히 제거됐다(리뷰 목록 화면의 동명 항목은 그대로 유지). mock
  `sampleReviews`에 4번째 리뷰(`보리****`)를 추가해 이 cap을 회귀 테스트로 실제 검증한다(`AC-PRODUCT-009`).
- 상세에서 제거한 것: 제목 밑 `판매중`/`SALE` 상태 pill 줄(품절은 이미지 캐러셀 중앙 `StatusPill muted "품절"`
  오버레이로 대체 — dim만으로는 불명확해 최소 표기를 남김), 가격 밑 총별점/리뷰건수 요약 링크(`/ 5` 텍스트),
  `ProductReviewsScreen` 정렬 칩 아래 두꺼운 `h-1.5 bg-surface-sunken` 구분 바. 가격 블록은 할인%·최종가·
  원가(취소선)를 한 baseline 줄로 묶어 하나의 덩어리로 읽히게 재배치(할인% 표기는 유지).

#### Phase 9 Revision 1 — 리뷰 '구매' pill 제거 + RatingInput 별 간격 축소

- **리뷰의 '구매'(verifiedPurchase) 인증 pill을 3개 리뷰 화면에서 안 보이게 했다 — DS `ReviewCard`는
  건드리지 않고 소비측(`ProductDetailScreen`/`ProductReviewsScreen`/`MyReviewsScreen`)에서
  `verifiedPurchase={...}` prop 전달만 뺐다.** DS `ReviewCard.verifiedPurchase` prop 자체와
  `AC-DS-REVIEW-002`(DS 단위 테스트)는 그대로 둔다(prop은 여전히 지원, 이 앱이 안 쓸 뿐). mock의
  `verifiedPurchase: true` 데이터도 도메인 필드라 남겨둠(표시만 안 됨). 회귀: `AC-PRODUCT-008`/
  `AC-REVIEW-ROUTE-003`이 `queryByText('구매')` 부재를 단언한다(상세의 '구매하기' 버튼은 exact 매칭이
  아니라 무관).
- **DS `RatingInput`의 별 사이 간격을 `gap-1`(4px) → `gap-0.5`(2px)로 좁혀 별점이 더 촘촘하게** 보이도록
  했다(4개 앱 공용 변경, 시각 tweak이라 타입 무영향 — seller/admin typecheck 재확인함). **주의**: 표시
  전용(readonly) 모드의 부분 채움은 base 별 flex와 overlay 별 flex가 **같은 gap**이어야 정렬이 맞으므로,
  interactive 컨테이너·readonly base·readonly overlay 세 군데를 모두 같은 값으로 바꿔야 한다(Revision 2에서
  이 gap을 `STAR_GAP` 상수로 승격 — 아래 참고).

#### Phase 9 Revision 2 — 상세 셀러 별점·배송문구 정리 + RatingInput 부분 채움 정확화

- **상품 상세 셀러 행(`Avatar` + 상점명) 오른쪽의 별점 표기(`RatingInput` + 평점 숫자)를 제거**했다 —
  아래 리뷰 섹션의 별점 요약(`ReviewSummaryCard`)과 중복. `RatingInput` import는 그 요약 카드가 여전히
  써서 유지.
- **상세 배송 안내 문구 글자 크기를 `text-body-sm` → `text-caption`으로 한 단계 축소**(배송비/도서산간 안내).
- **DS `RatingInput` readonly 부분 채움을 픽셀 지오메트리로 정확화**(4개 앱 공용, seller/admin typecheck
  재확인). 기존엔 채움 폭을 `value/max * 전체폭`으로 계산했는데, 별 사이 `gap` 때문에 경계가 어긋나 작은
  소수부(예: **4.1**)가 gap 구간에 묻혀 **정수 4처럼 꽉 차 보이는 버그**가 있었다. 이제
  `filledWidth = floor(value)*(size + STAR_GAP) + frac*size`로 앞 별들·gap·마지막 별 소수부를 픽셀로 더해
  마지막 별이 소수부만큼만 채워진다. 이를 위해 gap을 모듈 상수 `STAR_GAP = 2`(= 기존 `gap-0.5`)로 두고
  별 행 3곳에 className 대신 `style={{ gap: STAR_GAP }}`로 적용해 clip 계산과 실제 레이아웃 gap이 항상
  일치하게 했다 — **다음에 별 간격을 바꾸려면 `STAR_GAP` 하나만 고칠 것**(className과 픽셀 계산이 갈라지면
  부분 채움이 어긋난다). 회귀: `AC-DS-RATING-004`가 오버레이(aria-hidden div) 폭이 4.0<4.1<4.8<5.0로
  단조 증가하는지(=소수부가 실제 반영되는지) 단언한다.

---

### 상점명/상품명 말줄임 공통화 + 홈 인기 상품 5위 제한

캡틴이 상점명/상품명이 길면 레이아웃을 밀고 넘친다고 지적. 두 갈래로 정리했다 —
**목록 레이아웃 넘침의 정석 가드는 CSS `truncate`/`line-clamp-2` + `min-w-0`**(글자수 유틸이
아님), **글자수 하드 캡이 자연스러운 자리(랭킹 행 등)에만 재사용 유틸**을 쓴다.

- **`truncateText(text, maxChars)` 재사용 유틸(`apps/web-buyer/src/shared/truncate.ts`)** —
  캡틴이 "util에 넣어 쓸 수 있게" 요청한 글자수 기반 말줄임(초과 시 앞 `maxChars`자 + `…`,
  이하이면 원문 그대로, 끝 공백 다듬음, 코드포인트 단위라 이모지 안 쪼갬). `@/shared/truncate`로
  import(배럴 없음, `formatKRW`와 동일 관례). 새 목록에서 글자수 캡이 필요하면 이 유틸을 먼저 볼 것.
- **DS `ProductCard`는 손대지 않았다** — 상점명 `truncate`(1줄)/상품명 `line-clamp-2`(2줄)가
  이미 걸려 있고, 카드가 고정 폭(홈 캐러셀 `w-[152px]`) 또는 `grid-cols-2`(Tailwind는
  `minmax(0,1fr)` 트랙이라 자식이 트랙 아래로 줄어듦) 안에 있어 CSS 말줄임이 실제로 동작한다.
  DOM에 초장문 상점명/상품명을 주입해 실측: 상점명 1줄+`…`, 상품명 정확히 2줄+`…`, 카드 폭 안
  밀림. **CSS 말줄임이 이미 잘 동작하면 DS를 건드리지 말 것**(scope 원칙 — 안 건드려서
  seller/admin typecheck 불필요).
- **홈 랭킹 행 상품명**은 이미 `<div className="min-w-0 flex-1">` + `truncate`가 있어
  min-w-0 덕에 순위/가격 열을 안 민다(실측: 초장문 주입해도 1줄+`…`, 열 안 밀림). 그 위에
  `truncateText(name, 22)`(가장 넓은 430px 프레임에서도 1줄에 드는 값)로 결정적 상한을 더했다 —
  CSS는 더 좁은 화면을 responsive하게 추가로 자른다(2중 가드). 유틸의 실사용처.
- **홈 인기 랭킹은 상위 5위까지만**(`RankingSection`의 `ranking.slice(0, 5)`, `RANKING_LIMIT`).
  `filterRankingByCategory`로 카테고리 필터가 먼저 걸린 뒤 slice하므로 카테고리로 좁힌 목록에도
  동일하게 상위 5. mock(`home.mock.ts`)은 6건 그대로 두고 컴포넌트에서만 잘라, 칩별 최소 1건을
  강제하는 `[AC-HOME-007]`(mock 레벨)은 무영향. 회귀: `[AC-HOME-015]`(6위 `노즈워크 담요
  장난감` 부재로 max-5 검증) + `truncate.test.ts` 경계값 8건.

---

### 내 리뷰 표시 — `MyReviewCard` 공용 + `useProductReviews`의 `isMine` 태그

캡틴이 상품 리뷰 목록에서 "내가 쓴 리뷰가 작성자 '나'로 뜬다"고 지적. 내 리뷰(스토어의
`author: '나'` 하드코딩)를 목록/완료 탭 두 곳에서 **닉네임 + 수정/삭제**로 표시하도록 정리했다.

- **내 리뷰 판별은 author 문자열이 아니라 스토어 id를 신뢰 원본으로 쓴다.**
  `useProductReviews`(`features/review/review.queries.ts`)가 이제 목업 리뷰(others)와 내 리뷰
  (`useReviews()` 스토어)를 합칠 때 각 항목에 `isMine` 플래그를 얹은 `ProductReviewItem`
  (`extends Review`)로 내려주고, 반환 타입도 `ProductReviewsView`(= `Omit<ProductReviewData,
  'reviews'> & { reviews: ProductReviewItem[] }`)로 바꿨다 — 소비 측은 `author === '나'` 비교
  대신 `review.isMine`으로 분기하고, 수정/삭제 대상 id는 스토어 리뷰의 결정적 id
  (`rv-<orderId>-<productId>`)를 그대로 쓴다. `packages/domain`의 `Review`는 안 건드리고
  뷰 모델을 feature 안(queries.ts)에 additive로 뒀다.
- **`sortReviews`를 제네릭(`<T extends Review>`)으로 바꿨다** — 정렬 후에도 `isMine` 태그가
  타입에서 살아남아야 해서. 기존 `Review[]` 호출부/테스트는 그대로 통과.
- **`MyReviewCard`(`features/review/components/MyReviewCard.tsx`)는 상품 리뷰 목록(b4-st-3)과
  내 리뷰 완료 탭(b4-st-6)이 공유하는 "내가 쓴 리뷰" 카드다.** DS `ReviewCard`는 자체 카드
  chrome(테두리·배경)을 그려 완료 탭에서 "카드 안의 카드"(이중 테두리)가 되던 게 캡틴이 말한
  "너무 어색해"의 원인이었다 — 그래서 DS `ReviewCard`를 수정하지 않고 소비 레벨에서 단일 카드로
  본문을 직접 배치했다. `productName`/`thumbnailUrl`을 주면 상단에 상품 행이 붙어(완료 탭) 안 주면
  생략(상품 리뷰 목록, 이미 상품 페이지라 불필요). 사진 확대는 상위가 소유한 `ImageLightbox`로
  위임(`onImageOpen`), aria-label(`리뷰 사진 N 확대 보기`)은 DS `ReviewCard`와 동일하게 맞춰
  라이트박스 회귀 테스트 셀렉터를 공유한다. 두 화면의 내 리뷰 카드가 시각적으로 동일해졌다.
- **본문 블록의 세로 순서는 DS `ReviewCard`(타인 리뷰)와 정확히 일치시킨다(L-8, 2026-07-12):
  별점/날짜(상단) → 작성자(내 닉네임) → 본문 → 사진.** 처음엔 닉네임+수정/삭제를 맨 위에 두고
  그 아래 별점/날짜를 두어(작성자↔별점 순서가 DS와 뒤바뀜) 같은 목록에서 두 카드가 섞이면
  스크롤 시 카드 리듬이 어긋나 보였다 — 순서를 DS에 맞추고 **수정/삭제 액션은 리듬을 깨지 않게
  작성자(닉네임) 행 우측 끝에 붙였다**(별점/날짜 행 우측은 이미 날짜가 차지하므로 그 아래
  작성자 행에 얹음). 상품 컨텍스트 행(완료 탭)은 그대로 최상단·divider 아래로 본문 블록이 온다.
  DS `ReviewCard`는 수정하지 않음(내 카드만 맞춤).
- **닉네임은 `@/shared/account`의 `useAccount().nickname`(기본 '코코집사')**, 삭제는
  `useDeleteReview` + 확인 `Modal`(MyReviewsScreen 패턴 재사용), 수정은
  `/reviews/write?reviewId=…` 이동. 상품 리뷰 목록의 삭제 성공 토스트는 새 토스트라 Phase 9
  관례대로 `AppToast`를 썼다(MyReviewsScreen의 기존 plain `Toast`는 pre-existing이라 유지).
- 다른 구매자(목업) 리뷰는 그대로 DS `ReviewCard`(닉네임 유지, 수정/삭제 없음). 회귀:
  `[AC-REVIEW-ROUTE-006/007]`(목록에서 내 리뷰가 닉네임+수정/삭제로 뜨고 삭제 시 사라짐).

---

### 상품 상세 "장바구니 담기" 확인 바텀시트(추천 상품) — 토스트 대체

담기 시 하단 중앙 `AppToast`("장바구니에 담았어요.")가 하단 액션바를 덮던 문제를, 토스트 대신
**바텀시트**(`features/product/components/AddedToCartSheet.tsx`)를 올려 근본 해소했다 — `OptionSheet`의
`onAddToCart`가 `addToCart` + `setSheetOpen(false)` 뒤에 `showToast` 대신 `setAddedSheetOpen(true)`로
확인 시트를 연다(`requireAuth('cart', ...)` 게이트는 유지). **찜/공유 토스트는 그대로**라 `showToast`/
`AppToast`는 남겨둔다(담기 경로만 토스트를 뺐다).

- **`OptionSheet`(닫힘) → `AddedToCartSheet`(열림) 핸드오프는 같은 `z-bottomsheet` 두 개를 동시에 두는
  것으로 문제없이 동작한다** — 닫히는 시트는 스크림이 opacity-0으로 페이드아웃하고 `open=false`라
  포커스 트랩/ESC 리스너가 정리되므로 열리는 시트만 활성이다(브라우저 실측: 폰 430px 프레임 안에 정확히
  들어감). **주의(jsdom 테스트)**: DS `BottomSheet`는 `onTransitionEnd`으로만 언마운트되는데 jsdom은
  transition을 안 쏴 닫힌 시트가 DOM에 계속 남는다 — 두 시트의 버튼/라벨이 겹치지 않게 셀렉터를 정확히
  잡을 것(`장바구니`(액션바) vs `장바구니 담기`(옵션시트) vs `장바구니 보기`(확인시트)는 문자열 정확
  매칭이라 서로 구분됨).
- **방금 담은 상품 요약행의 옵션/수량은 props가 아니라 담기 직후 `useCartItems()`에서 읽는다** —
  `AddedToCartSheet` props는 `{ open, productId, onClose, onViewCart }`뿐이라(옵션/수량 미전달),
  `productId`가 일치하는 **마지막(가장 최근)** 카트 라인을 방금 담은 것으로 본다. 같은 상품+옵션을
  다시 담으면 수량이 누적되므로 요약행 수량은 "카트 라인의 현재 총수량"을 보여준다(의도된 동작).
  썸네일/상품명은 `useProductDetail(productId)`(상세 화면과 캐시 공유).
- **시트 본문은 단일 "함께 보면 좋은 상품" 섹션 하나다** — 초기엔 DS `Tabs`로 `함께 담긴`/`함께 보면
  좋은` 2탭이었으나 캡틴 지시로 탭을 없애고 섹션 헤더(`<h3>`) + 가로 캐러셀 하나만 남겼다(추천
  목록도 단일화). 시트 본문 위→아래: (a) 방금 담은 상품 요약행 → (b) "함께 보면 좋은 상품" 섹션 →
  (c) `닫기`/`장바구니 보기` 버튼 행.
- **추천은 `recommendation.mock.ts`의 `getCartRecommendations(productId)` 동기 리졸버**(별도 useQuery
  없음, `product.options`처럼 동기 읽기). 이제 배열 하나(`CatalogProduct[]`)를 반환한다 —
  `RECOMMENDATIONS_BY_ID` override 맵(`product.mock`의 `OPTIONS_BY_ID`와 동일 패턴) + 일반
  `RECOMMENDED_IDS` fallback으로 **모든 상품이 추천 목록이 비지 않게 보장**한다. 현재 상품과
  품절(`p-scratcher`)은 목록에서 제외(`home.mock`의 `RECOMMENDED_IDS` 컨벤션과 동일: 기존 카탈로그
  id만, 새 seed 금지, 품절 제외, 순서=노출 순서). 회귀: `recommendation.mock.test`(전 상품 목록
  non-empty + 자기 자신/품절 제외)와 `added-to-cart-route.test`(담기→시트 오픈·"함께 보면 좋은 상품"
  섹션·탭 부재·`장바구니 보기`→`/cart` 이동).
- 추천 캐러셀은 `HomeScreen`의 미export private `RecommendedSection`을 시트 안에 ~15줄 로컬 재구현
  (`flex gap-3 overflow-x-auto` + 각 카드 `w-[152px] flex-none`, DS `ProductCard`) — 카드 탭은
  `useNavigate`로 해당 상품 상세로 이동(죽은 카드 방지). 하단 `닫기`/`장바구니 보기` 버튼은 sticky
  footer가 아니라 children 안 마지막 행(`OptionSheet` 컨벤션).

---

### 검색 화면 UI 정밀 수정 — 빈 상태 검색어 강조 + 기본 ON 퀵필터 칩 노출 (2026-07-12)

캡틴 라이브 리뷰 2건. `features/search`(`SearchResultsScreen` + `__tests__`)만 건드렸고 도메인/shared/DS
무변경. 재발 방지 관점에서 남길 것:

- **결과 없음(3-C) 제목에서 검색어를 감싸던 곡선 따옴표(`‘ ’`)를 제거하고, 검색어를 브랜드색 굵게
  `<span>`으로 강조했다** — 카피 관례상 직접 인용부호 금지(따옴표가 하던 "검색어 세팅오프" 역할을
  마크업 강조로 대체). **DS `EmptyState.title`은 `string`이라 마크업을 못 담는다** — DS는 수정 범위
  밖이라, `EmptyState`를 쓰는 대신 그 레이아웃(아이콘 원 + `space-y-1` 제목/설명)만 feature 안에서
  그대로 미러링한 작은 블록으로 교체했다(`EmptyState` import 제거). 동적 텍스트(검색어 등)를 EmptyState
  제목에 강조해 넣어야 하면 이 "레이아웃 미러링" 패턴을 먼저 볼 것 — DS에 markup 슬롯을 추가하지 말 것.
  회귀: `[AC-SEARCH-011]`이 제목에 따옴표 문자 부재 + 검색어 강조 노출을 단언한다.
- **기본 ON(`excludeSoldOut: true`, `aria-pressed=true`)인 "품절 제외" 퀵필터 칩을 필터바 맨 끝 →
  필터 버튼 바로 뒤(2번째)로 옮겼다.** 필터바(필터/무료배송/가격/별점4↑/품절제외)의 콘텐츠 폭이
  430px 프레임을 넘어(실측 우측 끝 ~454px) 맨 끝 칩이 잘려, 기본 활성 칩의 ON 상태가 처음부터
  안 보였다(가로 스크롤해야 보임). **overflow 스크롤 필터바에서 기본 활성 칩은 앞쪽에 둬 활성 상태가
  스크롤 없이 보이게 할 것** — 대신 뒤로 밀리는 건 기본 OFF 칩(별점4↑)이라 잘려도 덜 어색하다.
  실측(`chrome-devtools-axi eval`로 각 칩 offset 측정): 이동 후 품절 제외 칩 right=200(<430) 완전
  노출, 별점4↑만 right=454로 스크롤. 토글 동작·결과 필터링은 그대로. 회귀: `[AC-SEARCH-010]`이 칩
  기본 ON(aria-pressed) + 토글 시 pressed 전환을 단언(기존 `[AC-SEARCH-008]`은 토글→결과 변화 검증).
- **참고**: 로컬 검증 dev 서버는 firstmate 전용 5175를 피해 빈 포트(≥5180)에 띄우되, `pnpm --filter
  web-buyer dev`의 스크립트가 `vite --port 5175`를 하드코딩해 `-- --port 5180`을 붙여도 무시된다
  (뒤에 `--`가 붙어 positional로 먹힘). 포트를 실제로 바꾸려면 앱 디렉터리에서 `pnpm exec vite --port
  5180 --strictPort`로 vite를 직접 실행할 것. 또 chrome-devtools-axi의 `resize`는 폭을 500px 밑으로
  못 내리므로(macOS 최소 창폭), 430px 프레임 판정은 각 칩의 바-콘텐츠 기준 offset을 재서 `right<=430`으로
  계산했다.

---

### 상품 placeholder 썸네일은 앱 전체가 하나의 실루엣 SVG로 통일 (2026-07-12)

동일 상품이 화면마다 다른 placeholder로 뜨던 불일치를 하나로 맞췄다 — 카탈로그/검색/장바구니/상세/
내리뷰-완료는 이미 `shared/catalog`의 `placeholderImage(tone)` **실루엣 SVG data-URI**를 썼는데, 주문
목록/상세·내리뷰-**작성 대기**는 스냅샷이 `thumbnailUrl`을 안 담아 `thumbnailUrl ? <img> : <ImageIcon>`
분기에서 lucide `ImageIcon`("빈 이미지" 회색 박스)로 빠지고 있었다. **placeholder "언어"는 실루엣 SVG
하나로 통일하는 게 기본** — 새 상품 표시 자리를 만들 때 lucide `ImageIcon`을 fallback으로 쓰지 말 것.

- **주문/리뷰 스냅샷의 썸네일은 feature 읽기 계층에서 상품 id로 카탈로그를 참조해 채운다.**
  `order.store`(shared/order)·`review.store`(shared/review)는 boundaries상 `shared/catalog`를 import할
  수 없어(shared→shared 금지) 스냅샷 생성 시점에 썸네일을 못 담는다. 대신 features가 카탈로그를 읽을
  수 있으므로: 주문은 `order.mock.ts`의 `withCatalogThumbnails(order)`(각 항목에 `item.thumbnailUrl ??
  findProduct(item.productId)?.thumbnailUrl` — 멱등, 결제 생성분은 이미 담겨 있어 그대로 둠)를
  `order.queries`의 `useOrderList`/`useOrder`에서 map으로 적용하고, 리뷰는 `review.mock.ts`의
  `buildPendingReviews`가 같은 fallback으로 `PendingReview.thumbnailUrl`을 채운다. **스냅샷이 상품 id를
  들고 있으면 이 "id→카탈로그 썸네일" 참조를 feature 계층에서 하는 게 boundaries를 지키는 정석** —
  store에 catalog를 끌어오려 하지 말 것. 회귀: `order.mock.test`의 `[AC-ORDER-008~010]`(없으면 채움/
  있으면 유지/미존재 상품은 undefined), `review.mock.test`의 `[AC-REVIEW-008]`.
- **홈 SALE 배너(L-3)도 같은 실루엣으로 정리.** 목업에 배너 이미지가 없어 `bg-surface-raised` 흰 박스 +
  `ImageIcon`으로 "깨진 이미지"처럼 보이던 걸 `placeholderImage(137)`(브랜드 그린 hue) `<img>`로 바꿔
  상품 카드/주문/리뷰 썸네일과 같은 계열로 통일했다(`HomeScreen`의 `ImageIcon` import 제거).
- **카탈로그에 없는 상품(과거/미존재 id)만 `ImageIcon` fallback이 남는다** — 시드/mock 상품은 모두
  카탈로그에 존재해 실무상 항상 실루엣으로 뜬다. fallback 분기는 안전망으로만 유지(제거하지 않음).

---

### 펫 폼 품종 Select — breeds API 실연동 (web-buyer 최초의 실데이터 GET API, 2026-07-23)

펫 작성/수정 폼(`features/pet`)의 품종 목록이 하드코딩 mock에서 백엔드
`GET /api/v1/breeds?species=DOG|CAT`(응답 `{ data: [{ breedId, label }] }`, JWT 필수 — 비로그인
401 errorCode 20005, 온보딩 중 유저 허용)으로 전환됐다. SCRUM-127이 깔아둔 axios 인스턴스와
Orval 파이프라인을 처음으로 실데이터에 쓴 배치라, 다음 실 API 연동은 아래 결정을 그대로 따를 것:

- **`packages/api/openapi/schema.yaml`은 손으로 유지하는 스펙이고 경로는 `/api/v1` 접두 없이
  쓴다** — axios 인스턴스 baseURL(client.ts)이 접두를 담당하므로 경로에 접두를 넣으면 두 번
  붙는다(`servers`의 `/api/v1`은 문서 정확성용 — orval은 servers를 무시한다). 스펙 추가 후
  `pnpm --filter @aechak/api openapi:generate` → 생성물을 통째로 커밋.
- **생성된 react-query 훅(`useGetBreeds`)이 아니라 fetcher(`getBreeds`)만 소비한다** —
  packages/api(^5.101)와 앱(^5.80)의 react-query 선언 범위가 달라 훅/옵션 타입이 패키지 경계를
  넘으면 버전 표류 시 깨질 수 있다. feature 쪽 `pet.queries.ts`의 `useBreedOptions(species)`가
  자체 useQuery로 감싸고(queryKey `['breeds', species]`, `staleTime: Infinity` — 품종은 세션 내
  불변), 종 매핑(`'dog'→'DOG'`)과 옵션 변환(`toBreedOptions`, value=String(breedId))을 이 파일
  안에 가둔다(서버 enum이 feature 밖으로 새지 않게).
- **인증 실패는 전역 리다이렉트, 비인증 실패만 인라인 안내(재시도 버튼 없음).** 하드코딩 `BREEDS`
  폴백은 삭제됐다(부활 금지). 401은 인터셉터가 refresh를 한 번 시도하고, refresh까지 실패하면
  `packages/api`의 `setOnAuthExpired` 콜백이 발화한다 — `main.tsx`가 여기에 `logout()` +
  `/onboarding/login` 이동을 배선(리다이렉트 루프 가드 포함)해, 세션이 진짜 없는 401은 화면이
  인라인 에러로 떠안지 않고 전역에서 로그인으로 튕긴다. 그래서 품종 Select의 `error` 캡션은
  네트워크·서버(500) 같은 **비인증** 오류에만 뜨고 버튼은 없다(화면 재진입 시 자연히 재조회).
  refresh가 성공하는 401(토큰 만료)은 인터셉터가 조용히 복구하므로 에러 화면 자체가 안 뜬다.
  최초엔 이 자리를 "에러 캡션 + 다시 시도 버튼"으로 뒀다가, 비로그인 401에서 재시도가 헛돈다는
  캡틴 지적으로 전역 리다이렉트로 바꿨다 — 실패를 화면마다 인라인으로 떠안지 말 것.
- **`packages/api` 인터셉터 하드닝(이번 감사에서 함께 수정).** breeds 연동으로 401 경로가 처음
  실사용되며 잠복 버그 둘이 드러나 고쳤다. (1) **refresh 스탬피드**: 동시 401이 각자 refresh를
  발사하면 httpOnly refresh 쿠키가 회전하면서 뒤늦은 refresh가 무효 쿠키로 실패해 멀쩡한 세션을
  로그아웃(→ 이제는 전역 리다이렉트라 오작동이 더 커진다)시킬 수 있어, 진행 중 refresh를 공유
  Promise 하나(`refreshAccessToken`)로 합쳤다. (2) **재시도 시 만료 토큰 재사용**: refresh 성공
  후 재시도(`axiosInstance(config)`)가 같은 `config`를 재써 이전 토큰이 `Authorization`에 남고,
  요청 인터셉터가 기존 헤더를 덮지 않아 계속 401 나던 버그를 고쳤다(재시도 직전 헤더를 새 토큰으로
  직접 교체). 회귀는 `[AC-PET-BREEDS-010]`(만료 토큰 → 무중단 복구)이 잡는다. 4개 앱 공용 변경이나
  계약 무변경이라 seller/admin은 typecheck로 무영향 확인.
- **품종은 `breed`(라벨)+`breedId` 쌍으로 저장**(`PetProfile`/`PetInput`에 additive optional).
  선택/리셋/프리필은 effect가 아니라 파생값(`selectedBreed`) — 생월 Select의 파생 패턴과 동일,
  StrictMode 안전. 종 전환 시 새 종 목록에 없는 선택은 자동으로 미선택으로 떨어지고, breedId 없이
  라벨만 저장된 기존 펫(시드 코코/보리 포함)은 편집 시 라벨 매칭으로 프리필돼 저장 시 breedId가
  백필된다. 선택이 없으면 **종이 그대로일 때만** 기존 breed/breedId를 보존(API 장애 중 다른 필드
  수정이 품종을 지우지 않게), 종이 바뀌면 둘 다 비운다('기타'는 dog 299/cat 386으로 종마다 id가
  달라 stale id를 남기면 안 됨). 시드 펫에 breedId를 하드코딩하지 말 것(라벨 해석 경로의 상시
  시연용).
- **MSW(v2)를 web-buyer devDep으로 도입했다** — `src/testing/msw/server.ts`(핸들러+픽스처, 서버
  Flyway 시드의 실제 id 부분집합)와 `test-setup.ts`의 수명주기(`onUnhandledRequest: 'error'` —
  모든 테스트에서 실네트워크 전면 금지, 기존 테스트는 HTTP 무호출이라 안전). route 테스트가
  vi.mock 대신 실제 HTTP 경로(URL·species 파라미터·envelope 해석·axios 401 refresh 인터셉터)까지
  검증한다. **기본 refresh 핸들러는 반드시 401** — 200이면 인터셉터가 재시도에 성공해 401 에러
  테스트가 조용히 통과해버린다. `src/testing/`은 boundaries element(`features/*`/`shared/*`/`app`)
  밖의 unknown 파일이라 feature 테스트에서 import해도 lint를 통과한다(`routeTree.gen.ts` import와
  같은 전례). msw postinstall은 후원 안내 출력뿐이라 `pnpm-workspace.yaml` `allowBuilds`에서
  `false`로 고정했다.
- **`vitest.config.ts`에 `exclude: [...configDefaults.exclude, 'e2e/**']` 필수** — vitest 기본
  include(`**/*.spec.*`)가 Playwright spec을 집어삼켜 `@playwright/test` import에서 `pnpm test`
  전체가 깨진다(e2e/에 .gitkeep만 있던 동안 잠복해 있던 문제 — web-seller/web-admin도 e2e spec을
  처음 추가할 때 같은 수정이 필요하다).
- **첫 Playwright E2E(`e2e/pet-breeds.spec.ts`)** — page.route 스텁으로 백엔드/로그인 없이 돈다
  (펫 저장은 로컬 스토어). 두 spec: 강아지 전환→푸들 선택→저장→목록 메타(happy), 401→refresh
  실패→`/onboarding/login`으로 튕김(error). 주의 2가지: (1) **fulfill 응답도 브라우저 CORS 검사를
  받는다** — 페이지(5175)→API(8080)가 교차 출처 + `withCredentials`라
  `Access-Control-Allow-Origin: http://localhost:5175`(와일드카드 불가) +
  `Allow-Credentials: true`를 넣고 OPTIONS도 방어적으로 응답할 것, (2) StrictMode 이중 마운트 ×
  retry:1로 **요청 횟수가 비결정적** — 지속 스텁(persistent)을 쓰고 요청 횟수를 단정하지 말 것.
  실행: `pnpm --filter web-buyer exec playwright install chromium`(1회) →
  `pnpm --filter web-buyer test:e2e`(dev 서버가 5175에 떠 있으면 재사용).
- **실백엔드 수동 검증 절차**: `../be`에서 `docker compose up -d` +
  `SPRING_PROFILES_ACTIVE=local ./gradlew :api:bootRun`(8080, local CORS는 5175/5173만 허용) →
  web-buyer dev(5175) → 카카오 로그인 → `/mypage/pets/new` 네트워크 탭에서
  `GET /api/v1/breeds?species=CAT` 200(Bearer) + 실제 고양이 87종/강아지 299종 노출 확인 →
  시크릿 창(비로그인, refresh 쿠키 없음)에서 진입 시 401 → refresh 실패 → `/onboarding/login`으로
  튕기는지 확인.
- **알려진 auth 격차(후속 배치, breeds 범위 밖).** 이번 상태 감사에서 확인만 하고 남겨둔 것: (a) 설정
  홈 로그아웃(`SettingsHomeScreen`)이 mock `loggedIn`만 내리고 실 access 토큰·서버 세션을 정리하지
  않아, 진짜 로그인 상태에선 로그아웃이 표면적이다 — `setAccessToken(null)` + 서버 `/auth/web/logout`
  호출로 보완 필요. (b) `loggedIn`은 기본값 `true`인데 부팅 시 세션 부트스트랩도, `/mypage` 등
  회원 전용 라우트 가드도 없어 UI 인증 상태가 실 세션과 분리돼 있다(현재 실 API가 breeds 하나뿐이라
  체감 안 될 뿐). (c) `features/{cart,wishlist}`의 파생 셀렉터(`useCartView`/`useWishlistProducts`)가
  `useMemo` 없이 매 렌더 새 객체를 만든다 — 무한 루프는 아니고(스냅샷은 안정) `order.queries`/
  `CheckoutScreen`이 이미 쓰는 `useMemo` 패턴과 일관되게 감쌀 것.

---

### web-buyer 배송지 네이밍 — `deliveryAddress` 접두로 전면 통일 (2026-07-24)

BE가 배송지 클래스를 전부 `DeliveryAddress` 접두로 확정하면서(오퍼레이션별 DTO 분리 포함) FE도
같은 원칙으로 통일했다 — **화면 컴포넌트·훅·타입·파일·폴더는 `deliveryAddress`/`DeliveryAddress`
접두, 와이어 JSON 필드(`addressId`/`baseAddress`/`detailAddress` 등)는 BE 계약 그대로.**

- 폴더/파일: `src/shared/address/` → `src/shared/delivery-address/`(`delivery-address.queries.ts`),
  `src/features/address/` → `src/features/delivery-address/`(`DeliveryAddressBookScreen.tsx`,
  `delivery-address.mock.ts`). FE 라우트 URL `/addresses`(`routes/addresses.tsx`)는 유지하되,
  API 경로는 BE 리네임을 따라 `/delivery-addresses`다(둘을 혼동하지 말 것).
- 식별자: `useDeliveryAddresses`/`useDefaultDeliveryAddress`/`useAddDeliveryAddress`/
  `useUpdateDeliveryAddress`/`useRemoveDeliveryAddress`/`useSetDefaultDeliveryAddress`/
  `MAX_DELIVERY_ADDRESSES`/`DeliveryAddressInput`/`deliveryAddressErrorMessage` — 생성 클라이언트
  (`@aechak/api`)도 동일 접두의 fetcher(`getDeliveryAddresses` 등)를 쓰며, breeds 절 컨벤션대로
  훅이 아니라 fetcher만 소비한다(어댑터가 자체 useQuery/useMutation으로 감쌈).
- **도메인 `DeliveryAddress.entranceMethod`는 `deliveryMemo`로 개명**(서버 필드와 동일 단어) —
  폼 카피도 `공동현관 출입 방법` → `배송 요청사항`(플레이스홀더에 부재 시 요청 예시 추가)으로 바꿔
  필드 의미를 넓혔다. 배송지에 새 식별자를 만들 때 소문자 `address` 단독 접두를 되살리지 말 것 —
  단, 와이어 필드명(`addressId` 등)을 `deliveryAddressId`류로 "정리"하지도 말 것(BE 계약).

---

### web-buyer 찜(Wishlist) API 연동 (SCRUM-113, 2026-08-08)

찜을 순수 클라이언트 스토어에서 실 API로 전환했다(BE SCRUM-109). 엔드포인트 3종:
`POST /products/{id}/like`(201·멱등), `DELETE /products/{id}/like`(204·멱등),
`GET /users/me/liked-products?cursor=&size`(커서 페이지네이션). **찜 목록 응답은 상품 목록과
동일한 `ProductListResponse`를 재사용**한다(`schema.yaml`에 이미 있어 경로 3개만 추가). 카드
(`ProductSummaryResponse`)에는 `isLiked`가 없고 품절은 `saleStatus`로 파생한다 — 이 "카드에
isLiked 없음"이 아래 설계 전반의 근본 제약이다.

- **찜 서버 쿼리/뮤테이션은 `shared/catalog`에 둔다**(`wishlist.queries.ts`). shared 도메인이
  `@aechak/api`를 import해 자기 `*.queries.ts`를 두는 기존 패턴(pet/delivery-address/points/account)과
  동일 — 찜은 cross-screen 공유라 `ProductGrid`(같은 element)가 직접 써야 하기 때문. `catalog.mapper.ts`의
  "shared는 서버 계약을 안 나른다" 주석은 그 파일만의 로컬 판단이었고, 이 배치에서 `toCatalogProduct`를
  `shared/catalog/product-summary.mapper.ts`로 승격해 catalog/search/wishlist가 공유하게 했다(feature→feature
  import 제거). 신규 shared 모듈은 배럴 자기참조 사이클을 피해 `CatalogProduct`/`mediaUrl`을 상대경로로 import.
- **`wishlist.store.ts`는 순수 클라이언트 미러(하트용 id 집합)로 남는다** — 서버 상품 데이터는
  TanStack Query가 소유하고 스토어는 id만 담는다(카드에 isLiked가 없어 화면 전반 하트 상태엔 이 미러가
  필요). `SEED_IDS` 제거(빈 초기), `hydrateWished`(union 머지)·`clearWished`(로그아웃) 추가.
- **토글은 `findMockProduct(id)`로 mock/real을 게이트한다(핵심 재사용 포인트).** `toggleWishlist(id)`는
  현재 상태를 뒤집어 낙관적으로 미러에 반영한 뒤, **real id만** `like`/`unlike`를 발사한다. mock id(홈은
  아직 `home.mock`의 `p-*`, SCRUM-156 미완)는 서버 기록이 없어 클라이언트 토글만 한다 — 안 그러면
  `POST /products/p-feeder-5l/like`가 404. `product.queries`가 404 폴백에 쓰는 `findMockProduct`를 그대로
  재사용해 한 곳에서 분기하므로, 홈이 실 API로 옮겨가면 게이트가 자동으로 서버 경로를 탄다(호출부 무변경).
  더블탭 레이스는 상품별 desired-state 맵 + 진행 플래그로 최신 의도에 수렴시키고(`reconcile`), **401은
  롤백하지 않으며**(전역 `setOnAuthExpired`가 처리) 비401 실패만 낙관적 반영을 되돌린다.
- **찜 목록 제거/실행취소는 필터 기반**(리페치·캐시수술 없음): 화면은 서버 무한쿼리 pool을 현재 id-set으로
  필터(`pool.filter(p => wished.has(p.id))`)해 표시한다. 해제 → id-set 제거 → 즉시 사라짐, 실행취소 →
  서버 재-like + id-set 복귀 → pool에 아직 있어 즉시 재등장. **토글 시 목록을 invalidate하지 않는다**(하면
  다중 페이지 리페치로 깜빡임·스크롤 리셋·undo 미복귀). **페이지 id 하이드레이션은 `fetchLikedPage` 안에서
  그 페이지 id만** `hydrateWished`로 머지한다(전체 pool 재머지 금지) — 이래야 다른 페이지를 로드해도 방금
  해제한 id가 되살아나지 않는다.
- **상세 화면의 `isLiked` 단방향 시드(`if (data.isLiked) addWish`)는 그대로 유지**(two-way reconcile 금지).
  상세는 404 시 목업으로 폴백하는데 목업엔 서버 isLiked가 없어, 양방향으로 바꾸면 카탈로그에서 찜한 하트를
  잘못 지운다. ActionBar 토글만 `toggleWishlist`로 배선(게이트가 real/mock 처리).
- **로그아웃 시 `clearWished()`를 두 곳 모두 호출**: `main.tsx`(401 만료)와
  `SettingsHomeScreen`(수동 로그아웃). shared/auth↔shared/catalog는 서로 import 못 하므로 각 호출부에서 부른다.
- **앱 전역 부팅 하이드레이션은 이번 범위에서 보류**: `_tabs`에 넣으면 로그인 기본값 탓에 거의 모든 라우트
  테스트가 `onUnhandledRequest:'error'`로 깨지고 이중 캐시·검색 딥링크 문제가 생긴다. 대신 찜 목록 무한쿼리
  머지 + 상세 단방향 시드로 하이드레이트한다. **알려진 한계**: 마켓/검색의 "이전 세션에 찜한" 항목 하트는
  찜 목록/해당 상세를 방문한 뒤 채워진다(세션 내 토글은 항상 낙관적으로 일치).
- **재입고 알림은 범위 제외**(품절 상태만 노출). SCRUM-113 AC엔 "재입고 알림 노출"이 있으나 BE(SCRUM-110)
  미착수 + FE Phase 8에서 이미 버튼을 제거했다 — AC 문구와의 차이는 의도적이다.
- **테스트**: MSW 기본 `handlers`에 liked-products GET + like POST/DELETE를 넣어야 한다(ProductGrid 토글이
  마켓/검색/찜 테스트에서 발사되므로 — 안 넣으면 `onUnhandledRequest:'error'`로 깨짐). `test-setup` afterEach에
  `resetLikedProducts()` 추가. 찜 목록 픽스처는 `PRODUCT_FIXTURES`를 재사용하고 OUT_OF_STOCK 1건(`p-real-5`)을
  포함한다. 회귀: `wishlist.store.test`(hydrate/union 비-부활/clear), `wishlist.queries.test`(mock/real 게이트·
  낙관적 롤백), `wishlist-route.test`(목록/해제+undo/게이트/빈/품절), `product-summary.mapper.test`.
- **BE 미머지**: `feature/SCRUM-109-product-wishlist`가 develop에 아직 안 들어가 실 검증은 그 브랜치를 직접
  띄워야 한다. PR 게이트(typecheck/lint/test)는 MSW로 통과하며, `openapi:generate:check`는 재생성 결과를
  커밋해야 통과한다(생성물 커밋 전엔 항상 실패 — breeds 배치와 동일).

### 찜 코드리뷰 라운드(codex 협업) 반영 — reconcile 하드닝 + 정리

codex(gpt-5.6)와 병렬 코드리뷰 후 이견을 수렴해 반영했다.

- **`toggleWishlist` reconcile를 generation 카운터 + session epoch로 재작성**(`wishlist.queries.ts`).
  기존엔 요청 실패 중 추가 탭이 들어오면 최신 의도가 `desiredState`에 고립돼 유실+누수됐다(값이
  우연히 같아도 구분 못 함). 이제 세대 비교로 "그 사이 새 탭"을 정확히 판별해 최신 의도를 계속
  조정하고, 실패는 최신 의도일 때만 서버 실제 상태로 롤백한다. `sessionEpoch`는 로그아웃 시 증가시켜
  이전 세션의 늦은 롤백이 새 세션 미러를 오염시키지 않게 막는다.
- **로그아웃 정리를 `onWishlistLogout(queryClient)` 단일 진입점으로 통합**(main.tsx 세션 만료 +
  SettingsHomeScreen 수동). 미러 clear + 진행중 의도 폐기(epoch) + **찜 목록 쿼리 캐시 제거**를
  원자적으로 한다 — 캐시가 남으면 재진입 시 옛 pool ∩ 빈 미러가 잘못된 빈 목록으로 뜬다.
- **상세 `isLiked` 시드를 id별 세션당 1회로 제한**(`seededLikedIds`) — 재마운트 시 캐시된
  isLiked=true가 방금 해제한 하트를 되살리는 버그 차단.
- **홈 하트를 `toggleWishlist`로 통일**(구 `toggleWish` 제거). mock 상품은 게이트로 클라이언트
  토글, 실 상품 전환 시 자동 서버 동기화. `toggleWish`/`wishErrorMessage`/`currentLikedProducts`
  죽은 코드 제거.
- **`WishlistScreen`**: 파생 목록 `useMemo`, 빈 상태를 `!hasNextPage`일 때만(한 페이지 전량 해제 시
  다음 페이지 도달 불가 방지).
- **수렴된 미결(이견 → BE 후속)**: 카드 응답(`ProductSummaryResponse`)에 `isLiked`가 없어, 이전
  세션에 찜한 상품이 마켓/검색에서 하이드레이션 전까지 빈 하트로 보이고 첫 클릭이 (DELETE가 아니라)
  멱등 POST가 된다. codex는 blocking으로 봤고 FE 단독 해결(첫 페이지만 hydrate=21번째부터 틀림, 전
  페이지 drain=낭비)은 부분적이라, **정식 해결은 BE가 `ProductSummaryResponse`에 `isLiked`를 내려주는
  것**으로 합의했다(또는 전용 liked-ids endpoint). 이 배치는 부분 해킹을 넣지 않고 한계로 남긴다 —
  찜 목록 화면(SCRUM-113 본체)과 상세는 정확하다. union-only hydrate의 cross-device/늦은 GET 재부활도
  같은 BE 스냅샷 도입 때 함께 해결한다.
- MSW 커서(offset)·POST 픽스처 게이팅은 mock 전용 정합성 이슈로 현재 테스트가 건드리지 않아 후속으로
  남겼다(production은 keyset 커서).

### 상품 카드 isLiked 소비 (SCRUM-190) — 하트 미러 시드 + 해제 툼스톤/epoch 가드 (2026-08-12)

BE(SCRUM-190, PR #62)가 `ProductSummaryResponse`에 필수·비-nullable `isLiked`를 추가하면서(목록/검색은
로그인 시 카드별, 찜목록은 전부 true, 비로그인은 전부 false), 위 "찜 API 연동" 절의 알려진 한계(마켓/검색에서
이전 세션 찜이 빈 하트로 보이던 문제)를 FE가 소비해 해소했다. **핵심 결정: 카드에 isLiked를 얹지 않고
(도메인 `CatalogProduct`/`Product` 무변경, seller/admin typecheck 무영향) 미러(`wishlist.store.ts`)를 여전히
하트의 단일 원본으로 두되, fetch 시점에 raw `ProductSummaryResponse[]`에서 미러를 시드**한다. `ProductGrid`는
그대로 `wished.has(id)`만 읽으므로 컴포넌트 무변경. 스키마는 `packages/api/openapi/schema.yaml`에 `isLiked`를
`required`+`properties`로 넣고 `pnpm --filter @aechak/api openapi:generate`로 생성물을 재생성해 커밋했다.

- **시드 헬퍼 `hydrateLikedFromSummaries(summaries, epoch?)`(`shared/catalog/wishlist.queries.ts`)** — `isLiked=true`
  이고 툼스톤에 없는 id만 union 머지, `isLiked=false`는 툼스톤 해제. 마켓/검색/찜목록 세 fetcher가 공유 호출.
  빈 id면 `hydrateWished`를 아예 호출하지 않아 불필요한 `new Set` 복사도 없앴다.
- **해제 툼스톤 `locallyUnliked: Set<string>`(핵심 버그 픽스, 코드리뷰 교차 확인)** — 최초 구현은 `desiredState.get(id)
  !== false`로 "진행 중 해제 의도"만 걸렀는데, `reconcile`이 DELETE 성공 즉시 `desiredState[id]`를 지우므로 **요청이
  끝난 뒤** 늦게 도착한 stale `isLiked=true` 페이지 응답이 방금 해제한 하트를 되살리고 union-only 미러가 그걸
  세션 내내 유지하는 major 버그가 있었다(codex + 내부 워크플로가 독립적으로 동일 지적). 툼스톤은 `toggleWishlist`
  해제 시 add, 재-찜 시 delete, `reconcile`은 건드리지 않고, 서버가 `isLiked=false`로 확정하는 hydrate에서만 풀린다
  → 요청 완료 후 창까지 덮는다. 찜목록 화면의 해제 후 리페치 재부활도 같은 원리로 함께 막힌다.
- **`sessionEpoch` 가드** — hydrate 경로엔 `reconcile`과 달리 epoch 가드가 없어, 로그아웃을 가로질러 resolve된
  목록/검색 fetch가 방금 비운 미러에 이전 세션 찜을 재-시드하는 누수가 있었다. 각 fetcher가 요청 시작 전
  `currentSessionEpoch()`를 캡처해 넘기고, hydrate는 `epoch !== sessionEpoch`면 early-return한다. `onWishlistLogout`은
  툼스톤도 함께 clear한다.
- **의도적으로 이번 배치에서 안 한 것(코드리뷰 수렴 결과 후속 PR로 분리)**: (a) `ProductGrid`가 미러 전체 Set을
  구독해 하트 시드 emit 시 이미 로드된 카드가 전부 리렌더되는 pre-existing 비용 — 셀렉터를 per-card boolean 스냅샷
  (`useIsWished`)으로 바꾸고 카드를 자식 컴포넌트로 쪼개는 공용 컴포넌트 리팩터라 isLiked 기능 PR과 분리(머지 리스크
  최소화). (b) catalog/search 쿼리 키의 auth-세션 스코프화 — 로그인 직후 리페치 전까지 하트가 잠깐 비어 보이는 UX
  갭은 위 union-only hydrate 한계와 동류라 문서화만 하고 캐시 키 재설계는 후속 auth-세션 작업으로 미룸(누수 자체는
  epoch 가드로 이미 차단). **다음에 이 두 가지를 실제로 손댈 때는 여기 결정을 참고할 것.**
- **테스트**: `wishlist.queries.test`에 툼스톤(진행 중/요청 완료 후 stale true 모두 차단, false로 해제 후 재-찜 반영)과
  epoch 가드 회귀를 추가(`AC-WISH-013~016`). 마켓/검색 첫 렌더 하트는 `catalog-route`/`search-route`
  (`AC-CATALOG-013`/`AC-SEARCH-018`), MSW 세 리스트 핸들러는 `likedProductRows`에서 `isLiked`를 주입한다.

### 상품 카드/상세 isViewable·isPurchasable 소비 (SCRUM-190 후반, 2026-08-16)

BE가 같은 티켓의 후속 커밋(`2906b4b`)으로 세 필드를 **필수 비null**로 더 얹었다. 위 isLiked 절이
다룬 카드 찜 여부와 달리 이번 것은 노출/구매 판정이다.

| 응답 | 새 필드 | 서버 계산식 |
| --- | --- | --- |
| `ProductSummaryResponse`(목록/검색/찜목록) | `isViewable` | 카테고리 체인(자신/부모/조부모) 전부 ACTIVE = 상세 진입 가능 |
| | `isPurchasable` | `isViewable && saleStatus == ON_SALE` |
| `ProductDetailResponse`(상세) | `isPurchasable` | `saleStatus == ON_SALE` |

**FE가 실제로 얻은 새 정보는 찜 목록의 `isViewable` 하나뿐이다.** 카탈로그/검색 쿼리는 카테고리 체인
활성을 where 필터로 쓰고 `isViewable`을 상수 true로 투영하며, 찜 목록만 같은 조건을 CASE 컬럼으로
계산한다. 상세의 `isPurchasable`도 `product.map.ts`의 `res.saleStatus !== 'ON_SALE'` 파생과 정확히
서로의 부정이라(상세 쿼리가 EXPOSABLE만 통과시켜 도달 가능한 상태가 둘뿐) 상세 매퍼는 그대로 뒀다.

- **`isPurchasable`을 `isSoldOut`으로 옮기지 말 것.** 요약의 `isPurchasable`은 `isViewable && ON_SALE`
  이라 찜 목록에서 카테고리만 내려간 판매중 상품이 false로 온다. 이걸 `isSoldOut`으로 읽으면 재고가
  멀쩡한 상품에 품절 dim과 pill이 붙는다. 품절 축과 진입 축은 별개로 둔다.
- **`CatalogProduct`에 `isViewable?: boolean`을 optional로 얹었다.** 도메인 `Product`는 안 건드렸다 —
  셀러/어드민에 대응 개념이 없고 필수로 넣으면 web-seller의 `MOCK_PRODUCTS` 리터럴이 깨진다. 목업
  상품에는 `undefined`가 흐르므로 **소비 측은 `isViewable === false` 부정형으로 판정할 것**(아니면
  마켓/검색/찜의 모든 카드가 한꺼번에 진입 불가가 된다).
- **찜 목록의 진입 불가 카드는 감추지 말고 탭만 막고, 품절과 같은 썸네일 오버레이로 알린다.**
  `ProductGrid`가 `isSold={isSoldOut || isViewable === false}`로 dim + 중앙 pill을 띄우고 라벨만
  사유에 맞게 바꾼다(품절 / 판매 중단). 이를 위해 DS `ProductCard`에 `soldLabel?: string`(기본
  '품절')을 additive로 추가했다 — 이 컴포넌트는 web-buyer만 쓴다. 고치기 전에는 카드가 정상으로
  보이는데 탭하면 상세 404 → not-found 막다른 화면으로 떨어졌다. **감추면 그 화면의 유일한 찜 해제
  수단인 하트까지 사라져 영영 못 지운다**(BE `unlike`는 노출 조건을 안 봐서 해제 자체는 정상).
  **라벨을 '판매종료'로 쓰지 말 것** — `ENDED`는 서버가 목록에서 아예 빼고, 이 상품은 `ON_SALE`인데
  카테고리만 내려간 상태다. 카드가 넘기는 `isSold`는 표시 전용이고 `CatalogProduct.isSoldOut`은
  그대로라 장바구니/주문의 품절 판정에는 영향이 없다.
- **MSW 픽스처와 e2e 스텁은 게이트 넷 중 무엇도 검사하지 않는다.** `ProductFixture`는 생성 타입이
  아닌 로컬 인터페이스이고 `e2e/`는 tsc include 밖이라, 필수 필드를 안 맞춰도 전부 통과하면서
  런타임에는 `undefined`가 흐른다. 특히 **검색 핸들러는 픽스처를 스프레드하지 않고 필드를 나열**한다.
- **`PRODUCT_FIXTURES`에 `isViewable: false` 행을 만들지 말 것.** 카탈로그/검색 핸들러도 공유해
  `catalog-route.test`가 깨진다. 찜 테스트에서 시드 시점 오버라이드로 opt-in할 것
  (회귀: `[AC-WISH-020]`/`[AC-WISH-021]`).

### 찜 상태 테스트 격리 — 서버측/클라이언트측을 항상 짝으로 리셋할 것 (2026-08-15)

**`test-setup.ts`의 전역 `afterEach`가 서버측 `resetLikedProducts()`(MSW `likedProductRows`)만 되돌리고
클라이언트측 `wishlist.queries.ts`의 모듈 상태는 아무도 안 지우던 비대칭이 있었다.** 스토어의
`resetWishlist()`는 미러(`wished` Set)만 비우는데, 해제 툼스톤 `locallyUnliked`는 **다른 모듈**(queries)에
있어 손이 닿지 않았다 — 이걸 지우는 유일한 진입점이 `onWishlistLogout(queryClient)`인데 라우트 테스트들은
`resetWishlist()`만 부르고 있었다.

증상은 "실패"가 아니라 **조용한 축소 검증**이라 더 위험했다. `wishlist-route.test.tsx`의 `[AC-WISH-004]`가
`p-real-1`을 해제하고 툼스톤을 남기면, 다음 `[AC-WISH-UNDO-001]`이 3건을 시드해도
`hydrateLikedFromSummaries`가 그 id를 계속 걸러 **2장만** 렌더된다. 두 후속 테스트가 상대 카운트
(`initialCount`)만 단언하고 있어서 그대로 통과했다 — 절대값으로 바꿔 돌려보니 `expected 2 to be 3`,
`expected 1 to be 2`로 즉시 드러났다.

- **해결**: `wishlist.queries.ts`에 `resetWishlistState()`를 추가했다 — `onWishlistLogout`에서 쿼리 캐시
  비의존 부분(epoch 증가 + `desiredState`/`generation`/`running`/`locallyUnliked` clear + `clearWished`)을
  뽑아낸 것이고, `onWishlistLogout`은 이제 이걸 부른 뒤 `removeQueries`만 더한다(로그아웃 동작 무변경).
  `shared/catalog` 배럴로 내보내 `test-setup.ts`의 `afterEach`가 `resetLikedProducts()`와 **나란히** 부른다.
- **로그아웃에는 `resetWishlistState()`를 직접 쓰지 말 것** — 쿼리 캐시를 지우지 않아 재로그인 시 옛 pool과
  빈 미러의 교집합이 빈 목록으로 뜬다. 로그아웃은 계속 `onWishlistLogout`.
- **회귀 가드**: `[AC-WISH-UNDO-001]`/`[AC-GATE-001]`의 카운트 단언을 상대값에서 절대값(`toBe(3)`/`toBe(2)`)
  으로 바꿨다. 시드한 수만큼 실제로 렌더되는지 보므로 같은 종류의 누수가 다시 생기면 바로 잡힌다
  (`--sequence.shuffle.tests` 8개 시드로 순서 무관 확인).
- **같은 뿌리였던 `ProductDetailScreen`의 모듈 전역 `seededLikedIds`도 함께 정리했다.** 상세 응답의
  `isLiked`를 "id별 세션당 1회"만 미러에 시드하는 기록인데, feature 파일의 모듈 전역이라 export도
  리셋 경로도 없어 로그아웃에도 테스트에도 되돌릴 방법이 없었다. 시드 기록과 그 1회성 정책을
  `wishlist.queries.ts`로 옮기고(`seededDetailIds` + `hydrateLikedFromDetail(productId, isLiked)`)
  `resetWishlistState`가 함께 비우게 했다 — 화면은 이제 effect에서 이 함수만 부른다(동작 무변경).
  **`hydrateLikedFromSummaries`와 정책이 다른 건 의도적이다**: 목록 카드는 해제 툼스톤으로 거르고
  서버가 `isLiked=false`로 확정하면 툼스톤이 풀려 이후의 정당한 재-찜을 반영하는데, 상세는 세션 내내
  1회로 못박는다. 두 정책을 하나로 합치는 건 동작 변경이라 별도 판단이 필요하니 무심코 통일하지 말 것.
  회귀는 `AC-WISH-017~019`(1회성·false/undefined 무시·세션 리셋 후 재시드).
- **새 전역 클라이언트 상태를 추가할 때 이 짝 맞추기를 점검할 것.** 모듈 레벨 상태를 두면 그걸 되돌리는
  경로를 함께 만들고 `test-setup.ts`에 배선해야 한다. feature 파일에 두면 shared의 리셋이 손을 못 대니
  (위 `seededLikedIds` 사례) 세션 수명을 갖는 상태는 처음부터 `shared/catalog` 쪽에 둘 것.

---

### web-buyer 고객센터 문의(`/settings/inquiry`, b6-st-3) — SCRUM-189

설정 홈/FAQ에서 진입하는 앱 서비스 문의 접수 화면. `POST /inquiries`(JWT 필수)에 실연동돼 있고
feature 모듈은 `features/inquiry`(`InquiryScreen` + `inquiry.mock` + `inquiry.queries`), 라우트는
`routes/settings/inquiry.tsx`다. DS 변경 없음.

- **어댑터 컨벤션은 breeds/배송지 절과 동일** — 생성된 react-query 훅이 아니라 fetcher(`submitInquiry`)만
  소비하고 `inquiry.queries.ts`가 자체 `useMutation`으로 감싼다(packages/api와 앱의 react-query 선언 범위가
  달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시 깨진다). 문의는 fire-and-forget이라 store도 캐시도 없다.
- **401은 화면이 떠안지 않는다** — axios 인터셉터의 refresh + `setOnAuthExpired` 전역 리다이렉트가 처리하므로
  `inquiryErrorMessage`는 비401(400/500 등)만 인라인 `role="alert"`로 안내한다. 성공만 토스트, 오류는 화면에 머문다.
- **문의 유형은 도메인 타입을 새로 만들지 않고 서버 enum(`SubmitInquiryRequestInquiryType`)을 그대로 쓴다.**
  `inquiry.mock.ts`의 `INQUIRY_TYPE_OPTIONS`가 그 enum에 목업 3-B 라벨만 1:1로 붙여 서버 enum이 feature 밖으로
  새지 않게 가둔다. 아이콘은 UI 관심사라 mock이 아니라 `InquiryScreen`의 `TYPE_ICONS`가 value로 매핑한다.
- **유형 선택은 DS `Select`가 아니라 select-trigger 버튼 + `BottomSheet`** — 목업이 그 형태이고, 유형별 아이콘을
  옵션에 넣어야 해서다(`Select`의 `options`는 `{value,label}`뿐).
- **내용 상한은 목업 카운터(1000)가 아니라 BE 계약인 2000자**(`MAX_INQUIRY_CONTENT_LENGTH`). 이메일 형식은
  `isValidEmail`이 느슨하게 거르고 최종 판정은 서버에 맡긴다. 제출 가능 판정은 `isValidInquiry` 하나가 단일 원본
  (버튼 활성/`handleSubmit` 가드가 같은 함수를 본다).
- **접수 성공은 토스트를 잠깐 띄운 뒤 `/settings`로 `replace: true` 이동**한다(Phase 6 결제 결과 화면과 같은 결 —
  뒤로가기가 제출된 폼을 재진입하지 않게). 이동 타이머는 토스트 `onClose`가 아니라 `submitted`에만 의존하는
  effect에 두고, 토스트 `duration`은 복귀 지연보다 길게 잡아 이동 전에 사라지지 않게 한다. `onClose`로는 모듈
  레벨 stable no-op을 넘긴다 — 매 렌더 새 함수를 주면 DS `Toast`의 타이머가 리셋된다.
- **진입점 2곳**: 설정 홈(`SettingsHomeScreen`의 `Headphones` 행)과 FAQ(`FaqScreen`의 하단 CTA + 결과 없음
  `EmptyState`의 `action`). Phase 5 절의 "고객센터 문의는 안 넣었다"는 이 배치 이전 기준 서술이니 그 문장을
  근거로 진입점을 지우지 말 것.
- **MSW/E2E**: `INQUIRIES_URL` 핸들러는 `testing/msw/server.ts`의 `handlers` 최상위에 등록돼 있다
  (`onboardingHandlers` 배열이 아님 — 상수 선언이 온보딩 구분 주석 아래 묶여 있지만 상태 없는 핸들러라
  온보딩 시더와 무관하다). `e2e/inquiry.spec.ts`가 `page.route` 스텁으로 접수 성공(4 상태)과
  401→refresh 실패→로그인 리다이렉트 두 갈래를 돈다.

---

### web-buyer 상품 리뷰 목록 — reviews API 실연동 (SCRUM-181, 커서 페이지네이션 + 서버 정렬/필터)

상품 리뷰 목록(`features/review`)이 하드코딩 mock에서 백엔드
`GET /api/v1/products/{productId}/reviews`(응답 `ApiResponse<ReviewListData>`, JWT 필수 — 비로그인
401)로 전환됐다. breeds/search가 깔아둔 fetcher 소비 + `useInfiniteQuery` 관례를 그대로 따랐으니
다음 목록형 실 API 연동도 아래 결정을 참고할 것.

- **OpenAPI 스펙은 손으로 유지(`packages/api/openapi/schema.yaml`), 경로는 `/api/v1` 접두 없이
  쓴다.** 리뷰는 `ReviewSort`(`latest`/`rating_desc`) + `ReviewItemResponse`/`ReviewImageResponse`/
  `ReviewRatingSummaryResponse` + `ReviewListData`/`ReviewListEnvelope`(`{ data }` 봉투, `ProductListData`/
  `SearchKeywordsEnvelope`와 동일 패턴)를 추가했다. `ratingDistribution`은 `Map<Int,Long>`이라
  `additionalProperties: { type: integer }`(→ TS `{ [key: string]: number }`, 키는 문자열 `'1'`~`'5'`),
  nullable 객체 필드(`summary`)는 3.0이라 `allOf: [$ref] + nullable: true`로 써야 orval이
  `T | null`을 만든다(확인함). 스펙 추가 후 `pnpm --filter @aechak/api openapi:generate` → 생성물 커밋
  (게이트 `openapi:generate:check`는 재생성물 커밋 전엔 항상 실패).
- **생성 훅이 아니라 fetcher(`getProductReviews(productId, params, signal)`)만 소비**하고 feature 쪽
  `review.queries.ts`가 자체 `useInfiniteQuery`로 감싼다(breeds 절과 같은 이유 — 패키지 간 react-query
  버전 표류 회피). `queryKey: ['reviews','product',productId,sort,photoOnly]`, `getNextPageParam`은
  `hasNext ? nextCursor : undefined`, `size` 20 고정. `summary`/`totalCount`는 서버가 첫 페이지
  (cursor 없음)에만 실어 주므로 `pages[0].summary`에서만 읽는다.
- **정렬(`sort`, 2종)과 포토리뷰만(`photoOnly`, 불리언)은 서버가 직교 파라미터로 두므로 UI 상태도
  나눴다** — 예전엔 `ReviewSort`에 `'photo'`를 3번째 정렬값으로 두었는데, `ProductReviewsScreen`을
  정렬 칩 2개(배타) + 포토리뷰만 토글 1개(독립, `aria-pressed`)로 분리하고 둘 다 서버 파라미터로
  넘긴다. `sortReviews`는 이제 `latest`/`rating_desc`만 다루고 포토 필터는 `filterPhotoReviews`로
  분리(둘 다 목업 폴백 전용 — 실 상품은 서버가 정렬/필터한다).
- **목업 카탈로그 상품은 네트워크 호출 전에 `findMockProduct(productId)`로 걸러 바로 목업 리뷰를
  보여준다.** `fetchReviewPage`가 `getProductReviews`를 부르기 **전에** `findMockProduct`(레지스트리
  제외, `p-*` 카탈로그 id만)로 목업 상품이면 `mockPage`를 즉시 반환한다. `findProduct`가 아니라
  `findMockProduct`인 이유: 예전에 조회돼 레지스트리에 등록된 실 ULID를 목업으로 되살려 백엔드가
  미존재/비노출로 판정한 상품을 가짜 템플릿 리뷰로 보여주는 회귀를 막기 위함(codex 리뷰 — 상품
  상세 `useProductOptions`의 `findMockProduct` 관례와 동일). 실 상품의 첫 페이지 404는 목업 폴백이
  아니라 `notFound`로 처리해 "상품을 찾을 수 없어요"를 낸다(가짜 리뷰 위장 금지). 홈/검색/찜의
  목업 진입점과 기존 라우트 테스트(`p-feeder-5l`)는 이 분기 덕에 네트워크 없이 그대로 산다.
- **서버는 `isMine`을 주지 않는다.** 내가 쓴 리뷰(로컬 스토어의 mock 작성분)는 이 상품 것만 골라
  `isMine:true`로 얹되, `sortReviews([...mine, ...others], sort)`로 서버 리뷰와 **활성 정렬로 함께
  정렬**한다(내 리뷰가 정렬과 무관하게 상단 고정되지 않도록). 서버 리뷰는 타인 리뷰(`isMine:false`,
  `ReviewCard`), 내 리뷰는 `MyReviewCard`로 렌더한다. 서버 DB엔 mock 작성 리뷰가 없어 중복되지
  않는다 — 다만 **SCRUM-181은 목록 GET만이라 작성/수정/삭제는 여전히 mock 스토어**다(방금 쓴
  리뷰가 서버 목록엔 안 뜨는 괴리는 알고 있을 것, 쓰기 API가 생기면 해소된다). 참고로 이중 리뷰에서
  codex는 "mine을 커서 페이지네이션 목록에 인터리브하면 더보기마다 위치가 이동한다"고 major로
  지적했으나, Claude verify가 0~1건 로컬 항목이라 체감 불가로 반박해 인터리브를 유지했다(정렬 자체는
  0을 반환하는 안정 정렬이라 서버 순서는 보존됨). 서버 항목 → 도메인 `Review` 형태 매핑은 필드명이
  달라 `review.queries.ts`의
  `toReviewItem`이 흡수한다(`authorNickname`→`author`, `createdAt` ISO LocalDateTime→`'YYYY.MM.DD'`,
  `images[].imageUrl`→`string[]`, `id`=`srv-<reviewId>`). 별점 분포 막대는 `ratingDistribution` 개수를
  `reviewCount`로 나눠 5★→1★ 퍼센트로 환산(`toDistribution`).
- **리뷰 목록 API는 JWT 필수(비로그인 401)라 "전체보기" 진입점을 로그인 게이트로 감쌌다.** 상품
  상세(`ProductDetailScreen`)는 permitAll이라 게스트 열람을 유지하려고 리뷰 API를 붙이지 않고,
  진입점만 상세 응답의 리뷰 건수(`reviewSummary.total > 0`, 예전 `data.reviews.length > 0`에서 변경)로
  노출한다. 다만 그 진입을 게이트 없이 두면 비회원이 눌렀을 때 401 → refresh 실패 → 전역
  `setOnAuthExpired`가 로그아웃+`/onboarding/login`으로 보내 보던 상세를 잃는다 — 그래서
  `useLoginGate().requireAuth('review', () => navigate(...))`로 감싸 비회원에겐 로그인 BottomSheet를
  먼저 띄운다(`LoginGate`에 `'review'` `GateFeature` 추가). 이 결정은 codex + Claude 이중 적대 리뷰가
  독립적으로 같은 회귀(게스트 강제 이탈)를 지목해 수렴한 것이라 반영했다 — 회원 전용 열람 액션을
  새로 만들 때 이 `requireAuth` 게이트 패턴을 기본으로 볼 것.
- **헤더 개수는 목록과 어긋나지 않게 맞춘다.** `ProductReviewsScreen` 헤더 "리뷰 N"은 요약 카드의
  서버 평점 모수(`total`=서버 `reviewCount`)가 아니라 `filteredTotal`을 쓴다 — `(서버 totalCount ??
  summary.total) + mine.length`(photoOnly 필터 반영 + 내 리뷰 수 합산). 목업 폴백은 카탈로그 집계
  (`mock.total`, 예: 1204)가 아니라 실제 렌더되는 목업 리뷰 수(`items.length`)를 `totalCount`로 써서
  "리뷰 1204"가 6장 위에 뜨는 불일치를 없앤다(codex+Claude 수렴 finding). 요약 카드(평균/분포)는
  서버 집계 그대로(내 mock 리뷰는 서버 평점 모수가 아니므로 제외) — 헤더=목록, 요약=서버 평점으로
  역할을 나눈다.
- **"더보기"(다음 페이지) 실패는 목록 전체를 에러 화면으로 교체하지 않는다.** `useInfiniteQuery`는
  fetchNextPage가 실패해도 `query.isError`를 켜므로, 화면은 `isError && !data`(=최초 로딩 실패, 불러온
  데이터 없음)일 때만 에러 화면으로 전환하고, 이미 목록이 있으면 유지한다(다음 페이지는 더보기
  버튼으로 재시도). `placeholderData`는 `keepPreviousData`를 그냥 쓰지 않고 `(prev, prevQuery) =>
  prevQuery?.queryKey[2] === productId ? prev : undefined`로 **같은 상품일 때만** 이전 데이터를 유지한다
  (정렬/포토 토글은 제자리 갱신, productId 전환 시엔 새 로딩) — 둘 다 codex 리뷰 반영.
- **MSW 핸들러**(`testing/msw/server.ts`)는 `REAL_PRODUCT_ID`만 200(sort/photoOnly/cursor 반영),
  나머지는 404(목업 id는 애초에 네트워크를 안 타므로 위 `findMockProduct` 분기로 처리). 픽스처는 사진
  3건/무사진 2건으로 photoOnly를 검증한다. 회귀는 `review-route.test`의 `[AC-REVIEW-ROUTE-008~012]`
  (요약/리뷰 렌더·포토 토글·서버 정렬·더보기 페이지네이션·헤더 필터 개수), `product-route.test`의
  `[AC-PRODUCT-014]`(비회원 전체보기 로그인 게이트), `review.mock.test`의 `[AC-REVIEW-005/006]`
  (정렬/필터 분리), 그리고 `e2e/reviews.spec.ts`(`[AC-REVIEW-E2E-001~004]`)가 잡는다.

---

### 상품 상세 리뷰 미리보기 + 서버 isMine 소비 (SCRUM-185, 2026-08-21)

위 리뷰 목록 연동이 남겨둔 두 구멍을 메웠다 — 상세(b1-st-2)의 리뷰 미리보기가 실 상품에서 항상
비어 있던 것과, 내 리뷰 판별을 로컬 스토어로만 추측하던 것.

- **상세 미리보기는 `features/product`가 리뷰 목록 API를 직접 부른다**
  (`product.queries.ts`의 `useProductReviewPreview` + `product.map.ts`의 `mapReviewPreview`).
  `features/product`는 `features/review`를 import할 수 없어(boundaries) `useProductReviews`를
  재사용하지 못한다 — 훅을 shared로 승격하는 대신 상세 전용 얇은 `useQuery`를 두었다.
  **쿼리 키는 `['reviews','product',id,'preview']`로 목록 화면과 분리한다** — 목록은
  `useInfiniteQuery`라 같은 키를 쓰면 캐시 구조가 충돌한다.
- **`enabled`에 로그인 여부를 반드시 넣을 것.** 리뷰 목록 API는 be `SecurityConfig`의 permitAll에
  없어 JWT 필수다(상세 조회 자체는 permitAll). 비회원이 상세를 열었다고 미리보기를 부르면 401 →
  `setOnAuthExpired` 전역 리다이렉트로 **보고 있던 상세를 잃는다**. 그래서
  `enabled: isLoggedIn && data.reviews.length === 0 && data.reviewSummary.total > 0`이다 —
  목업 상품은 상세 뷰모델이 이미 `sampleReviews`를 들고 있어 서버를 부르지 않고(실 상품만 빈 배열),
  리뷰 0건이면 호출 자체가 낭비다. 404는 던지지 않고 빈 배열로 흡수한다(상세 본문은 이미 그려져
  있어 화면을 not-found로 되돌리면 안 된다). 회귀: `[AC-PRODUCT-018]`(로그인 시 상위 3건 노출·
  4번째 부재), `[AC-PRODUCT-019]`(비회원은 호출 횟수 0).
- **내 리뷰 판별(isMine)은 서버 응답을 그대로 신뢰한다(SCRUM-210).** 한때 `ReviewItemResponse`에
  작성자 식별자가 없어(`ProductReviewController`가 `@AuthenticationPrincipal`을 안 받음) FE가
  로컬 스토어로만 추측했는데, BE가 `isMine`을 필수 비null로 내려주기로 해 `toReviewItem`이 그 값을
  쓴다. **닉네임 비교 같은 추측 판별을 되살리지 말 것** — 닉네임 유일성은 DB UNIQUE 제약이지 API
  계약이 아니라 정책이 바뀌면 조용히 깨진다.
- **서버 리뷰에는 수정 버튼을 그리지 않는다(`serverReviewId(review.id) == null`일 때만 `onEdit` 주입).**
  수정은 서버 API가 없어 로컬 스토어(`useReviewById`)에서만 대상을 찾는데, 서버에서 온 리뷰는
  스토어에 없어 작성 화면이 `editing === undefined`로 떨어지고 "리뷰할 상품을 찾을 수 없어요"
  막다른 화면이 된다. `isMine`을 서버에서 받기 시작하면서 생긴 회귀라 두 리뷰어가 독립적으로
  같은 지적을 했다 — 삭제는 `srv-` 접두로 서버 경로가 있어 대칭이 맞는다. 회귀는
  `[AC-REVIEW-ROUTE-014]`와 `[AC-REVIEW-E2E-008]`이 잡는다. **수정 API가 생기기 전까지 이
  버튼을 되살리지 말 것.**
- **미리보기 조회 실패는 화면이 소비해야 한다.** 쿼리가 404만 빈 배열로 흡수하고 500은 던지는데,
  화면이 `data ?? []`만 읽으면 던진 오류가 아무 데도 도달하지 않아 "리뷰 128" 아래가 그냥 빈다
  (주석이 약속한 보호가 실제로는 없는 상태였다). `isError` 안내와 `isPending` 스켈레톤을 함께 둔다.
- **정렬/포토 전환 실패 화면에는 기본 필터로 되돌릴 길을 둔다.** 에러 분기가 본문을 통째로
  `EmptyState`로 바꾸는데 정렬 칩이 그 본문 안에 있어, 주석이 말한 "칩을 되돌리면 캐시된 목록이
  다시 뜬다"를 실행할 수단이 사라진다. 기본 필터가 아닐 때만 `최신순으로 보기` action을 준다
  (재시도 버튼이 아니라 상태 복원이라 breeds 컨벤션과 충돌하지 않는다). 회귀는 `[AC-REVIEW-ROUTE-015]`.
- **MSW 리뷰 픽스처는 로컬 인터페이스가 아니라 생성 타입(`ReviewItemResponse`)을 쓴다.** 예전
  `ReviewItemFixture` 인터페이스는 서버 계약에 필수 필드가 늘어도 tsc가 못 잡아 런타임에만
  `undefined`가 샜다(찜 `ProductFixture`가 같은 함정을 안고 있다). 생성 타입으로 바꾸니 `isMine`
  누락을 컴파일 단계에서 잡는다 — 다른 픽스처도 새로 만들 땐 생성 타입을 먼저 볼 것.
  **`e2e/`도 같은 이유로 생성 타입을 쓴다** — 여긴 tsc include 밖이라 로컬 인터페이스면 누락을
  아무도 못 잡고 런타임에만 `undefined`가 샌다(실제로 `isMine`이 그렇게 빠져 있었다).

---
