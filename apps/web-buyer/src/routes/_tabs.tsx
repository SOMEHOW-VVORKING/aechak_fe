import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { MobileScreen, TabBar, type TabBarItem } from '@aechak/design-system/web'
import { Home, MessageCircle, Store, User, Users } from 'lucide-react'

export const Route = createFileRoute('/_tabs')({
  component: TabsLayout,
})

const iconClass = 'size-full'

const tabs: TabBarItem[] = [
  { key: '/', label: '홈', icon: <Home className={iconClass} /> },
  { key: '/market', label: '마켓', icon: <Store className={iconClass} /> },
  { key: '/sns', label: 'SNS', icon: <Users className={iconClass} /> },
  { key: '/chat', label: '채팅', icon: <MessageCircle className={iconClass} /> },
  { key: '/mypage', label: '마이', icon: <User className={iconClass} /> },
]

// Pathless layout route: wraps the 5 tab-root screens with the persistent
// bottom tab bar via `MobileScreen`'s `footer` slot. Onboarding routes live
// outside this layout (parented directly to `__root`) so they never render
// the tab bar.
function TabsLayout() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: state => state.location.pathname })

  return (
    <MobileScreen footer={<TabBar tabs={tabs} activeKey={pathname} onSelect={key => navigate({ to: key })} />}>
      <Outlet />
    </MobileScreen>
  )
}
