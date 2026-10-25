import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, DatePicker, FilterBar, Modal, PageHeader, Select, Tabs } from '@aechak/design-system/web'
import {
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  ClaimApproveModal,
  ClaimDetailDrawer,
  ClaimInvoiceModal,
  ClaimRejectModal,
  ClaimsTable,
  PENDING_STAGE_LABEL,
  claimErrorMessage,
  useApproveClaim,
  useClaims,
  useCompleteClaimCollection,
  useRejectClaim,
  useReshipClaim,
  useStartClaimCollection,
  useUpdateClaimMemo,
  type ClaimStatus,
  type ClaimType,
  type SellerClaimPendingStage,
  type SellerClaimSearchInput,
  type SellerClaimSummary,
} from '@/features/claims'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/claims/')({
  component: ClaimsRoute,
})

// 운영 진입 차단 스위치(SERVER_CLAIMS_AVAILABLE)는 걷었다 — seller 모듈에 클레임 8경로가 모두 있고
// (목록·상세·메모·승인·거부·회수 송장·회수 완료·재발송) 이 화면이 그것만 부른다. 목업은 지웠다.
//
// 화면에 두지 않은 것과 이유:
// · 주문번호 검색: 서버 목록에 키워드 파라미터가 없다(정렬 파라미터도 없다 — claims.id 내림차순 고정).
// · 환불 확정: 셀러가 환불을 집행하는 경로가 없다. 승인은 상태만 바꾸고 환불은 배치가 집행한다
//   (목업 시절의 "환불 확정" 버튼은 서버에 대응이 없어 지웠다).
// · 분쟁(dispute) 탭: 서버 ClaimType은 CANCEL·RETURN·EXCHANGE 셋뿐이다.

type TypeTab = 'ALL' | ClaimType
const TYPE_TABS: TypeTab[] = ['ALL', 'CANCEL', 'RETURN', 'EXCHANGE']

