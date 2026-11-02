import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, UserMinus, UserPlus } from 'lucide-react'
import { Alert, Button, DataTable, Input, Modal, StatusPill, Toast } from '@aechak/design-system/web'
import type { Column, StatusPillVariant } from '@aechak/design-system/web'
import {
  ACCESS_TOKEN_TTL_MINUTES,
  DEFAULT_PAGE_SIZE,
  ROLE_PROPAGATION_NOTICE,
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

// 이 화면의 토스트는 "언제 반영되는지"를 한 문장 더 말하므로 DS 기본 3초로는 다 읽히지 않는다
// (해제 토스트가 50자를 넘는다). 운영자가 읽지 못하는 안내는 안 쓴 것과 같아 여기만 늘린다 —
// DS 기본값은 4개 앱 공용이라 건드리지 않는다.
const ROLE_CHANGE_TOAST_MS = 7000

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
  // 명부 조회가 **권한 때문에** 막힌 상태(401/20004·403/20005·403/20011)라면 승격 요청도 같은
  // 토큰으로 나가 반드시 거절된다 — 누를 수 있게 둬서 실패를 보여 줄 이유가 없다(자기 자신 강등
  // 버튼과 같은 판단). 5xx·네트워크 실패는 재시도로 풀릴 수 있으므로 막지 않는다.
  const blockedByPermission = isError && needsRelogin(error)

  function submitPromote() {
    if (parsedUserId == null) return
    setPromoteError(null)
    promote.mutate(parsedUserId, {
      onSuccess: () => {
        setUserIdInput('')
        // 지금 쥔 access 토큰에는 아직 옛 역할이 박혀 있다 — 토스트에서도 반영 시점을 다시 말한다.
        setToast({
          message: '관리자로 승격했어요. 그 계정이 다음에 토큰을 갱신하면 권한이 반영돼요.',
          variant: 'success',
        })
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
        // 해제는 즉시가 아니다 — 운영자가 실제 차단 시점을 설명할 수 있게 창을 숫자로 말한다.
        setToast({
          message: `관리자 권한을 해제했어요. 이미 발급된 access 토큰(수명 ${ACCESS_TOKEN_TTL_MINUTES}분)이 만료되면 관리자 접근이 끊겨요.`,
          variant: 'success',
        })
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

      {/* 고정 문구 — 권한 변경의 반영 시점이다. 성공 토스트와 별개로 늘 보인다.
          DS Alert가 variant별 아이콘을 자체 렌더하므로 앞에 lucide 아이콘을 또 넣지 않는다. */}
      <Alert variant="info" className="mb-3.5">
        {ROLE_PROPAGATION_NOTICE}
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
            disabled={parsedUserId == null || isMutating || blockedByPermission}
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
          description={`${adminDisplayName(demoteTarget)} 계정이 일반 회원으로 돌아가요. 이미 발급된 access 토큰(수명 ${ACCESS_TOKEN_TTL_MINUTES}분)이 만료되면 관리자 접근이 끊겨요.`}
          confirmLabel="권한 해제"
          confirmVariant="danger"
          loading={demote.isPending}
          onConfirm={submitDemote}
        />
      )}

      {toast && (
        <Toast
          open
          onClose={() => setToast(null)}
          message={toast.message}
          variant={toast.variant}
          duration={ROLE_CHANGE_TOAST_MS}
        />
      )}
    </div>
  )
}
