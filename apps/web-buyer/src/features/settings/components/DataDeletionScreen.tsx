import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button, DocumentHeader, MobileScreen, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { DATA_DELETION_IMMEDIATE, DATA_RETENTION_ROWS } from '../settings.mock'
import { DocParagraph, DocSection } from './DocLayout'

// 계정 및 데이터 삭제 안내(b11-st-7). 즉시 삭제·비활성 항목 + 보관 기간 안내 + 탈퇴 진입.
// "회원 탈퇴 진행" 버튼은 Phase 4의 실제 탈퇴 화면(b10-st-5, /mypage/withdraw)으로 이동한다
// (리베이스로 해당 라우트가 트리에 존재).
export function DataDeletionScreen() {
  const navigate = useNavigate()
  const router = useRouter()

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/settings' })
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="계정 및 데이터 삭제" />}
      footer={
        <div
          className="flex-none border-t border-border-subtle bg-surface-raised px-4 pt-3"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => navigate({ to: '/mypage/withdraw' })}
          >
            회원 탈퇴 진행
          </Button>
        </div>
      }
    >
      <DocumentHeader title="계정 및 데이터 삭제 안내" />
      <div className="flex flex-col gap-6 p-4">
        <DocSection title="즉시 삭제/비활성화">
          <ul className="flex flex-col gap-2.5">
            {DATA_DELETION_IMMEDIATE.map(item => (
              <li key={item} className="flex items-start gap-2.5 text-body-sm text-text-secondary">
                <span className="mt-1.5 size-1.5 flex-none rounded-full bg-icon-muted" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DocSection>

        <DocSection title="일정 기간 보관 후 파기">
          <DocParagraph>
            법령/운영 정책에 따라 아래 정보는 바로 삭제되지 않고 보관되며, 작성자는 익명 처리돼요.
          </DocParagraph>
          <div className="mt-1 flex flex-col rounded-card border border-border-subtle bg-surface-raised">
            {DATA_RETENTION_ROWS.map(row => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 px-4 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle"
              >
                <span className="text-body-sm text-text-primary">{row.label}</span>
                <StatusPill variant={row.variant} size="sm">
                  {row.period}
                </StatusPill>
              </div>
            ))}
          </div>
        </DocSection>
      </div>
    </MobileScreen>
  )
}
