import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav, type NavGroup } from '@aechak/design-system/web'
import {
  LayoutDashboard,
  ClipboardList,
  RotateCcw,
  MessageCircle,
  Star,
  Package,
  Truck,
  Tag,
  Wallet,
  Store,
  Megaphone,
  UserCog,
} from 'lucide-react'

const iconClass = 'size-full'

const groups: NavGroup[] = [
  {
    key: '운영',
    label: '운영',
    items: [
      { key: '/', label: '대시보드', icon: <LayoutDashboard className={iconClass} /> },
      { key: '/orders', label: '주문/배송 관리', icon: <ClipboardList className={iconClass} /> },
      { key: '/claims', label: '취소/반품/교환', icon: <RotateCcw className={iconClass} /> },
      { key: '/inquiries', label: '고객 문의', icon: <MessageCircle className={iconClass} /> },
      { key: '/reviews', label: '리뷰 관리', icon: <Star className={iconClass} /> },
    ],
  },
  {
    key: '판매 설정',
    label: '판매 설정',
    items: [
      { key: '/products', label: '상품 관리', icon: <Package className={iconClass} /> },
      { key: '/shipping-policy', label: '배송 정책', icon: <Truck className={iconClass} /> },
      { key: '/coupons', label: '혜택/쿠폰/할인', icon: <Tag className={iconClass} /> },
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
      { key: '/notices', label: '알림/공지', icon: <Megaphone className={iconClass} /> },
      { key: '/account', label: '계정/보안', icon: <UserCog className={iconClass} /> },
    ],
  },
]

export function AppShell() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: state => state.location.pathname })

  return (
    <div className="flex h-screen w-full bg-surface-base">
      <SideNav
        groups={groups}
        activeKey={pathname}
        onSelect={key => navigate({ to: key })}
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
