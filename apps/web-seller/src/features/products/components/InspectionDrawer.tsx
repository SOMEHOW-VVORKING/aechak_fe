import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Drawer, Skeleton, Textarea, Timeline, type TimelineStep } from '@aechak/design-system/web'
import type { InspectionProgressStep, SellerProductInspection } from '@aechak/api'
import {
  APPEAL_REASON_MAX_LENGTH,
  canAppealInspection,
  formatInspectionDateTime,
  productErrorMessage,
} from '../products.contract'
import { PRODUCTS_QUERY_KEY, useAppealProductInspection, useProductInspection } from '../products.queries'

interface InspectionDrawerProps {
  productId: string | null
  onClose: () => void
  onEdit: (productId: string) => void
}

const IN_PROGRESS_INDEX: Partial<Record<InspectionProgressStep, number>> = {
  REQUESTED: 0,
  AI_REVIEWING: 1,
  ADMIN_REVIEWING: 2,
}

/** 관리자가 반려한 상품만 관리자 확인을 거친다. 나머지는 AI 판정으로 바로 결과가 난다 */
function isAdminInvolved(inspection: SellerProductInspection): boolean {
  return (
    inspection.progressStep === 'ADMIN_REVIEWING' ||
    (inspection.progressStep === 'REJECTED' && inspection.rejectReason != null)
  )
}

function toTimeline(inspection: SellerProductInspection): TimelineStep[] {
  const step = inspection.progressStep
  const result = step === 'APPROVED' ? '검수 통과' : step === 'REJECTED' ? '반려' : '결과'
  const labels = isAdminInvolved(inspection)
    ? ['검수 요청', 'AI 검수', '관리자 확인', result]
    : ['검수 요청', 'AI 검수', result]
  const current = IN_PROGRESS_INDEX[step] ?? labels.length - 1
  return labels.map((label, index) => ({
    label,
    status: index < current ? 'done' : index === current ? 'active' : 'todo',
  }))
}

