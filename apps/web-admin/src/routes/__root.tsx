import { useMemo } from 'react'
import { createRootRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { SideNav } from '@aechak/design-system/web'
import type { NavGroup } from '@aechak/design-system/web'
import { ClipboardCheck, LayoutDashboard, ShieldCheck, UserCog } from 'lucide-react'
import { usePendingApplicationCount } from '@/features/seller-applications'

const iconClass = 'size-full'

const APPLICATIONS_NAV_KEY = '/sellers/applications'

// nav에는 admin 모듈에 API가 있는 화면(입점 심사)과 홈만 둔다. 셀러 관리/회원 관리/상품 검수/AI 검수 큐는
// 목업 배열뿐이라 라우트는 보존하되 진입점을 빼고(각 라우트가 "준비 중" 안내), 라우트 파일이 없던
// 14개 항목과 상수 배지(7·12·9·15·6·3·2)는 죽은 nav·장식 UI라 함께 뺐다. BE가 생기면 항목을 되돌린다.
const navGroups: NavGroup[] = [
  {
    key: 'operations',
    label: '운영',
    items: [
      { key: '/', label: '홈', icon: <LayoutDashboard className={iconClass} /> },
      {
        // 배지 숫자는 아래 AdminShell이 서버 심사 대기 수로 채운다 — 상수 배지는 AGENTS.md가
        // 금지한 장식 UI이고, 심사 화면이 같은 수를 실데이터로 띄우는 지금은 서로 모순된다.
        key: APPLICATIONS_NAV_KEY,
        label: '셀러 입점 심사',
        icon: <ClipboardCheck className={iconClass} />,
      },
      // 관리자 명부는 admin 모듈에 EP 3종(GET·POST·DELETE /admin/admins)이 있어 nav에 올린다.
      { key: '/admins', label: '관리자 관리', icon: <UserCog className={iconClass} /> },
    ],
  },
]

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
