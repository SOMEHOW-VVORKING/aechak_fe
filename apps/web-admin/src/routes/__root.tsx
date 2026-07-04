import { createRootRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav } from '@aechak/design-system/web'
import type { NavGroup } from '@aechak/design-system/web'
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Flag,
  FolderTree,
  Image,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessagesSquare,
  PackageSearch,
  RotateCcw,
  ScanEye,
  Shield,
  ShieldCheck,
  ScrollText,
  Star,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

const iconClass = 'size-full'

// Route paths mirror the Batch 9 + 9-EXT mapping (route-remap-v2-q8w report).
// Only `/` exists today; the rest 404 until their Phase 2 routes land, which
// is expected — see AGENTS.md web-admin shell notes.
const navGroups: NavGroup[] = [
  {
    key: 'operations',
    label: '운영',
    items: [
      { key: '/', label: '대시보드', icon: <LayoutDashboard className={iconClass} /> },
      {
        key: '/sellers/applications',
        label: '셀러 입점 심사',
        icon: <ClipboardCheck className={iconClass} />,
        badge: 4,
      },
      { key: '/sellers', label: '셀러 관리', icon: <Store className={iconClass} /> },
      { key: '/members', label: '일반 회원 관리', icon: <Users className={iconClass} /> },
    ],
  },
  {
    key: 'review',
    label: '검수',
    items: [
      {
        key: '/products/review',
        label: '상품 검수 관리',
        icon: <PackageSearch className={iconClass} />,
        badge: 7,
      },
      {
        key: '/products/ai-queue',
        label: 'AI 검수 큐',
        icon: <ScanEye className={iconClass} />,
        badge: 12,
      },
    ],
  },
  {
    key: 'reports-inquiries',
    label: '신고 · 문의',
    items: [
      { key: '/reports', label: '신고 제재 관리', icon: <Flag className={iconClass} />, badge: 9 },
      {
        key: '/inquiries',
        label: '서비스 문의 관리',
        icon: <LifeBuoy className={iconClass} />,
        badge: 15,
      },
    ],
  },
  {
    key: 'orders-claims',
    label: '주문 · 클레임',
    items: [
      {
        key: '/orders/monitoring',
        label: '주문 배송 모니터링',
        icon: <Truck className={iconClass} />,
      },
      {
        key: '/claims',
        label: '취소/반품/교환',
        icon: <RotateCcw className={iconClass} />,
        badge: 6,
      },
      { key: '/reviews', label: '리뷰 관리', icon: <Star className={iconClass} />, badge: 3 },
      {
        key: '/chat-monitoring',
        label: '채팅 CS 모니터링',
        icon: <MessagesSquare className={iconClass} />,
        badge: 2,
      },
    ],
  },
  {
    key: 'ops-management',
    label: '운영 관리',
    items: [
      { key: '/notices', label: '알림/공지 관리', icon: <Megaphone className={iconClass} /> },
      {
        key: '/audit-log',
        label: '어드민 액션 로그',
        icon: <ScrollText className={iconClass} />,
      },
    ],
  },
  {
    key: 'extensions',
    label: '확장 예정',
    items: [
      { key: '/banners', label: '홈 배너 기획전 관리', icon: <Image className={iconClass} /> },
      {
        key: '/categories',
        label: '카테고리 관리',
        icon: <FolderTree className={iconClass} />,
      },
      { key: '/settlements', label: '정산 관리', icon: <Wallet className={iconClass} /> },
      {
        key: '/admin-accounts',
        label: '어드민 계정 권한 관리',
        icon: <Shield className={iconClass} />,
      },
      {
        key: '/statistics',
        label: '고급 통계 관리',
        icon: <BarChart3 className={iconClass} />,
      },
      {
        key: '/tax-reports',
        label: '세금 신고 자료 관리',
        icon: <FileText className={iconClass} />,
      },
    ],
  },
]

function AdminShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base">
      <SideNav
        groups={navGroups}
        activeKey={pathname}
        onSelect={key => navigate({ to: key })}
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
