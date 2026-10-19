import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, UserMinus, UserPlus } from 'lucide-react'
import { Alert, Button, DataTable, Input, Modal, StatusPill, Toast } from '@aechak/design-system/web'
import type { Column, StatusPillVariant } from '@aechak/design-system/web'
import {
  DEFAULT_PAGE_SIZE,
  RELOGIN_REQUIRED_NOTICE,
  USER_STATUS_LABEL,
  adminDisplayName,
  demoteErrorMessage,
  formatJoinedAt,
  needsRelogin,
  parseUserId,
  promoteErrorMessage,
  rosterErrorMessage,
  useAdminRoster,
  useDemoteAdmin,
  usePromoteAdmin,
  type AdminRosterSummary,
} from '@/features/admins'
import { PageIntro } from '@/shared/components/PageIntro'

export const Route = createFileRoute('/admins')({
  component: AdminRosterPage,
})

// `muted`는 비활성/휴면 전용이고 `danger`는 되돌리기 어려운 제재다(AGENTS 4절) — 정지는 제재라
// `danger`, 탈퇴·온보딩 전은 비활성이라 `muted`, 활성만 `success`다.
const STATUS_VARIANT: Record<keyof typeof USER_STATUS_LABEL, StatusPillVariant> = {
  PENDING_ONBOARDING: 'muted',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  WITHDRAWN: 'muted',
}

function AdminRosterPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const { rows, totalCount, isLoading, isError, error } = useAdminRoster(page)

  const [userIdInput, setUserIdInput] = useState('')
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const [demoteTarget, setDemoteTarget] = useState<AdminRosterSummary | null>(null)
  const [demoteError, setDemoteError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'info' } | null>(null)

  const promote = usePromoteAdmin()
  const demote = useDemoteAdmin()
  const isMutating = promote.isPending || demote.isPending

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))
  // 마지막 페이지의 유일한 관리자를 강등하면 재조회 결과에 그 페이지가 없어져 빈 목록에 갇힌다 —
  // 조회 중에는 totalCount가 0이라 페이지가 잘못 접히므로 응답이 온 뒤에만 보정한다.
  const lastPage = totalPages - 1
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage)
  }, [isLoading, isError, page, lastPage])
  // 2페이지 조회가 실패하면 totalCount가 0으로 떨어져 totalPages도 1이 된다 — 그때 `totalPages > 1`로만
  // 페이저를 그리면 되돌아올 '이전' 버튼까지 사라져 빈 화면에 갇힌다(오류 상태에서는 위 보정도 안 돈다).
  const showPager = totalPages > 1 || page > 0

  const parsedUserId = parseUserId(userIdInput)

  function submitPromote() {
    if (parsedUserId == null) return
    setPromoteError(null)
    promote.mutate(parsedUserId, {
      onSuccess: () => {
        setUserIdInput('')
        // 승격 직후에는 그 계정의 토큰에 권한이 없다 — 토스트에서도 재로그인을 다시 말한다.
        setToast({ message: '관리자로 승격했어요. 그 계정은 다시 로그인해야 권한이 반영돼요.', variant: 'success' })
      },
      onError: requestError => setPromoteError(promoteErrorMessage(requestError)),
    })
  }

  function submitDemote() {
    if (!demoteTarget) return
    setDemoteError(null)
    demote.mutate(demoteTarget.userId, {
      onSuccess: () => {
        setDemoteTarget(null)
        setToast({ message: '관리자 권한을 해제했어요.', variant: 'success' })
      },
      onError: requestError => {
        // 409/30013(마지막 관리자)·403/30014(자기 자신)은 "화면이 낡았다"가 아니라 규칙이다 —
        // Modal만 닫고 목록 위에 사유를 남긴다.
        setDemoteTarget(null)
        setDemoteError(demoteErrorMessage(requestError))
      },
    })
  }

  const columns: Column<AdminRosterSummary>[] = [
    {
      key: 'userId',
      label: 'ID',
      align: 'right',
      render: admin => <span className="tabular-nums">{admin.userId}</span>,
    },
    {
      key: 'nickname',
      label: '닉네임',
      render: admin => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{adminDisplayName(admin)}</span>
          {/* 자기 행 표시는 서버가 isSelf로 준다 — 자기 역할 변경은 서버가 403/30014로 막는다. */}
          {admin.isSelf && <StatusPill variant="info">나</StatusPill>}
        </span>
      ),
    },
    {
      key: 'status',
      label: '계정 상태',
      align: 'center',
      render: admin => (
        <StatusPill variant={STATUS_VARIANT[admin.status]}>{USER_STATUS_LABEL[admin.status]}</StatusPill>
      ),
    },
    {
      // 값이 users.created_at이므로 라벨도 '가입일'이다 — '승격일'로 적으면 가입 시각을 승격 시각으로
      // 위장한다(BE에 승격 시각 컬럼이 없다).
      key: 'joinedAt',
      label: '가입일',
      align: 'right',
      render: admin => <span className="tabular-nums">{formatJoinedAt(admin.joinedAt)}</span>,
    },
    {
      key: 'actions',
      label: '처리',
      render: admin => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<UserMinus className="size-3.5" />}
            aria-label={`${adminDisplayName(admin)} 관리자 권한 해제`}
            // 자기 자신은 서버가 403/30014로 막는다 — 누를 수 있게 둬서 실패를 보여 줄 이유가 없다.
            disabled={isMutating || admin.isSelf}
            onClick={() => setDemoteTarget(admin)}
          >
            권한 해제
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6">
      <PageIntro title="관리자 관리" description="관리자 명부를 확인하고 권한을 주거나 거둬요." />

      {/* 고정 문구 — 계약의 일부다(role은 로그인 시점 JWT 스냅샷). 성공 토스트와 별개로 늘 보인다.
          DS Alert가 variant별 아이콘을 자체 렌더하므로 앞에 lucide 아이콘을 또 넣지 않는다. */}
      <Alert variant="info" className="mb-3.5">
        {RELOGIN_REQUIRED_NOTICE}
      </Alert>

      <div className="mb-3.5 flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <div className="w-60">
            <Input
              label="승격할 사용자 ID"
              value={userIdInput}
              inputMode="numeric"
              placeholder="예: 45"
              onChange={event => {
                setUserIdInput(event.target.value)
                setPromoteError(null)
              }}
            />
          </div>
          <Button
            leftIcon={<UserPlus className="size-4" />}
            disabled={parsedUserId == null || isMutating}
            loading={promote.isPending}
            onClick={submitPromote}
          >
            관리자로 승격
          </Button>
        </div>
        <p className="text-caption text-text-tertiary">
          사용자 ID는 회원의 내부 숫자 id예요. 활성 상태인 계정만 승격할 수 있어요.
        </p>
      </div>

      {promoteError && (
        <Alert variant="error" className="mb-3.5">
          {promoteError}
        </Alert>
      )}
      {demoteError && (
        <Alert variant="warning" className="mb-3.5">
          {demoteError}
        </Alert>
      )}
      {/* 실 API 전환이 만든 실패 경로 — "데이터 없음"으로 접으면 권한 없음(403/20011)이 빈 명부로 보인다. */}
      {isError && (
        <Alert variant="error" className="mb-3.5">
          <span className="flex flex-col items-start gap-2">
            {rosterErrorMessage(error)}
            {/* 로그인 자체는 역할을 보지 않아 일반 회원도 여기까지 들어온다. 403은 세션 만료 전역
                이동을 깨우지 않으므로, 재로그인을 안내하면서 갈 수단을 함께 줘야 한다 —
                없으면 운영자가 주소를 직접 쳐야 복구된다. */}
            {needsRelogin(error) && (
              <Button variant="secondary" size="sm" onClick={() => void navigate({ to: '/login' })}>
                로그인 화면으로
              </Button>
            )}
          </span>
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={admin => String(admin.userId)}
        loading={isLoading}
        emptyLabel={isError ? '관리자 명부를 불러오지 못했어요.' : '등록된 관리자가 없어요.'}
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-body-sm text-text-tertiary">
        <span>
          관리자 <span className="font-semibold tabular-nums text-text-primary">{totalCount}</span>명
        </span>
        {showPager && (
          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronLeft className="size-4" />}
              disabled={page === 0}
              onClick={() => setPage(current => Math.max(0, current - 1))}
            >
              이전
            </Button>
            <span className="tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight className="size-4" />}
              disabled={page + 1 >= totalPages || isError}
              onClick={() => setPage(current => current + 1)}
            >
              다음
            </Button>
          </span>
        )}
      </div>

      {/* 확인 Modal은 타겟이 있을 때만 렌더하고 자체 mutation을 만들지 않는다(AGENTS 4절). */}
      {demoteTarget && (
        <Modal
          open
          onClose={() => setDemoteTarget(null)}
          title="관리자 권한을 해제할까요?"
          description={`${adminDisplayName(demoteTarget)} 계정이 일반 회원으로 돌아가요. 이미 발급된 토큰은 만료될 때까지 관리자로 통과해요.`}
          confirmLabel="권한 해제"
          confirmVariant="danger"
          loading={demote.isPending}
          onConfirm={submitDemote}
        />
      )}

      {toast && (
        <Toast open onClose={() => setToast(null)} message={toast.message} variant={toast.variant} />
      )}
    </div>
  )
}