// 검수가 어느 단계에 있는지와 무엇이 문제인지를 보여 준다. 진행 단계는 서버가 계산한다 — 관리자 검토 큐는
// 셀러가 볼 수 없어 화면이 관리자 확인 중인지를 판단할 수 없다.
export function InspectionDrawer({ productId, onClose, onEdit }: InspectionDrawerProps) {
  const queryClient = useQueryClient()
  const inspection = useProductInspection(productId)
  const { data } = inspection

  // 검수가 끝났으면 목록의 검수 상태도 바뀌어 있다 — 닫을 때 목록을 다시 읽는다.
  function handleClose() {
    void queryClient.invalidateQueries({ queryKey: [...PRODUCTS_QUERY_KEY, 'list'] })
    onClose()
  }

  return (
    <Drawer open={productId !== null} onClose={handleClose} title="검수 진행" width="lg">
      {inspection.isLoading && (
        <div role="status" aria-label="검수 진행을 불러오는 중" className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {inspection.isError && (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">{productErrorMessage(inspection.error)}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={inspection.isFetching}
              onClick={() => void inspection.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}
      {data && productId && (
        <div className="flex flex-col gap-6">
          <Timeline steps={toTimeline(data)} />
          <InspectionDetail inspection={data} onEdit={() => onEdit(productId)} />
          {/* 조회가 실패한 동안에는 제기를 막는다 — 낡은 값으로 보내면 이미 끝난 반려에 이의가 간다(규약 7). */}
          <AppealPanel productId={productId} inspection={data} blocked={inspection.isError} />
        </div>
      )}
    </Drawer>
  )
}

function InspectionDetail({ inspection, onEdit }: { inspection: SellerProductInspection; onEdit: () => void }) {
  const editButton = (
    <Button variant="primary" className="self-start" onClick={onEdit}>
      수정하러 가기
    </Button>
  )

  switch (inspection.progressStep) {
    case 'REQUESTED':
    case 'AI_REVIEWING':
      return <p className="text-body-sm text-text-secondary">AI가 상품 내용을 검수하고 있어요. 보통 1분 안에 끝나요.</p>
    case 'ADMIN_REVIEWING':
      return (
        <Alert variant="info" title="관리자가 다시 확인하고 있어요">
          고친 내용이 AI 검수를 통과했어요. 관리자가 확인하면 다시 노출돼요.
        </Alert>
      )
    case 'REJECTED': {
      const byAdmin = inspection.rejectReason != null
      return (
        <div className="flex flex-col gap-3">
          {byAdmin && (
            <Alert variant="error" title="관리자가 반려했어요">
              {inspection.rejectReason}
            </Alert>
          )}
          {inspection.judgment === 'FLAG' ? (
            <Alert variant={byAdmin ? 'warning' : 'error'} title="AI가 확인이 필요한 표현을 찾아 반려했어요">
              <div className="flex flex-col gap-1">
                {inspection.reasonSummary && <strong>{inspection.reasonSummary}</strong>}
                {inspection.sellerNotice && <span>{inspection.sellerNotice}</span>}
              </div>
            </Alert>
          ) : (
            // AI가 반려한 뒤 고친 내용을 판단하지 못한 경우 — 반려는 그대로 남는다.
            !byAdmin && (
              <Alert variant="error" title="반려된 상품이에요">
                AI가 고친 내용을 판단하지 못했어요. 다시 고쳐서 검수를 받아 주세요.
              </Alert>
            )
          )}
          <p className="text-body-sm text-text-secondary">
            {byAdmin
              ? '고치면 AI 검수를 거쳐 관리자가 다시 확인해요.'
              : '고치면 AI가 다시 검수하고, 통과하면 바로 다시 노출돼요.'}
          </p>
          {editButton}
        </div>
      )
    }
    case 'APPROVED':
      return <p className="text-body-sm text-text-secondary">검수를 통과했어요.</p>
  }
}

/**
 * 반려에 이의를 제기하는 자리. `InspectionDetail`의 progressStep 분기 밖에 두는 이유는, 관리자가
 * 반려한 상품을 고쳐 AI를 통과한 상품(progressStep=ADMIN_REVIEWING, inspectionStatus=REJECTED)도
 * 이의 대상인데 그 분기에서는 "관리자가 다시 확인 중"만 그리기 때문이다.
 *
 * 제기 이력이 있으면 입구 대신 제기한 시각과 사유를 보여 준다. 서버가 재제기를 어떻게 거절하는지
 * 확인하지 못해 막는 쪽으로 둔 것이고(`canAppealInspection`), 제기한 내용을 되읽을 자리가 없으면
 * 셀러는 자기가 무엇을 보냈는지 모른다.
 */
function AppealPanel({
  productId,
  inspection,
  blocked,
}: {
  productId: string
  inspection: SellerProductInspection
  blocked: boolean
}) {
  const [reason, setReason] = useState('')
  const appeal = useAppealProductInspection()

  // 입구를 내줄지는 `canAppealInspection` 한 곳이 정한다 — 여기서 `appealedAt`을 또 보면 판정이
  // 두 군데로 갈려, 한쪽을 고쳐도 다른 쪽이 가려 테스트가 통과한다.
  if (!canAppealInspection(inspection)) {
    if (inspection.appealedAt == null) return null
    return (
      <Alert variant="info" title={`${formatInspectionDateTime(inspection.appealedAt)}에 이의를 제기했어요`}>
        {inspection.appealReason ?? '적어 둔 사유가 없어요.'}
      </Alert>
    )
  }

  const trimmed = reason.trim()
  return (
    <div className="flex flex-col gap-3">
      {appeal.isError && <Alert variant="error">{productErrorMessage(appeal.error)}</Alert>}
      <Textarea
        label="이의 제기 사유"
        value={reason}
        onChange={setReason}
        maxLength={APPEAL_REASON_MAX_LENGTH}
        rows={3}
        placeholder="반려 사유에 동의하지 않는 이유를 적어 주세요."
        helperText="보낸 뒤에는 고칠 수 없어요."
      />
      {/* 사유 없는 이의는 관리자가 재검토할 근거가 없다 — 서버는 null도 받지만 화면이 비워서 보내지 않는다. */}
      <Button
        variant="secondary"
        className="self-start"
        loading={appeal.isPending}
        disabled={blocked || trimmed.length === 0}
        onClick={() => appeal.mutate({ productId, reason: trimmed })}
      >
        이의 제기
      </Button>
    </div>
  )
}
