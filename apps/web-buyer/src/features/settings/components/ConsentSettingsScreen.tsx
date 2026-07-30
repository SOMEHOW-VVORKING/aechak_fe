import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { MobileScreen, Toggle } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { MARKETING_CONSENT_DEFAULT, REQUIRED_CONSENTS } from '../settings.mock'
import { SettingsControlRow, SettingsGroup } from './SettingsSection'

// 약관 및 개인정보 처리 동의 관리(b11-st-3). 필수 동의(조회만, 철회 불가 → 정책 문서로 연결) +
// 선택 동의(마케팅 수신, 토글로 철회/재동의 → 설명·토스트가 현재 상태를 그대로 반영).
export function ConsentSettingsScreen() {
  const navigate = useNavigate()
  const router = useRouter()

  const [marketingOn, setMarketingOn] = useState(MARKETING_CONSENT_DEFAULT.agreed)
  // 토스트는 마지막 동작(동의/철회)을 기억해 문구/아이콘을 그에 맞게 보여준다.
  const [toast, setToast] = useState<{ open: boolean; agreed: boolean }>({
    open: false,
    agreed: false,
  })

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/settings' })
  }

  const handleMarketingChange = (next: boolean) => {
    setMarketingOn(next)
    setToast({ open: true, agreed: next })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="동의 관리" />}>
      <div className="flex flex-col gap-5 p-4">
        <SettingsGroup
          label="필수 동의 항목"
          footnote="필수 항목은 서비스 이용에 반드시 필요해 철회할 수 없어요. 내용은 각 항목에서 확인할 수 있어요."
        >
          {REQUIRED_CONSENTS.map(consent => {
            const route = consent.route
            const rowBase =
              'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle'
            const body = (
              <>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body text-text-primary">{consent.label}</span>
                  <span className="text-caption text-text-tertiary">{consent.agreedAt} 동의</span>
                </div>
                {route && <ChevronRight className="size-[18px] flex-none text-icon-muted" />}
              </>
            )
            // 문서 라우트가 있는 항목만 그 문서로 이동한다 — 없는 항목을 다른 문서로 보내면
            // 잘못된 문서를 여는 오내비게이션이 된다(codex/리뷰 지적).
            return route ? (
              <button
                key={consent.id}
                type="button"
                onClick={() => navigate({ to: route })}
                className={`${rowBase} transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring`}
              >
                {body}
              </button>
            ) : (
              <div key={consent.id} className={rowBase}>
                {body}
              </div>
            )
          })}
        </SettingsGroup>

        <SettingsGroup
          label="선택 동의 항목"
          footnote="선택 항목은 동의하지 않아도 서비스를 이용할 수 있어요."
        >
          <SettingsControlRow
            title="마케팅 정보 수신 동의"
            description={
              marketingOn
                ? `혜택/이벤트/신상품 소식을 알림/이메일로 받아요. ${MARKETING_CONSENT_DEFAULT.agreedAt} 동의`
                : '수신 동의를 철회해 마케팅 알림/이메일을 받지 않아요. 다시 켜면 혜택 소식을 받을 수 있어요.'
            }
            control={
              <Toggle checked={marketingOn} onChange={handleMarketingChange} ariaLabel="마케팅 정보 수신 동의" />
            }
          />
        </SettingsGroup>
      </div>

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.agreed ? '마케팅 수신 동의를 켰어요.' : '마케팅 수신 동의를 철회했어요.'}
        variant={toast.agreed ? 'success' : 'info'}
      />
    </MobileScreen>
  )
}
