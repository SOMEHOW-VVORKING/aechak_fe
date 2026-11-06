import { useNavigate } from '@tanstack/react-router'
import { Home, MessageCircle, Store, User, Users } from 'lucide-react'
import { TabBar, type TabBarItem } from '@aechak/design-system/web'

const iconClass = 'size-full'

const tabs: TabBarItem[] = [
  { key: '/', label: '홈', icon: <Home className={iconClass} /> },
  { key: '/market', label: '마켓', icon: <Store className={iconClass} /> },
  { key: '/sns', label: 'SNS', icon: <Users className={iconClass} /> },
  { key: '/chat', label: '채팅', icon: <MessageCircle className={iconClass} /> },
  { key: '/mypage', label: '마이', icon: <User className={iconClass} /> },
]

// 하단 5탭 바. 탭 셸(_tabs)과 탭 밖에서 같은 바를 그리는 화면(SNS 프로필, SNS-01 F5)이 같이 쓴다.
// activeKey는 탭 key와 같은 경로다.
export function AppTabBar({ activeKey }: { activeKey: string }) {
  const navigate = useNavigate()
  return <TabBar tabs={tabs} activeKey={activeKey} onSelect={key => navigate({ to: key })} />
}
