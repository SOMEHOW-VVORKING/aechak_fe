import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronRight,
  Heart,
  MapPin,
  PawPrint,
  ReceiptText,
  Settings,
  ShieldCheck,
  Star,
  UserX,
} from 'lucide-react'
import { Avatar, ListItem, StatusPill } from '@aechak/design-system/web'
import { useAccount } from '@/shared/account'
import { MYPAGE_MENU_GROUPS } from '../mypage.mock'

// 마이페이지 허브(b10-st-1). _tabs 레이아웃의 MobileScreen 안(스크롤 영역)에 렌더되므로 여기서
// 다시 MobileScreen으로 감싸지 않는다(홈 탭과 동일). 프로필 요약 + 메뉴 리스트 → 각 화면 실제 이동.
export function MyPageHubScreen() {
  const navigate = useNavigate()
  const account = useAccount()
  const verified = account.verification === 'verified'

  // 메뉴 key → 아이콘/이동. mock은 순수 데이터라 여기서 매핑한다.
  const icons: Record<string, ReactNode> = {
    orders: <ReceiptText className="size-[22px]" />,
    wishlist: <Heart className="size-[22px]" />,
    reviews: <Star className="size-[22px]" />,
    addresses: <MapPin className="size-[22px]" />,
    pets: <PawPrint className="size-[22px]" />,
    verify: <ShieldCheck className="size-[22px]" />,
    settings: <Settings className="size-[22px]" />,
    withdraw: <UserX className="size-[22px]" />,
  }
  const go: Record<string, () => void> = {
    orders: () => navigate({ to: '/orders' }),
    wishlist: () => navigate({ to: '/wishlist' }),
    reviews: () => navigate({ to: '/reviews/mine' }),
    addresses: () => navigate({ to: '/addresses' }),
    pets: () => navigate({ to: '/mypage/pets' }),
    verify: () => navigate({ to: '/mypage/verify' }),
    settings: () => navigate({ to: '/settings' }),
    withdraw: () => navigate({ to: '/mypage/withdraw' }),
  }

  const trailingFor = (key: string): ReactNode => {
    const chevron = <ChevronRight className="size-[18px] text-icon-muted" />
    if (key === 'verify') {
      return (
        <>
          {verified ? (
            <StatusPill variant="success" size="sm">
              인증완료
            </StatusPill>
          ) : (
            <StatusPill variant="warning" size="sm">
              미인증
            </StatusPill>
          )}
          {chevron}
        </>
      )
    }
    return chevron
  }

  return (
    <div className="flex flex-col pb-6">
      <div className="sticky top-0 z-10 bg-surface-base">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-heading font-bold tracking-tight text-text-primary">마이</span>
          <button
            type="button"
            onClick={() => navigate({ to: '/settings' })}
            aria-label="설정"
            className="rounded-full p-0.5 text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <Settings className="size-[22px]" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* 프로필 요약 → 프로필 수정 */}
        <button
          type="button"
          onClick={() => navigate({ to: '/mypage/profile' })}
          className="flex items-center gap-3.5 rounded-card border border-border-subtle bg-surface-raised p-4 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
        >
          <Avatar name={account.nickname} src={account.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-subheading font-semibold text-text-primary">
                {account.nickname}
              </span>
              {/* 인증 완료 시 프로필 카드 배지는 '본인 인증' 메뉴 행과 중복이라 안 그린다.
                  미인증 배지는 인증 유도 역할이라 유지. */}
              {!verified && (
                <StatusPill variant="warning" size="sm">
                  <AlertCircle className="mr-0.5 inline size-3" />
                  미인증
                </StatusPill>
              )}
            </div>
            <p className="mt-0.5 truncate text-caption text-text-tertiary">{account.email}</p>
          </div>
          <ChevronRight className="size-5 flex-none text-icon-muted" />
        </button>

        {/* 메뉴 그룹 — hover 배경이 행 전체 폭을 덮도록 px-4를 컨테이너가 아니라 ListItem에 준다
            (컨테이너 px-4면 hover가 좌우 16px 안쪽만 칠해짐). 구분선만 mx-4로 안쪽에 유지. */}
        {MYPAGE_MENU_GROUPS.map((group, gi) => (
          <div
            key={gi}
            className="overflow-hidden rounded-card border border-border-subtle bg-surface-raised"
          >
            {group.items.map((item, i) => (
              <div key={item.key}>
                {i > 0 && <div className="mx-4 border-t border-border-subtle" />}
                <ListItem
                  leading={icons[item.key]}
                  title={item.label}
                  trailing={trailingFor(item.key)}
                  onClick={go[item.key]}
                  className="px-4"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
