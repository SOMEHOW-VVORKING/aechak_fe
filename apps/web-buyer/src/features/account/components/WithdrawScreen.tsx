import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  MobileScreen,
  Modal,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { ActionBarFrame } from '@/shared/components/ActionBarFrame'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  WITHDRAWAL_CHECK_QUERY_KEY,
  isWithdrawalBlockedError,
  useWithdraw,
  useWithdrawalCheck,
  withdrawErrorMessage,
} from '../account.queries'
import {
  WITHDRAW_DELETED_INFO,
  WITHDRAW_REJOIN_NOTICE,
  WITHDRAW_RETAINED_INFO,
  WITHDRAW_RETENTION_YEARS,
} from '../account.mock'

// 회원 탈퇴(b10-st-5). 서버 판정(withdrawable)이 false면 제한 안내(5-A), true면 안내 후 확인 Modal(5-C/5-D).
// 완료 화면은 안내 화면과 분리해 둔다. 탈퇴 직후 쿼리 캐시를 비우므로 check 쿼리가 마운트된 채로 남으면
// 토큰 없이 재조회해 401 → 로그인 이동으로 새기 때문이다.
export function WithdrawScreen() {
  const [withdrawn, setWithdrawn] = useState(false)
  return withdrawn ? <WithdrawDone /> : <WithdrawGuide onWithdrawn={() => setWithdrawn(true)} />
}

// ── 탈퇴 완료(종결) ── 되돌릴 화면이 아니라 header(← 버튼)를 두지 않는다.
function WithdrawDone() {
  const navigate = useNavigate()
  return (
    <MobileScreen>
      <ScreenEmptyState
        icon={<UserX className="size-8" />}
        title="탈퇴가 완료됐어요"
        description="그동안 애착을 이용해 주셔서 고마워요. 거래 기록은 관련 법령에 따라 보관돼요."
        action={{ label: '홈으로', onClick: () => navigate({ to: '/', replace: true }) }}
      />
    </MobileScreen>
  )
}

function WithdrawGuide({ onWithdrawn }: { onWithdrawn: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const check = useWithdrawalCheck()
  const withdraw = useWithdraw()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const goBack = useSafeBack({ to: '/mypage' })
  const header = <BackAppBar onBack={goBack} title="회원 탈퇴" />

  const handleConfirm = () => {
    setWithdrawError(null)
    withdraw.mutate(undefined, {
      // 세션 정리는 useWithdraw가 한다(화면을 떠나도 실행). 여기서는 완료 화면 전환만.
      onSuccess: onWithdrawn,
      onError: error => {
        // 그 사이 거래가 생겨 막혔으면 판정을 다시 받아 제한 안내(5-A)로 바꾼다.
        if (isWithdrawalBlockedError(error)) {
          setConfirmOpen(false)
          void queryClient.invalidateQueries({ queryKey: WITHDRAWAL_CHECK_QUERY_KEY })
          return
        }
        setWithdrawError(withdrawErrorMessage(error))
      },
    })
  }

  if (check.isPending) {
    return (
      <MobileScreen header={header}>
        <div className="flex flex-col gap-3.5 p-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      </MobileScreen>
    )
  }

  // 비인증 실패(네트워크/500/403 등)만 여기로 온다. 401은 전역 인터셉터가 로그인으로 보낸다.
  if (check.isError) {
    return (
      <MobileScreen header={header}>
        <ScreenEmptyState
          title="탈퇴 가능 여부를 확인하지 못했어요"
          description={withdrawErrorMessage(check.error, '잠시 후 다시 시도해 주세요.')}
        />
      </MobileScreen>
    )
  }

  // ── 5-A 탈퇴 제한 ──
  if (!check.data.withdrawable) {
    return (
      <MobileScreen
        header={header}
        footer={
          <ActionBarFrame>
            <Button variant="danger" size="lg" fullWidth disabled>
              탈퇴하기
            </Button>
          </ActionBarFrame>
        }
      >
        <div className="flex flex-col gap-3.5 p-4">
          <Alert variant="warning" title="지금은 탈퇴할 수 없어요">
            정리되지 않은 거래가 있어요. 진행 중인 주문을 마치면 탈퇴할 수 있어요.
          </Alert>
          <Button variant="secondary" size="md" fullWidth onClick={() => navigate({ to: '/orders' })}>
            주문 내역 보기
          </Button>
        </div>
      </MobileScreen>
    )
  }

  // ── 5-C 탈퇴 가능 ──
  return (
    <MobileScreen
      header={header}
      footer={
        <ActionBarFrame>
          <Button variant="danger" size="lg" fullWidth onClick={() => setConfirmOpen(true)}>
            탈퇴하기
          </Button>
        </ActionBarFrame>
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        <h1 className="text-subheading font-semibold text-text-primary">탈퇴하기 전에 확인해 주세요</h1>

        <InfoCard title="삭제 / 비활성화되는 정보">
          {WITHDRAW_DELETED_INFO.map(info => (
            <InfoRow
              key={info.label}
              label={info.label}
              value={
                info.note === '비활성화' ? (
                  <StatusPill variant="muted" size="sm">
                    {info.note}
                  </StatusPill>
                ) : (
                  <span className="text-body-sm text-text-tertiary">{info.note}</span>
                )
              }
            />
          ))}
        </InfoCard>

        <InfoCard title="법령에 따라 보존되는 정보">
          {WITHDRAW_RETAINED_INFO.map(info => (
            <InfoRow
              key={info.label}
              label={info.label}
              value={
                <StatusPill variant="muted" size="sm">
                  {info.note}
                </StatusPill>
              }
            />
          ))}
          <p className="text-caption text-text-tertiary">
            관련 법령에 따라 {WITHDRAW_RETENTION_YEARS}년간 보관 후 파기돼요.
          </p>
        </InfoCard>

        <InfoCard title="다시 가입할 때">
          <p className="text-body-sm text-text-primary">{WITHDRAW_REJOIN_NOTICE}</p>
        </InfoCard>
      </div>

      {/* 최종 확인 Modal(5-D) — 확인 시에만 DELETE */}
      <Modal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false)
          setWithdrawError(null)
        }}
        title="정말 탈퇴하시겠어요?"
        description={`탈퇴 후에는 되돌릴 수 없어요. ${WITHDRAW_REJOIN_NOTICE} 거래 기록은 관련 법령에 따라 ${WITHDRAW_RETENTION_YEARS}년간 보관돼요.`}
        confirmLabel="탈퇴하기"
        confirmVariant="danger"
        loading={withdraw.isPending}
        onConfirm={handleConfirm}
      >
        {withdrawError && <Alert variant="error">{withdrawError}</Alert>}
      </Modal>
    </MobileScreen>
  )
}

// 탈퇴 안내 정보 카드(소제목 + 행들).
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <p className="text-label font-medium text-text-secondary">{title}</p>
      {children}
    </Card>
  )
}

// 라벨 + 우측 값(pill/텍스트) 한 행.
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-text-primary">{label}</span>
      {value}
    </div>
  )
}
