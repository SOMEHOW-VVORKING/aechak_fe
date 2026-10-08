import type { ReactNode } from 'react'
// NOTE: 알림(Bell) 버튼을 숨기면서 Bell import도 함께 주석 처리(되살릴 때 같이 복원).
import { /* Bell, */ Search, ShoppingCart } from 'lucide-react'

interface MarketAppBarProps {
  /** 좌측 타이틀 — 홈은 브랜드마크, 나머지는 화면명. */
  title: ReactNode
  /** 검색 아이콘 탭 시(보통 /search로 이동). 주면 버튼, 없으면 렌더 안 함. */
  onSearch?: () => void
  /** 장바구니 아이콘 탭 시(보통 /cart로 이동). 주면 버튼, 없으면 비인터랙티브 아이콘. */
  onCart?: () => void
  /** 장바구니 배지 수(있으면 표시). */
  cartCount?: number
  /** 알림 미확인 dot 표시 여부. 현재 알림 버튼은 화면에서 숨김 처리되어 미사용(prop은 되살릴 때를 위해 유지). */
  hasNotification?: boolean
  /** 우측 액션을 통째로 바꿀 때(마이 탭의 설정 버튼). 주면 검색/장바구니 아이콘 대신 그린다. */
  actions?: ReactNode
}

// 구매자 탭 화면(홈/마켓/마이) 상단 앱바. 탭 셸의 스크롤 영역 안에 렌더되므로 sticky로 상단에 고정한다.
// 검색·장바구니는 핸들러(onSearch/onCart)를 주면 실제 버튼으로 동작한다(라우팅은 호출부가 담당 —
// SideNav/TabBar와 동일 관례). 알림은 이번 단계 범위 밖(알림 화면 미구현)이라 죽은 버튼을 만들지 않으려고 span으로만 둔다.
// 알림(Bell) 버튼은 캡틴 지시로 화면에서 숨김(아래 렌더 블록 주석 처리). `hasNotification`은
// 되살릴 때를 위해 인터페이스에만 남겨두고 지금은 구조분해하지 않는다.
export function MarketAppBar({ title, onSearch, onCart, cartCount, actions }: MarketAppBarProps) {
  const cartInner = (
    <>
      <ShoppingCart className="size-[22px]" />
      {cartCount != null && cartCount > 0 && (
        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-surface-base bg-brand px-1 text-[10px] font-bold text-brand-on">
          {cartCount}
        </span>
      )}
    </>
  )

  return (
    <div className="sticky top-0 z-10 bg-surface-base">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="text-heading font-bold tracking-tight text-text-primary">{title}</div>
        {actions ?? (
          <div className="flex items-center gap-3.5 text-icon">
            {onSearch && (
              <button
                type="button"
                onClick={onSearch}
                aria-label="검색"
                className="rounded-full p-0.5 focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                <Search className="size-[22px]" />
              </button>
            )}
            {onCart ? (
              <button
                type="button"
                onClick={onCart}
                aria-label={cartCount != null && cartCount > 0 ? `장바구니 (${cartCount})` : '장바구니'}
                className="relative inline-flex rounded-full p-0.5 focus-visible:outline-none focus-visible:shadow-focus-ring"
              >
                {cartInner}
              </button>
            ) : (
              <span className="relative inline-flex" aria-hidden="true">
                {cartInner}
              </span>
            )}
            {/* 알림(Bell) 버튼은 캡틴 지시로 화면에서 숨김(삭제 아님 — 나중에 되살리기 쉽게 주석 처리).
                되살릴 때 상단 Bell import와 hasNotification 구조분해도 함께 복원.
            <span className="relative inline-flex" aria-hidden="true">
              <Bell className="size-[22px]" />
              {hasNotification && (
                <span className="absolute -right-0.5 -top-0.5 size-[7px] rounded-full border-[1.5px] border-surface-base bg-accent" />
              )}
            </span>
            */}
          </div>
        )}
      </div>
    </div>
  )
}
