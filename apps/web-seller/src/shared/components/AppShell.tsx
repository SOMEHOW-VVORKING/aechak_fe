import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav, type NavGroup } from '@aechak/design-system/web'
import { Bell, MessageSquare, Package, ShieldCheck, Star, Store, Ticket } from 'lucide-react'
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport'

const iconClass = 'size-full'

// nav는 원래 메뉴 구성(4그룹)을 그대로 보여준다 — 메뉴를 숨기면 운영자는 기능이 사라진 줄 안다.
// 대신 BE 엔드포인트가 없는 항목에는 `badge: PENDING_BADGE`를 달아 한눈에 구별되게 하고, 눌러서
// 들어가면 각 라우트가 "준비 중" 안내만 보여준다(AGENTS.md 규약 10 — 숨기지 않고, 속이지도 않는다).
// 배지를 떼는 것은 그 경로에 seller BE가 생겼을 때뿐이다.
const PENDING_BADGE = '준비 중'

const groups: NavGroup[] = [
  {
    key: '운영',
    label: '운영',
    items: [
      {
        key: '/inquiries',
        label: '고객 문의',
        icon: <MessageSquare className={iconClass} />,
        badge: PENDING_BADGE,
      },
      {
        key: '/reviews',
        label: '리뷰 관리',
        icon: <Star className={iconClass} />,
        badge: PENDING_BADGE,
      },
    ],
  },
  {
    key: '판매 설정',
    label: '판매 설정',
    items: [
      { key: '/products', label: '상품 관리', icon: <Package className={iconClass} /> },
      {
        key: '/coupons',
        label: '혜택/쿠폰/할인',
        icon: <Ticket className={iconClass} />,
        badge: PENDING_BADGE,
      },
    ],
  },
  {
    key: '스토어',
    label: '스토어',
    items: [
      { key: '/store-settings', label: '스토어 설정', icon: <Store className={iconClass} /> },
      {
        key: '/notices',
        label: '알림/공지',
        icon: <Bell className={iconClass} />,
        badge: PENDING_BADGE,
      },
      {
        key: '/account',
        label: '계정/보안',
        icon: <ShieldCheck className={iconClass} />,
        badge: PENDING_BADGE,
      },
    ],
  },
]

export function AppShell() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: state => state.location.pathname })
  const isNarrow = useIsNarrowViewport()
  const [collapsed, setCollapsed] = useState(isNarrow)

  // 창 폭이 좁아지면(1024px 미만) 기본값을 접힘으로 바꾼다. 넓어졌을 때 자동으로
  // 다시 펴지는 않음 — 사용자가 좁은 화면에서 수동으로 편 상태를 유지하고 싶을 수
  // 있고, 토글 버튼으로 언제든 직접 제어 가능하므로 "좁아질 때만" 강제한다.
  useEffect(() => {
    if (isNarrow) setCollapsed(true)
  }, [isNarrow])

  // /login 계열(로그인 화면 + /login/complete 서버 콜백 복귀)은 nav에 속하지 않는 별도
  // 라우트라 SideNav 없이 단독 렌더링한다(mockup b5-st-13은 SideNav 없는 중앙 카드 레이아웃).
  // 로그인 플로우 밖에서 SideNav-less 라우트가 또 생기면 조건을 더하지 말고 pathless layout으로
  // 전환할 것(AGENTS.md 지시 — 지금은 둘 다 같은 로그인 플로우라 접두 판정 하나로 묶는다).
  if (pathname === '/login' || pathname === '/login/' || pathname.startsWith('/login/')) {
    return <Outlet />
  }

  return (
    <div className="flex h-screen w-full bg-surface-base">
      <SideNav
        groups={groups}
        // /products/new 같은 하위 화면에서도 상위 메뉴가 활성으로 보이게 첫 세그먼트로 맞춘다.
        activeKey={'/' + (pathname.split('/')[1] ?? '')}
        onSelect={key => navigate({ to: key })}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        header={
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-md bg-brand-subtle text-brand">
              <Store className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text-primary">
                애착 셀러 어드민
              </p>
              <p className="truncate text-caption text-text-tertiary">셀러 어드민</p>
            </div>
          </div>
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
