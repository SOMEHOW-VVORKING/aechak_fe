import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav, type NavGroup } from '@aechak/design-system/web'
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  RotateCcw,
  Store,
  Truck,
  Wallet,
} from 'lucide-react'
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport'

const iconClass = 'size-full'

// nav는 2026-10-18 게이트(SCRUM-238) 이전 정본 4그룹 구성으로 돌려놓은 것이다 — 그때 화면 코드는
// 하나도 지워지지 않았고 진입점만 빠졌다. 그 사이 seller 모듈에 다섯 화면의 API가 모두 올라와
// (주문 SCRUM-291 · 클레임 SCRUM-295 · 배송 정책·정산 SCRUM-293 · 대시보드 SCRUM-292) 항목을
// 되돌렸다. 각 화면의 라우트 게이트 상수는 `shared/serverAvailability.ts`에 남아 있다(서버가
// 내려가면 상수만 내려 진입점을 닫는다).
//
// 아직 올리지 않은 것은 라우트 파일 자체가 없는 다섯 항목이다 — 고객 문의·리뷰 관리·혜택/쿠폰/할인·
// 알림/공지·계정/보안. 지금 올리면 404로 가는 죽은 nav라, 라우트가 생기는 작업에서 함께 되돌린다.
const groups: NavGroup[] = [
  {
    key: '운영',
    label: '운영',
    items: [
      { key: '/', label: '대시보드', icon: <LayoutDashboard className={iconClass} /> },
      { key: '/orders', label: '주문/배송 관리', icon: <ClipboardList className={iconClass} /> },
      { key: '/claims', label: '취소/반품/교환', icon: <RotateCcw className={iconClass} /> },
    ],
  },
  {
    key: '판매 설정',
    label: '판매 설정',
    items: [
      { key: '/products', label: '상품 관리', icon: <Package className={iconClass} /> },
      { key: '/shipping-policy', label: '배송 정책', icon: <Truck className={iconClass} /> },
    ],
  },
  {
    key: '정산',
    label: '정산',
    items: [{ key: '/settlements', label: '정산/매출', icon: <Wallet className={iconClass} /> }],
  },
  {
    key: '스토어',
    label: '스토어',
    items: [
      { key: '/store-settings', label: '스토어 설정', icon: <Store className={iconClass} /> },
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
