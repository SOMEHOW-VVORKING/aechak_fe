import { useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { EmptyState, MobileScreen, Skeleton } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { HomeAction } from '@/shared/components/HomeAction'
import { useSafeBack } from '@/shared/useSafeBack'
import { useConsentTerms, type ConsentTerm } from '../settings.queries'
import { SettingsGroup } from './SettingsSection'

// 약관 및 개인정보 처리 동의 관리(b11-st-3). 서버 활성 약관(GET /terms)을 필수/선택으로 나눠 보여준다.
// 동의 변경(선택 항목 철회·재동의)은 BE가 온보딩 전용 제출만 받아 아직 열 수 없다 — 토글 없이 조회만.
export function ConsentSettingsScreen() {
  const navigate = useNavigate()
  const { requiredTerms, optionalTerms, isLoading, isError, refetch } = useConsentTerms()
  const goBack = useSafeBack({ to: '/settings' })

  const renderRow = (term: ConsentTerm) => {
    const route = term.route
    const rowBase =
      'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle'
    const body = (
      <>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body text-text-primary">{term.title}</span>
          <span className="text-caption text-text-tertiary">{term.meta}</span>
        </div>
        {route && <ChevronRight className="size-[18px] flex-none text-icon-muted" />}
      </>
    )
    return route ? (
      <button
        key={term.termId}
        type="button"
        onClick={() => navigate({ to: route })}
        className={`${rowBase} transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring`}
      >
        {body}
      </button>
    ) : (
      <div key={term.termId} className={rowBase}>
        {body}
      </div>
    )
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="동의 관리" actions={<HomeAction />} />}>
      <div className="flex flex-col gap-5 p-4">
        {isLoading ? (
          <div role="status" aria-label="약관을 불러오는 중" className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <EmptyState
            title="약관 정보를 불러오지 못했어요"
            description="잠시 후 다시 시도해 주세요"
            action={{ label: '다시 시도', onClick: () => void refetch() }}
          />
        ) : (
          <>
            <SettingsGroup
              label="필수 동의 항목"
              footnote="필수 항목은 서비스 이용에 반드시 필요해 철회할 수 없어요. 내용은 각 항목에서 확인할 수 있어요."
            >
              {requiredTerms.map(renderRow)}
            </SettingsGroup>

            {optionalTerms.length > 0 && (
              <SettingsGroup
                label="선택 동의 항목"
                footnote="선택 항목의 동의 변경은 준비 중이에요. 가입할 때 선택한 내용이 그대로 유지돼요."
              >
                {optionalTerms.map(renderRow)}
              </SettingsGroup>
            )}
          </>
        )}
      </div>
    </MobileScreen>
  )
}
