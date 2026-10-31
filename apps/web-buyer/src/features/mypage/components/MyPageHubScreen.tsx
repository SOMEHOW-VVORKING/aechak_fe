import { useEffect, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  Ban,
  ChevronRight,
  Coins,
  Heart,
  MapPin,
  MessageSquare,
  PawPrint,
  ReceiptText,
  Settings,
  ShieldCheck,
  Star,
  Users,
  UserX,
} from 'lucide-react'
import { Avatar, Card, EmptyState, ListItem, Skeleton, StatusPill } from '@aechak/design-system/web'
import { MarketAppBar } from '@/shared/components/MarketAppBar'
import { useMe } from '@/shared/account'
import { usePointBalance } from '@/shared/points'
import { formatKRW } from '@/shared/formatKRW'
import { MYPAGE_MENU_GROUPS } from '../mypage.mock'

// 마이페이지 허브(b10-st-1). _tabs 레이아웃의 MobileScreen 안(스크롤 영역)에 렌더되므로 여기서
// 다시 MobileScreen으로 감싸지 않는다(홈 탭과 동일). 프로필 요약 + 메뉴 리스트 → 각 화면 실제 이동.
export function MyPageHubScreen() {
  const navigate = useNavigate()
  const { account, isLoading, isError, refetch } = useMe()
  const verified = account?.verification === 'verified'

  // GET /users/me는 PENDING도 200(화이트리스트)이라 허브가 온보딩 미완료 유저를 여기서 잡는다.
  // 빈 닉네임·빈 이메일의 퇴화된 프로필 카드를 보여주지 않고 온보딩 약관 화면으로 보낸다.
  const isPendingOnboarding = account?.isPendingOnboarding === true
  useEffect(() => {
    if (isPendingOnboarding) navigate({ to: '/onboarding/terms', replace: true })
  }, [isPendingOnboarding, navigate])

  // 적립금 잔액(서버 소유). 내역 화면이 없어 클릭 불가 표시 행으로만 노출한다. 로딩·조회 실패 시
  // 금액만 '—'로 두고(허브 전체를 막지 않는다), 성공하면 0원도 정상 표시한다.
  const { balance: pointBalance, isLoading: pointsLoading, isError: pointsError } = usePointBalance()
  const pointsDisplay = pointsLoading || pointsError ? '—' : formatKRW(pointBalance ?? 0)

  // 메뉴 key → 아이콘/이동. mock은 순수 데이터라 여기서 매핑한다.
  const icons: Record<string, ReactNode> = {
    orders: <ReceiptText className="size-[22px]" />,
    wishlist: <Heart className="size-[22px]" />,
    reviews: <Star className="size-[22px]" />,
    'product-inquiries': <MessageSquare className="size-[22px]" />,
    addresses: <MapPin className="size-[22px]" />,
    'sns-profile': <Users className="size-[22px]" />,
    'sns-relations': <Ban className="size-[22px]" />,
    pets: <PawPrint className="size-[22px]" />,
    verify: <ShieldCheck className="size-[22px]" />,
    settings: <Settings className="size-[22px]" />,
    withdraw: <UserX className="size-[22px]" />,
  }
  const go: Record<string, () => void> = {
    orders: () => navigate({ to: '/orders' }),
    wishlist: () => navigate({ to: '/wishlist' }),
    reviews: () => navigate({ to: '/reviews/mine' }),
    'product-inquiries': () => navigate({ to: '/mypage/product-inquiries' }),
    addresses: () => navigate({ to: '/addresses' }),
    'sns-profile': () => navigate({ to: '/sns/me' }),
    'sns-relations': () => navigate({ to: '/mypage/sns-relations' }),
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
      <MarketAppBar
        title="마이"
        actions={
          <button
            type="button"
            onClick={() => navigate({ to: '/settings' })}
            aria-label="설정"
            className="rounded-full p-0.5 text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <Settings className="size-[22px]" />
          </button>
        }
      />

      <div className="flex flex-col gap-3 p-4">
        {/* 프로필 요약 → 프로필 수정. 데이터는 GET /users/me. 로딩은 스켈레톤, 실패는 재시도 EmptyState.
            PENDING이면 위 effect가 온보딩으로 보내므로 그 사이 퇴화된 카드 대신 스켈레톤만 보여준다. */}
        {isLoading || isPendingOnboarding ? (
          <Skeleton className="h-[88px]" />
        ) : isError || !account ? (
          <Card className="p-4">
            <EmptyState
              title="프로필을 불러오지 못했어요"
              description="잠시 후 다시 시도해주세요."
              action={{ label: '다시 시도', onClick: () => void refetch() }}
            />
          </Card>
        ) : (
          <Card onClick={() => navigate({ to: '/mypage/profile' })} className="flex items-center gap-3.5 p-4">
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
          </Card>
        )}

        {/* 적립금 — 내역 화면이 없어 이동 없는 표시 전용 행(onClick 없이 ListItem이 비인터랙티브
            div로 렌더). 금액은 서버 잔액이며 로딩·실패 시 '—'. 메뉴 그룹과 같은 카드 스타일. */}
        <Card className="overflow-hidden">
          <ListItem
            leading={<Coins className="size-[22px]" />}
            title="적립금"
            trailing={
              <span className="text-body-sm font-semibold text-text-primary">{pointsDisplay}</span>
            }
            className="px-4"
          />
        </Card>

        {/* 메뉴 그룹 — hover 배경이 행 전체 폭을 덮도록 px-4를 컨테이너가 아니라 ListItem에 준다
            (컨테이너 px-4면 hover가 좌우 16px 안쪽만 칠해짐). 구분선만 mx-4로 안쪽에 유지. */}
        {MYPAGE_MENU_GROUPS.map((group, gi) => (
          <Card key={gi} className="overflow-hidden">
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
          </Card>
        ))}
      </div>
    </div>
  )
}
