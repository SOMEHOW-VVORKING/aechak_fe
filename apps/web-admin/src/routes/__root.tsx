import { useMemo } from 'react'
import { getAccessToken, restoreSession } from '@aechak/api'
import { createRootRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav } from '@aechak/design-system/web'
import type { NavGroup } from '@aechak/design-system/web'
import {
  Activity,
  ChartNoAxesColumn,
  ClipboardCheck,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Package,
  RotateCcw,
  ScanEye,
  ScrollText,
  ShieldCheck,
  Star,
  Store,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'
import { LogoutButton } from '@/features/auth'
import { usePendingApplicationCount } from '@/features/seller-applications'

const iconClass = 'size-full'

const APPLICATIONS_NAV_KEY = '/sellers/applications'

/*
 * 서버가 아직 없어 들어가도 **예시 데이터**만 보이는 항목의 꼬리표(`tag: '준비 중'`).
 *
 * 규약 10의 목적은 메뉴를 숨기는 것이 아니라 **운영자가 속지 않게** 하는 것이다. 메뉴에서 빼
 * 버리면 운영자는 어드민이 무엇을 다루는 도구인지조차 알 수 없고(2026-10-18 SCRUM-238에서
 * 14항목이 통째로 사라졌다), 멀쩡한 화면처럼 보여주면 저장된 줄 안다. 그래서 **메뉴에는 올리고
 * 글자로 밝힌다.**
 *
 * 꼬리표가 붙은 항목의 라우트는 2026-10-26까지 `UnavailableScreen` 안내만 보여줬는데, 그러면
 * 운영자가 기능의 모양조차 볼 수 없어 되돌렸다(SCRUM-308) — 지금은 화면을 열고 상단에 공용
 * `MockDataNotice` 띠로 예시임을 밝히며 쓰기를 서버로 내보내지 않는다. **꼬리표는 그대로 둔다**:
 * 들어가기 전에 알 수 있어야 한다.
 *
 * 2026-11-07 기준 이 꼬리표가 남은 항목은 **없다.** 셀러 관리(SCRUM-362)와 대시보드는 실연동돼
 * 꼬리표를 뗐고, 채팅 CS 모니터링은 아래 nav 주석의 이유로 항목째 내렸다. 꼬리표가 다시 필요한
 * 항목이 생기면 그 항목에 꼬리표를 다시 달고 `admin-nav.test.tsx`의 분류 배열을 되살린다.
 *
 * 숫자 배지(`badge`)와 별개 필드인 이유는 쓰임이 다르기 때문이다. 배지는 "처리 대기 N건"이고
 * 꼬리표는 "아직 열리지 않았다"라, 입점 심사처럼 둘을 겸해야 하는 항목이 생기면 한 자리에
 * 겹쳐 쓸 수 없다. BE가 생기면 그 항목에서 이 꼬리표를 떼고 화면의 띠를 걷는다.
 */

// nav 구성은 SCRUM-238 차단 이전(26e4b89^)의 5그룹을 되살린 것이고, 그 뒤 생긴 `/admins`를
// 운영 관리 그룹에 더해 15항목이 됐다. 목데이터 '상품 검수 관리'의 입구를 내려 14항목이었다가
// (SCRUM-313) 그 화면이 실연동되면서 '상품 카탈로그 관리'로 다시 올라와 15항목이 됐고(SCRUM-363),
// '채팅 CS 모니터링'을 내려 14항목이 됐다가(SCRUM-377), 검수 진행 현황 경로로 'AI 검수
// 모니터링'이(SCRUM-367), 검수 집계 경로로 'AI 검수 지표'가(SCRUM-279) 더해져 지금은
// **5그룹 16항목, 전부 실연동**이다. 차단 이전 nav의
// "확장 예정" 6항목 — 홈 배너·카테고리·정산·어드민 계정 권한·고급 통계·세금 신고 — 은 복원
// 대상이 아니고, 그중 어드민 계정 권한 관리는 `/admins`가 대신한다.
//
// '채팅 CS 모니터링'은 **규약 10의 꼬리표가 아니라 항목 제거로 처리했다.** 꼬리표는 "BE가 생기면
// 열린다"는 약속이라 그 약속이 서는 항목에만 쓸 수 있는데, 채팅은 **BE에 도메인 자체가 없어**
// (SNS 쪽 `/sns/*`만 열려 있다) 실연동될 길이 없고 데모 범위에서도 뺐다. 그래서 입구만 내리는
// 것으로 끝내지 않고 라우트(`routes/chat-monitoring.tsx`)와 feature(`features/chat-monitoring/`)까지
// 함께 지웠다 — 돌아올 화면이 아니라 URL로 닿을 자리도 남길 이유가 없다. 채팅이 생기면 꼬리표를
// 붙여 되올리지 말고 그때 실연동으로 새로 만든다.
//
// 꼬리표 유무는 dev 실측으로 갈랐다(2026-10-30, `GET /v3/api-docs`). admin-api-dev에 있는 경로는
// `/admin/admins`(+`/{userId}`), `/admin/seller-applications` 계열 넷, `/admin/members` 계열
// 넷(목록·상세·제재·해제), `/admin/orders` 계열 넷(목록·지표·상세·발송 독촉, SCRUM-339),
// `/admin/inquiries` 넷(목록·상세·답변·상태 전이), `/admin/claims` 넷(목록·사유 카탈로그·상세·
// 개입), `/admin/reviews` 다섯(목록·상세·블라인드·해제·삭제), 그리고 이번에 확인된
// `GET /admin/audit-logs` 하나(어드민 액션 로그, SCRUM-318)와 `/admin/notices` 여섯(알림/공지
// 관리, SCRUM-332 — 목록·초안 생성·상세·수정·게시·내림), `/admin/reports` 셋(신고 제재 관리,
// SCRUM-241 — 목록·상세·처리), `/admin/sellers` 다섯(셀러 관리, SCRUM-362 — 목록·상세·판매정지·
// 해제·메모)이다. 2026-11-07에 `/admin/inspections` 둘(목록·상세)이 더해져 'AI 검수 모니터링'이
// 실연동으로 들어왔다(SCRUM-367).
// seller·api 호스트에 이름이 닮은 경로(`/sellers/me/orders`·`/reviews`·`/inquiries`)가 있어도
// 셀러·구매자 본인 스코프라 운영자가 전체를 들여다볼 수 없고, 애초에 web-admin은 `sellerOrigin`을
// 설정하지 않아 `/sellers/**`를 부르면 어드민이 아닌 api 호스트로 나간다(main.tsx).
const navGroups: NavGroup[] = [
  {
    key: 'operations',
    label: '운영',
    items: [
      // 로그인 복귀 지점이라 라우트를 비울 수 없다. admin 모듈에 운영 지표를 한 번에 주는 경로는
      // 여전히 없지만, 이미 실연동된 화면들의 목록·지표 경로를 1건짜리 조회로 건수만 받아
      // 일곱 칸과 할 일 네 줄을 전부 실 집계로 채웠다(routes/index.tsx) — 지어낸 숫자를 그리는
      // 칸이 없어 꼬리표를 뗐다. 실 집계 화면에 꼬리표를 남기면 실데이터를 예시로 의심하게
      // 만들어 규약 10의 목적을 거꾸로 깨뜨린다.
      {
        key: '/',
        label: '대시보드',
        icon: <LayoutDashboard className={iconClass} />,
      },
      {
        // 배지 숫자는 아래 AdminNavShell이 서버 심사 대기 수로 채운다 — 상수 배지는 AGENTS.md가
        // 금지한 장식 UI이고, 심사 화면이 같은 수를 실데이터로 띄우는 지금은 서로 모순된다.
        key: APPLICATIONS_NAV_KEY,
        label: '셀러 입점 심사',
        icon: <ClipboardCheck className={iconClass} />,
      },
      // `/admin/sellers` 다섯(목록·상세·판매정지·해제·메모)이 생겨 실연동됐다(SCRUM-362) —
      // 꼬리표를 떼고 화면의 띠도 걷었다. 입점 심사와 별개의 층이다: 여기서 막는 것은 판매이고
      // 계정 로그인 차단은 '일반 회원 관리'가 users.status로 따로 다룬다.
      {
        key: '/sellers',
        label: '셀러 관리',
        icon: <Store className={iconClass} />,
      },
      // `/admin/members` 넷(목록·상세·제재·해제)이 생겨 실연동됐다 — 꼬리표를 떼고 화면의 띠도 걷었다.
      {
        key: '/members',
        label: '일반 회원 관리',
        icon: <Users className={iconClass} />,
      },
      // `/admin/products` 셋(목록·판매중지·재개)이 생겨 실연동됐다(SCRUM-363) — 내렸던 입구를
      // 다시 올리고 화면의 띠를 걷었다. **이름을 '상품 검수 관리'에서 바꿨다.** 입구를 내리게 한
      // 사고(SCRUM-313)의 원인은 목데이터라는 사실보다 **이름이 'AI 검수 큐'와 닮은 것**이었고,
      // 둘 다 실연동이 된 지금 이름을 그대로 올리면 운영자가 다시 "검수는 어느 쪽에서 하나"를
      // 헷갈린다. 이 화면은 전수 상품의 노출·판매를 다루는 카탈로그 관리이고 검수 판정 대기열은
      // 큐다 — 그래서 '검수' 그룹이 아니라 전수 관리가 모인 이 그룹에 둔다(셀러·회원과 같은 결).
      // 검수 승인·반려 조작이 이 화면에도 있지만 그건 큐의 경로를 그대로 부르는 것이고, 모수를
      // 쌓아 주는 쪽은 큐다.
      {
        key: '/products/catalog',
        label: '상품 카탈로그 관리',
        icon: <Package className={iconClass} />,
      },
    ],
  },
  {
    key: 'review',
    label: '검수',
    items: [
      // `/admin/product-inspections` 넷(목록·상세·승인·반려)에 실연동됐다(SCRUM-283) — 꼬리표를 뗐다.
      //
      // 한때 같은 그룹에 있던 목데이터 '상품 검수 관리'는 실연동되면서 이름과 자리를 함께
      // 바꿨다('상품 카탈로그 관리', 위 '운영' 그룹 — SCRUM-363). 이름이 닮은 두 항목이 나란히
      // 서면 운영자는 어느 쪽이 실제 검수인지 알 수 없고, 그게 SCRUM-313에서 입구를 내리게 한
      // 사고였다. 그래서 이 항목은 **판정 대기열**이라는 역할만 쥔다 — 아래 '모니터링'과 모수가
      // 다르다(여기는 운영자가 처리할 것, 아래는 지금 돌고 있는 것 전부).
      {
        key: '/products/ai-queue',
        label: 'AI 검수 큐',
        icon: <ScanEye className={iconClass} />,
      },
      // `/admin/inspections` 둘(목록·상세)이 생겨 실연동으로 들어왔다(SCRUM-367).
      //
      // **이름을 '큐'와 가르는 축은 모수와 역할이다.** 큐는 운영자가 **처리할** 것이 쌓이는
      // 작업 목록이라 위반 판정 건만 올라오고 승인·반려가 거기 있다. 이 화면은 **지금 돌고
      // 있는 검수 건 자체**라 판정 전과 통과까지 전부 나오고 쓰기가 없다. 그래서 '모니터링'을
      // 골랐다 — 어드민 nav가 이미 그 말을 "지금 흐르는 것을 본다"는 뜻으로 쓰고 있어
      // ('주문 배송 모니터링'·'채팅 CS 모니터링') 운영자가 새 말을 배우지 않아도 된다.
      {
        key: '/inspections/monitoring',
        label: 'AI 검수 모니터링',
        icon: <Activity className={iconClass} />,
      },
      // 집계(`/admin/inspection-metrics`)로 실연동된 세 번째 항목이다(SCRUM-279). 이름이 셋 다
      // 갈린다 — 지표는 끝난 건만 센 집계(창이 settled_at 기준), 큐는 작업 목록, 모니터링은
      // 진행 현황이다. 배지는 두지 않는다. 지표에는 '처리해야 할 N건' 같은 단일 수가 없다.
      {
        key: '/products/ai-metrics',
        label: 'AI 검수 지표',
        icon: <ChartNoAxesColumn className={iconClass} />,
      },
    ],
  },
  {
    key: 'reports-inquiries',
    label: '신고 / 문의',
    items: [
      // `/admin/reports` 셋(목록·상세·처리)이 생겨 실연동됐다(SCRUM-241) — 꼬리표를 떼고 화면의
      // 띠도 걷었다. 신고 **접수**(구매자)는 api 호스트의 `/reports`이고 그쪽은 본인 접수 경로다.
      {
        key: '/reports',
        label: '신고 제재 관리',
        icon: <Flag className={iconClass} />,
      },
      // `/admin/inquiries` 넷(목록·상세·답변·상태 전이)이 생겨 실연동됐다 — 꼬리표를 떼고 화면의
      // 띠도 걷었다(SCRUM-314 / SCRUM-331). api 호스트의 `/inquiries`는 구매자 본인 접수 경로다.
      {
        key: '/inquiries',
        label: '서비스 문의 관리',
        icon: <LifeBuoy className={iconClass} />,
      },
    ],
  },
  {
    key: 'orders-claims',
    label: '주문 / 클레임',
    items: [
      // 셋 다 admin 경로에 붙어 꼬리표가 없다 — 주문 배송 모니터링은 `/admin/orders` 계열
      // 넷(SCRUM-339), 클레임과 리뷰는 `/admin/claims`·`/admin/reviews`(SCRUM-320·SCRUM-319 /
      // SCRUM-331)다. seller·api 호스트의 닮은 경로는 셀러·구매자 본인 스코프라 운영자가
      // 플랫폼 전체를 볼 수 없다.
      {
        key: '/orders/monitoring',
        label: '주문 배송 모니터링',
        icon: <Truck className={iconClass} />,
      },
      {
        key: '/claims',
        label: '취소/반품/교환',
        icon: <RotateCcw className={iconClass} />,
      },
      {
        key: '/reviews',
        label: '리뷰 관리',
        icon: <Star className={iconClass} />,
      },
      // 네 번째였던 '채팅 CS 모니터링'은 2026-11-07에 내렸다 — 사유는 위 nav 주석에 적었다.
    ],
  },
  {
    key: 'ops-management',
    label: '운영 관리',
    items: [
      // 관리자 명부는 admin 모듈에 EP 3종(GET·POST /admin/admins, DELETE /admin/admins/{userId})이
      // 있어 꼬리표 없이 실연동이다. 차단 이전 nav의 "어드민 계정 권한 관리"를 이것이 대신한다.
      { key: '/admins', label: '관리자 관리', icon: <UserCog className={iconClass} /> },
      // `/admin/notices` 여섯(목록·초안 생성·상세·수정·게시·내림)이 생겨 실연동됐다(SCRUM-332) —
      // 꼬리표를 떼고 화면의 띠도 걷었다. 서버가 알림을 보내지는 않아 발송 UI는 함께 지웠다.
      { key: '/notices', label: '알림/공지 관리', icon: <Megaphone className={iconClass} /> },
      // `/admin/audit-logs`가 생겨 실연동됐다(SCRUM-318) — 꼬리표를 떼고 화면의 띠도 걷었다.
      { key: '/audit-log', label: '어드민 액션 로그', icon: <ScrollText className={iconClass} /> },
    ],
  },
]

/**
 * nav `key`와 맞춰 보기 전에 경로의 꼬리 슬래시를 떼어 낸다.
 *
 * `SideNav`는 `activeKey`를 key와 **완전 일치**로만 비교한다(DS가 경로 규칙을 알 수 없으므로
 * 그래야 맞다). 그런데 어드민 라우트는 대부분 index 라우트라 주소창에 `/sellers/`처럼 꼬리
 * 슬래시가 붙은 채로 들어오는 경로가 그대로 유지된다 — 화면은 열리지만 어느 항목도 활성이 되지
 * 않아 활성 스타일과 `aria-current="page"`가 통째로 사라진다(운영자는 자기가 어느 메뉴에 있는지
 * 알 수 없고 스크린리더도 현재 위치를 읽지 못한다). 앱 안에서 nav를 눌러 이동하면 슬래시가 붙지
 * 않아 북마크·외부 링크·주소 직접 입력에서만 드러난다.
 *
 * 루트(`/`)는 그 자체가 key라 건드리지 않는다 — 떼어 내면 빈 문자열이 되어 대시보드가 영구히
 * 비활성이 된다. 중첩 경로(`/sellers/applications`)는 key가 그 꼴 그대로라 자르지 않는다.
 */
const navActiveKey = (pathname: string) =>
  pathname === '/' ? pathname : pathname.replace(/\/+$/, '')

/**
 * 입점 신청 배지만 서버 값으로 채운다. 같은 queryKey를 심사 화면도 쓰므로 조회가 중복되지 않고,
 * 권한이 없거나 조회가 실패하면 null이 와서 배지 자체가 사라진다(틀린 숫자를 띄우지 않는다).
 */
function withPendingBadge(groups: NavGroup[], pendingCount: number | null): NavGroup[] {
  if (pendingCount == null) return groups
  return groups.map(group => ({
    ...group,
    items: group.items.map(item =>
      item.key === APPLICATIONS_NAV_KEY ? { ...item, badge: pendingCount } : item,
    ),
  }))
}

function AdminShell() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  // /login 계열(로그인 화면 + /login/complete 서버 콜백 복귀)은 nav에 속하지 않는 별도 라우트라
  // SideNav 없이 단독 렌더링한다. 셸 안의 usePendingApplicationCount가 로그인 전에 심사 조회를
  // 발사해 401/403을 만들지 않도록, 훅보다 **먼저** 돌려보낸다(조건을 훅 아래로 내리면 안 된다).
  // 로그인 플로우 밖에서 SideNav-less 라우트가 또 생기면 조건을 더하지 말고 pathless layout으로
  // 전환할 것(web-seller AppShell과 같은 지시).
  if (isLoginFlow(pathname)) {
    return <Outlet />
  }
  return <AdminNavShell pathname={pathname} />
}

