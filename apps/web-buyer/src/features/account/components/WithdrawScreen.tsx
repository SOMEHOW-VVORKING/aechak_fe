import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import {
  Alert,
  Button,
  EmptyState,
  MobileScreen,
  Modal,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useOrders } from '@/shared/order'
import { useSafeBack } from '@/shared/useSafeBack'
import { useWithdraw } from '../account.queries'
import {
  WITHDRAW_DELETED_INFO,
  WITHDRAW_RETAINED_INFO,
  WITHDRAW_RETENTION_YEARS,
  blockingBreakdown,
  isWithdrawBlocked,
} from '../account.mock'

// 회원 탈퇴(b10-st-5). 진행 중 거래가 있으면 차단(5-A), 없으면 안내 후 확인 Modal(5-C/5-D).
export function WithdrawScreen() {
  const navigate = useNavigate()
  const orders = useOrders()
  const withdraw = useWithdraw()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)

  const blocked = isWithdrawBlocked(orders)
  const breakdown = blockingBreakdown(orders)

  const goBack = useSafeBack({ to: '/mypage' })

  const handleConfirm = () => {
    withdraw.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false)
        setWithdrawn(true)
      },
    })
  }

  // ── 탈퇴 완료(종결) ──
  if (withdrawn) {
    return (
      <MobileScreen>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={<UserX className="size-8" />}
            title="탈퇴가 완료됐어요"
            description="그동안 애착을 이용해 주셔서 고마워요. 거래 기록은 관련 법령에 따라 보관돼요."
            action={{ label: '홈으로', onClick: () => navigate({ to: '/' }) }}
          />
        </div>
      </MobileScreen>
    )
  }

  // ── 5-A 탈퇴 제한 ──
  if (blocked) {
    return (
      <MobileScreen
        header={<BackAppBar onBack={goBack} title="회원 탈퇴" />}
        footer={
          <BottomBar>
            <Button variant="danger" size="lg" fullWidth disabled>
              탈퇴하기
            </Button>
          </BottomBar>
        }
      >
        <div className="flex flex-col gap-3.5 p-4">
          <Alert variant="warning" title="지금은 탈퇴할 수 없어요">
            진행 중인 거래를 마치면 탈퇴할 수 있어요.
          </Alert>

          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            {breakdown.map((row, i) => (
              <div key={row.label}>
                {i > 0 && <div className="my-1 border-t border-border-subtle" />}
                <div className="flex min-h-[44px] items-center justify-between">
                  <span className="text-body-sm text-text-primary">{row.label}</span>
                  <span className="flex items-center gap-2.5">
                    <span className="tabular-nums text-body-sm text-text-secondary">{row.count}건</span>
                    <button
                      type="button"
                      onClick={() => navigate({ to: '/orders' })}
                      className="text-caption text-text-link"
                    >
                      주문 보기
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MobileScreen>
    )
  }

  // ── 5-C 탈퇴 가능 ──
  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="회원 탈퇴" />}
      footer={
        <BottomBar>
          <Button variant="danger" size="lg" fullWidth onClick={() => setConfirmOpen(true)}>
            탈퇴하기
          </Button>
        </BottomBar>
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        <h1 className="text-subheading font-semibold text-text-primary">탈퇴하기 전에 확인해 주세요</h1>

        {/* 삭제/비활성화 정보 */}
        <div className="flex flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-raised p-4">
          <p className="text-label font-medium text-text-secondary">삭제 / 비활성화되는 정보</p>
          {WITHDRAW_DELETED_INFO.map(info => (
            <div key={info.label} className="flex items-center justify-between">
              <span className="text-body-sm text-text-primary">{info.label}</span>
              {info.note === '비활성화' ? (
                <StatusPill variant="muted" size="sm">
                  {info.note}
                </StatusPill>
              ) : (
                <span className="text-body-sm text-text-tertiary">{info.note}</span>
              )}
            </div>
          ))}
        </div>

        {/* 법령 보존 정보 */}
        <div className="flex flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-raised p-4">
          <p className="text-label font-medium text-text-secondary">법령에 따라 보존되는 정보</p>
          {WITHDRAW_RETAINED_INFO.map(info => (
            <div key={info.label} className="flex items-center justify-between">
              <span className="text-body-sm text-text-primary">{info.label}</span>
              <StatusPill variant="muted" size="sm">
                {info.note}
              </StatusPill>
            </div>
          ))}
          <p className="text-caption text-text-tertiary">
            관련 법령에 따라 {WITHDRAW_RETENTION_YEARS}년간 보관 후 파기돼요.
          </p>
        </div>
      </div>

      {/* 최종 확인 Modal(5-D) */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="정말 탈퇴하시겠어요?"
        description="탈퇴 후에는 되돌릴 수 없어요. 거래 기록은 관련 법령에 따라 5년간 보관돼요."
        confirmLabel="탈퇴하기"
        confirmVariant="danger"
        loading={withdraw.isPending}
        onConfirm={handleConfirm}
      />
    </MobileScreen>
  )
}

// 하단 고정 바(BottomFixedAction은 primary 변형만 지원해 danger 버튼을 직접 배치하려고 별도 래퍼를 둔다).
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-sticky flex flex-none flex-col border-t border-border-subtle bg-surface-raised px-4 pt-3"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}
