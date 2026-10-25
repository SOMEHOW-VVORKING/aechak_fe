import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav, type NavGroup } from '@aechak/design-system/web'
import { Package, RotateCcw, Store } from 'lucide-react'
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport'

const iconClass = 'size-full'

// nav에는 seller 모듈에 API가 있는 화면만 둔다(상품 관리·취소/반품/교환·스토어 설정). 대시보드/주문/
// 배송 정책/정산은 목업이라 라우트는 보존하되 진입점을 빼고(각 라우트가 "준비 중" 안내), 라우트 파일이
// 없는 항목(문의/리뷰/쿠폰/공지/계정)은 404로 가는 죽은 nav라 함께 뺐다. BE가 생기면 항목을 되돌린다.
const groups: NavGroup[] = [
  {
    key: '판매 설정',
    label: '판매 설정',
    items: [
      { key: '/products', label: '상품 관리', icon: <Package className={iconClass} /> },
      // 클레임 8경로(목록·상세·메모·승인·거부·회수 송장·회수 완료·재발송)가 seller 모듈에 들어와
      // 진입점을 되돌렸다(SCRUM-295).
      { key: '/claims', label: '취소/반품/교환', icon: <RotateCcw className={iconClass} /> },
    ],
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
