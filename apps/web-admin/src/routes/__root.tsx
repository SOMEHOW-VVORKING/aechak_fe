import { useMemo } from 'react'
import { createRootRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav } from '@aechak/design-system/web'
import type { NavGroup } from '@aechak/design-system/web'
import {
  ClipboardCheck,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessagesSquare,
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

/**
 * 서버가 아직 없어 들어가도 **예시 데이터**만 보이는 항목의 꼬리표.
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
 * 숫자 배지(`badge`)와 별개 필드인 이유는 쓰임이 다르기 때문이다. 배지는 "처리 대기 N건"이고
 * 꼬리표는 "아직 열리지 않았다"라, 입점 심사처럼 둘을 겸해야 하는 항목이 생기면 한 자리에
 * 겹쳐 쓸 수 없다. BE가 생기면 그 항목에서 이 꼬리표를 떼고 화면의 띠를 걷는다.
 */
const PENDING_TAG = '준비 중'

// nav 구성은 SCRUM-238 차단 이전(26e4b89^)의 5그룹을 되살린 것이고, 그 뒤 생긴 `/admins`를
// 운영 관리 그룹에 더해 15항목이 됐고, 목데이터 '상품 검수 관리'의 입구를 내려(아래 '검수' 그룹)
// 지금은 14항목이다(차단 이전 nav의 "확장 예정" 6항목 — 홈 배너·카테고리·정산·
// 어드민 계정 권한·고급 통계·세금 신고 — 은 복원 대상이 아니고, 그중 어드민 계정 권한 관리는
// `/admins`가 대신한다).
//
// 꼬리표 유무는 dev 실측으로 갈랐다(2026-10-30, `GET /v3/api-docs`). admin-api-dev에 있는 경로는
// `/admin/admins`(+`/{userId}`), `/admin/seller-applications` 계열 넷, `/admin/members` 계열
// 넷(목록·상세·제재·해제), `/admin/orders` 계열 넷(목록·지표·상세·발송 독촉, SCRUM-339),
// `/admin/inquiries` 넷(목록·상세·답변·상태 전이), `/admin/claims` 넷(목록·사유 카탈로그·상세·
// 개입), `/admin/reviews` 다섯(목록·상세·블라인드·해제·삭제), 그리고 이번에 확인된
// `GET /admin/audit-logs` 하나(어드민 액션 로그, SCRUM-318)와 `/admin/notices` 여섯(알림/공지
// 관리, SCRUM-332 — 목록·초안 생성·상세·수정·게시·내림), `/admin/reports` 셋(신고 제재 관리,
// SCRUM-241 — 목록·상세·처리)이다.
// seller·api 호스트에 이름이 닮은 경로(`/sellers/me/orders`·`/reviews`·`/inquiries`)가 있어도
// 셀러·구매자 본인 스코프라 운영자가 전체를 들여다볼 수 없고, 애초에 web-admin은 `sellerOrigin`을
// 설정하지 않아 `/sellers/**`를 부르면 어드민이 아닌 api 호스트로 나간다(main.tsx).
const navGroups: NavGroup[] = [
  {
    key: 'operations',
    label: '운영',
    items: [
      // 로그인 복귀 지점이라 라우트를 비울 수 없다 — admin 모듈에 운영 지표 집계 API가 없어
      // 지표는 예시로 그리고, 심사 대기 수만 실 API 값을 쓴다(routes/index.tsx).
      {
        key: '/',
        label: '대시보드',
        icon: <LayoutDashboard className={iconClass} />,
        tag: PENDING_TAG,
      },
      {
        // 배지 숫자는 아래 AdminNavShell이 서버 심사 대기 수로 채운다 — 상수 배지는 AGENTS.md가
        // 금지한 장식 UI이고, 심사 화면이 같은 수를 실데이터로 띄우는 지금은 서로 모순된다.
        key: APPLICATIONS_NAV_KEY,
        label: '셀러 입점 심사',
        icon: <ClipboardCheck className={iconClass} />,
      },
      // 입점 심사와 별개다 — 승인된 셀러의 계정 조회·제재 API가 admin 모듈에 없다.
      {
        key: '/sellers',
        label: '셀러 관리',
        icon: <Store className={iconClass} />,
        tag: PENDING_TAG,
      },
      // `/admin/members` 넷(목록·상세·제재·해제)이 생겨 실연동됐다 — 꼬리표를 떼고 화면의 띠도 걷었다.
      {
        key: '/members',
        label: '일반 회원 관리',
        icon: <Users className={iconClass} />,
      },
    ],
  },
  {
    key: 'review',
    label: '검수',
    items: [
      // `/admin/product-inspections` 넷(목록·상세·승인·반려)에 실연동됐다(SCRUM-283) — 꼬리표를 뗐다.
      //
      // 목데이터 화면 `/products/review`('상품 검수 관리')는 **입구만 내렸다**(SCRUM-313). 규약 10이
      // "nav 항목은 빼지 말고 꼬리표를 달라"고 한 것은 그 기능의 통로가 그 항목뿐일 때이고, 여기는
      // 같은 그룹에 실연동 항목이 있었다 — 운영자는 이름이 맞는 '상품 검수 관리'를 먼저 눌러 저장되지
      // 않는 화면에서 검수를 처리했다고 믿었고, 실제로 동작하는 검수는 바로 아래 항목이었다.
      // 라우트와 화면의 띠는 그대로 둔다(URL로는 닿고, 그때 띠가 없으면 실데이터로 읽는다).
      // 검수 BE 스택(#149 SCRUM-282 + #153~#157 SCRUM-284~288)이 머지되면 그 화면을 실연동하고
      // 항목을 되올린다.
      {
        key: '/products/ai-queue',
        label: 'AI 검수 큐',
        icon: <ScanEye className={iconClass} />,
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
      // 채팅 자체가 BE에 없다(SNS 쪽 `/sns/*`만 열려 있다).
      {
        key: '/chat-monitoring',
        label: '채팅 CS 모니터링',
        icon: <MessagesSquare className={iconClass} />,
        tag: PENDING_TAG,
      },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // /login 계열(로그인 화면 + /login/complete 서버 콜백 복귀)은 nav에 속하지 않는 별도 라우트라
  // SideNav 없이 단독 렌더링한다. 셸 안의 usePendingApplicationCount가 로그인 전에 심사 조회를
  // 발사해 401/403을 만들지 않도록, 훅보다 **먼저** 돌려보낸다(조건을 훅 아래로 내리면 안 된다).
  // 로그인 플로우 밖에서 SideNav-less 라우트가 또 생기면 조건을 더하지 말고 pathless layout으로
  // 전환할 것(web-seller AppShell과 같은 지시).
  if (pathname === '/login' || pathname === '/login/' || pathname.startsWith('/login/')) {
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

export const Route = createRootRoute({
  component: AdminShell,
})