const PENDING_STAGE_OPTIONS: { value: SellerClaimPendingStage | ''; label: string }[] = [
  { value: '', label: '전체 처리 단계' },
  ...(Object.entries(PENDING_STAGE_LABEL) as [SellerClaimPendingStage, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
]

const STATUS_OPTIONS: { value: ClaimStatus | ''; label: string }[] = [
  { value: '', label: '전체 상태' },
  ...(Object.entries(CLAIM_STATUS_LABEL) as [ClaimStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
]

interface Filters {
  claimType: TypeTab
  pendingStage: SellerClaimPendingStage | ''
  status: ClaimStatus | ''
  /** YYYY-MM-DD. 양 끝 날짜를 통째로 포함한다(서버가 to+1일 00:00 반개구간으로 바꾼다). */
  requestedFrom: string
  requestedTo: string
  page: number
}

const EMPTY_FILTERS: Filters = {
  claimType: 'ALL',
  pendingStage: '',
  status: '',
  requestedFrom: '',
  requestedTo: '',
  page: 0,
}

// 빈 값('전체'·빈 날짜)을 여기서 걸러내지 않는다 — 와이어 모양은 queries 층의
// normalizeClaimSearchParams가 한 곳에서 소유한다. 서버는 `?status=`처럼 값이 빈 파라미터도
// 400/90001로 거절한다.
function toParams(filters: Filters): SellerClaimSearchInput {
  return {
    claimType: filters.claimType === 'ALL' ? [] : [filters.claimType],
    pendingStage: filters.pendingStage ? [filters.pendingStage] : [],
    status: filters.status ? [filters.status] : [],
    requestedFrom: filters.requestedFrom,
    requestedTo: filters.requestedTo,
    page: filters.page,
  }
}

type ClaimActionKind = 'approve' | 'reject' | 'collection-invoice' | 'collection-complete' | 'reship'

interface ClaimActionTarget {
  claim: SellerClaimSummary
  kind: ClaimActionKind
}

function ClaimsRoute() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const listQuery = useClaims(toParams(filters))
  const { data, isLoading, isError, error, isFetching } = listQuery

  const [detailId, setDetailId] = useState<string | null>(null)
  // 확인 Modal 패턴: 타겟은 라우트가 소유하고 Modal은 타겟이 있을 때만 그린다.
  const [actionTarget, setActionTarget] = useState<ClaimActionTarget | null>(null)
  const toast = useToast()

  const approveClaim = useApproveClaim()
  const rejectClaim = useRejectClaim()
  const startCollection = useStartClaimCollection()
  const completeCollection = useCompleteClaimCollection()
  const reshipClaim = useReshipClaim()
  const updateMemo = useUpdateClaimMemo()

  // 목록의 다른 행 버튼도 이 값으로 잠근다(확인 Modal 패턴). 메모 저장은 다른 행을 잠글 이유가
  // 없어 따로 둔다.
  const isMutating =
    approveClaim.isPending ||
    rejectClaim.isPending ||
    startCollection.isPending ||
    completeCollection.isPending ||
    reshipClaim.isPending

  const counts = data?.counts
  const tabs = useMemo(
    () =>
      TYPE_TABS.map(tab => ({
        key: tab,
        label: tab === 'ALL' ? '전체' : CLAIM_TYPE_LABEL[tab],
        // counts는 유형 필터를 무시하고 상태·단계·기간만 반영한다 — 지금 고른 탭과 무관한 건수다.
        ...(counts
          ? { badge: tab === 'ALL' ? counts.CANCEL + counts.RETURN + counts.EXCHANGE : counts[tab] }
          : {}),
      })),
    [counts],
  )

  // 마지막 페이지의 유일한 건이 처리로 빠지면 페이지 이동 버튼도 없는 빈 페이지에 남는다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && filters.page > lastPage) setFilters(prev => ({ ...prev, page: lastPage }))
  }, [data, filters.page, lastPage])

  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) =>
    setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const showError = (cause: unknown) => toast.show(claimErrorMessage(cause), 'error')
  const onDone = (message: string) => {
    setActionTarget(null)
    toast.show(message)
  }
  const onFailed = (cause: unknown) => {
    setActionTarget(null)
    showError(cause)
  }

  const totalPages = data?.totalPages ?? 0
  const hasRows = (data?.claims.length ?? 0) > 0

  return (
    <div className="p-6">
      <PageHeader title="취소/반품/교환" />
      <p className="-mt-3 mb-4 text-body-sm text-text-secondary">
        배송 전이면 취소, 배송이 시작되면 반품/교환으로 이어져요. 승인할 때 고른 반품비 부담 주체가 정산/환불
        금액에 반영돼요.
      </p>

      <Tabs
        tabs={tabs}
        activeKey={filters.claimType}
        onSelect={key => setFilter({ claimType: key as TypeTab })}
        className="mb-4"
      />

      <div className="flex flex-col gap-2">
        <FilterBar>
          <Select
            aria-label="처리 단계"
            options={PENDING_STAGE_OPTIONS}
            value={filters.pendingStage}
            onChange={value => setFilter({ pendingStage: value as SellerClaimPendingStage | '' })}
          />
          <Select
            aria-label="상태"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={value => setFilter({ status: value as ClaimStatus | '' })}
          />
          <Button variant="ghost" size="md" onClick={() => setFilters(EMPTY_FILTERS)}>
            초기화
          </Button>
        </FilterBar>
        {/* 라벨을 쓴 DatePicker는 루트가 flex-col이라 ~64px인데 FilterBar는 items-center다 —
            40px 컨트롤과 같은 줄에 두면 날짜 입력칸만 아래로 밀린다(상품 목록과 같은 처리). */}
        <FilterBar>
          <DatePicker
            label="요청일 시작"
            value={filters.requestedFrom}
            max={filters.requestedTo || undefined}
            onChange={requestedFrom => setFilter({ requestedFrom })}
          />
          {/* 시작일 > 종료일은 BE가 400/90001로 거절한다 — 서로의 min/max로 애초에 못 고르게 묶는다. */}
          <DatePicker
            label="요청일 종료"
            value={filters.requestedTo}
            min={filters.requestedFrom || undefined}
            onChange={requestedTo => setFilter({ requestedTo })}
          />
        </FilterBar>
      </div>

      {/* 목록 조회 실패를 표의 빈 상태로 흘리지 않는다 — 실 API에는 403/50404(ACTIVE가 아닌 셀러),
          403/20006(온보딩 미완), 400/90001, 500이 모두 있고 그 전부가 "조건에 맞는 클레임이 없어요"로
          보이면 셀러는 필터를 의심한다. 필터를 바꾼 조회가 실패하면 placeholderData가 버려져 표가
          비고, 같은 조회의 재조회(처리 뒤 무효화·포커스 복귀)가 실패하면 직전 데이터가 남는다. */}
      {isError && (
        <Alert variant="error" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {claimErrorMessage(error)}
              {hasRows && ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void listQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      <p className="mt-4 text-caption text-text-tertiary">
        총 {data ? data.totalCount.toLocaleString() : '—'}건
      </p>

      <div className="mt-2">
        <ClaimsTable
          claims={data?.claims ?? []}
          isLoading={isLoading}
          isError={isError}
          isMutating={isMutating}
          onOpenDetail={setDetailId}
          onApprove={claim => setActionTarget({ claim, kind: 'approve' })}
          onReject={claim => setActionTarget({ claim, kind: 'reject' })}
          onReship={claim => setActionTarget({ claim, kind: 'reship' })}
        />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        행을 누르면 구매자가 적은 사유 전문과 수령인/품목/진행 이력을 볼 수 있어요. 비고 메모는 내부
        운영용이라 구매자에게 보이지 않아요.
      </p>

      {totalPages > 1 && (
        <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page === 0}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            이전
          </Button>
          <span className="text-body-sm tabular-nums text-text-secondary">
            {filters.page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.hasNext}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </nav>
      )}

      <ClaimDetailDrawer
        claimPublicId={detailId}
        isMutating={isMutating}
        isSavingMemo={updateMemo.isPending}
        onClose={() => setDetailId(null)}
        onApprove={claim => setActionTarget({ claim, kind: 'approve' })}
        onReject={claim => setActionTarget({ claim, kind: 'reject' })}
        onStartCollection={claim => setActionTarget({ claim, kind: 'collection-invoice' })}
        onCompleteCollection={claim => setActionTarget({ claim, kind: 'collection-complete' })}
        onReship={claim => setActionTarget({ claim, kind: 'reship' })}
        onSaveMemo={(claim, sellerMemo) =>
          updateMemo.mutate(
            { claimPublicId: claim.claimPublicId, sellerMemo },
            {
              onSuccess: () => toast.show(sellerMemo.trim() === '' ? '메모를 지웠어요.' : '메모를 저장했어요.'),
              onError: showError,
            },
          )
        }
      />

      {actionTarget?.kind === 'approve' && (
        <ClaimApproveModal
          claim={actionTarget.claim}
          loading={approveClaim.isPending}
          onClose={() => setActionTarget(null)}
          onConfirm={returnCostBearer =>
            approveClaim.mutate(
              { claimPublicId: actionTarget.claim.claimPublicId, returnCostBearer },
              {
                onSuccess: () =>
                  onDone(
                    actionTarget.claim.claimType === 'CANCEL'
                      ? '취소를 승인했어요.'
                      : '승인했어요. 회수 송장을 등록해 주세요.',
                  ),
                onError: onFailed,
              },
            )
          }
        />
      )}

      {actionTarget?.kind === 'reject' && (
        <ClaimRejectModal
          claim={actionTarget.claim}
          loading={rejectClaim.isPending}
          onClose={() => setActionTarget(null)}
          onConfirm={rejectionReason =>
            rejectClaim.mutate(
              { claimPublicId: actionTarget.claim.claimPublicId, rejectionReason },
              { onSuccess: () => onDone('거부했어요.'), onError: onFailed },
            )
          }
        />
      )}

      {actionTarget?.kind === 'collection-invoice' && (
        <ClaimInvoiceModal
          claim={actionTarget.claim}
          mode="collection"
          loading={startCollection.isPending}
          onClose={() => setActionTarget(null)}
          onConfirm={invoice =>
            startCollection.mutate(
              { claimPublicId: actionTarget.claim.claimPublicId, ...invoice },
              { onSuccess: () => onDone('회수 송장을 등록했어요.'), onError: onFailed },
            )
          }
        />
      )}

      {actionTarget?.kind === 'reship' && (
        <ClaimInvoiceModal
          claim={actionTarget.claim}
          mode="reship"
          loading={reshipClaim.isPending}
          onClose={() => setActionTarget(null)}
          onConfirm={invoice =>
            reshipClaim.mutate(
              { claimPublicId: actionTarget.claim.claimPublicId, ...invoice },
              { onSuccess: () => onDone('재발송 송장을 등록했어요. 교환이 끝났어요.'), onError: onFailed },
            )
          }
        />
      )}

      {actionTarget?.kind === 'collection-complete' && (
        <ClaimInvoiceCompleteModal
          claim={actionTarget.claim}
          loading={completeCollection.isPending}
          onClose={() => setActionTarget(null)}
          onConfirm={() =>
            completeCollection.mutate(
              { claimPublicId: actionTarget.claim.claimPublicId },
              {
                onSuccess: () =>
                  onDone(
                    actionTarget.claim.claimType === 'EXCHANGE'
                      ? '회수를 완료했어요. 재발송 송장을 등록해 주세요.'
                      : '회수를 완료했어요. 환불이 진행돼요.',
                  ),
                onError: onFailed,
              },
            )
          }
        />
      )}

      {toast.element}
    </div>
  )
}

/**
 * 회수 완료 확인. 입력이 없어 공용 Modal을 그대로 쓰고, 유형마다 뒤따르는 일이 다르다 —
 * 반품은 이 전이 뒤에 환불이 집행되고 교환은 재발송이 남는다.
 */
function ClaimInvoiceCompleteModal({
  claim,
  loading,
  onClose,
  onConfirm,
}: {
  claim: SellerClaimSummary
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="회수를 완료 처리할까요?"
      description={
        claim.claimType === 'EXCHANGE'
          ? '물건이 돌아온 것을 확인한 뒤 눌러 주세요. 완료하면 재발송 송장을 등록할 수 있어요.'
          : '물건이 돌아온 것을 확인한 뒤 눌러 주세요. 완료하면 환불이 진행되고 되돌릴 수 없어요.'
      }
      cancelLabel="취소"
      confirmLabel="회수 완료"
      loading={loading}
      onConfirm={onConfirm}
    />
  )
}
