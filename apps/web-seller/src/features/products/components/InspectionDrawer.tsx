import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Drawer, Skeleton, Timeline, type TimelineStep } from '@aechak/design-system/web'
import type { InspectionProgressStep, SellerProductInspection } from '@aechak/api'
import { productErrorMessage } from '../products.contract'
import { PRODUCTS_QUERY_KEY, useProductInspection } from '../products.queries'

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