function AdminNavShell({ pathname }: { pathname: string }) {
  const navigate = useNavigate()
  const pendingCount = usePendingApplicationCount()
  const groups = useMemo(() => withPendingBadge(navGroups, pendingCount), [pendingCount])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base">
      <SideNav
        groups={groups}
        activeKey={navActiveKey(pathname)}
        onSelect={key => navigate({ to: key })}
        // 세 웹앱이 refresh 쿠키 하나를 공유해 어드민에 로그아웃이 없으면 데모 중 계정 전환이
        // 쿠키 수동 삭제 말고는 불가능하다(SCRUM-353). nav 항목이 아니라 footer에 두는 이유는
        // 목적지가 아니라 세션 조치라서다 — 항목으로 올리면 활성 표시·배지 규칙에 섞인다.
        footer={<LogoutButton />}
        header={
          <div className="flex items-center gap-3">
            <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-brand-subtle text-brand">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text-primary">애착 어드민</p>
              <p className="truncate text-caption text-text-tertiary">운영 백오피스</p>
            </div>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

const isLoginFlow = (pathname: string) =>
  pathname === '/login' || pathname === '/login/' || pathname.startsWith('/login/')

export const Route = createRootRoute({
  /*
   * 새로고침 직후에는 메모리에 access가 없다. 화면이 먼저 뜨면 첫 `/admin/**` 요청들이 토큰 없이
   * 나가 401을 받고, refresh 뒤 재시도가 끝날 때까지 대시보드가 실패 표기('—')로 그려진다.
   * 그래서 화면보다 먼저 refresh를 한 번 한다(구매자·셀러 __root와 같은 자리).
   *
   * 실패는 여기서 판정하지 않는다. 세션이 없으면 첫 요청의 401이 공유 클라이언트를 거쳐
   * setupAuthExpiredRedirect로 로그인에 보낸다. 로그인 흐름은 자기 refresh·로그인을 하므로 건너뛴다.
   */
  beforeLoad: async ({ location }) => {
    if (isLoginFlow(location.pathname) || getAccessToken()) return
    await restoreSession().catch(() => undefined)
  },
  component: AdminShell,
})
