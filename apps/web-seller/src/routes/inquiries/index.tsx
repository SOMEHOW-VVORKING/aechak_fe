import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Alert,
  Button,
  FilterBar,
  MetricCard,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
} from '@aechak/design-system/web'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_TABS,
  INQUIRY_TAB_LABEL,
  InquiriesTable,
  InquiryAnswerDrawer,
  inquiryErrorMessage,
  useAnswerInquiry,
  useSellerInquiries,
  type InquiryStatusTab,
  type ProductInquiryCategory,
  type SellerInquirySearchInput,
} from '@/features/inquiries'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'
import { useToast } from '@/shared/hooks/useToast'
import { SERVER_INQUIRIES_AVAILABLE } from '@/shared/serverAvailability'

export const Route = createFileRoute('/inquiries/')({
  component: InquiriesGate,
})

/**
 * 고객 문의 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설, SCRUM-307이
 * 예시 데이터로 채웠다. SCRUM-316에서 **seller 모듈의 실제 문의 API로 갈아끼웠다** —
 * `GET /sellers/me/inquiries`와 `POST /sellers/me/inquiries/{inquiryId}/answer` 둘이다.
 * 그래서 "예시 데이터" 띠와 nav의 "준비 중" 꼬리표를 뗐다.
 *
 * 화면에 두지 않은 것과 이유:
 * · 지표·기한 지남 재계산: 서버가 `metrics`와 행의 `overdue`를 같은 규칙으로 내려준다. 화면이
 *   날짜를 빼서 다시 세면 두 숫자가 갈린다(목업 시절의 `isOverdue()`는 지웠다).
 * · 주문번호 연결: 서버 문의에 주문 참조가 없다(구매 전 문의가 본래 용도다) — 목업의
 *   "주문번호" 행은 지어낸 필드라 지웠다.
 * · 답변 수정: 서버가 문의당 답변 한 건만 받고 두 번째는 409로 거절한다. 수정 버튼을 두면
 *   누를 때마다 실패하는 죽은 버튼이 된다.
 * · 철회된 문의: 서버 목록에 내려오지 않는다(구매자가 질문을 거둬간 것) — 탭으로 고를 수 없다.
 */
function InquiriesGate() {
  if (!SERVER_INQUIRIES_AVAILABLE) {
    return (
      <UnavailableScreen
        title="고객 문의"
        message="고객 문의는 준비 중이에요"
        description="문의 목록과 답변 전송은 서버가 준비되면 열어 둘게요."
      />
    )
  }
  return <InquiriesRoute />
}

const CATEGORY_OPTIONS: { value: ProductInquiryCategory | ''; label: string }[] = [
  { value: '', label: '전체 유형' },
  ...(Object.entries(INQUIRY_CATEGORY_LABEL) as [ProductInquiryCategory, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
]

interface Filters {
  tab: InquiryStatusTab
  category: ProductInquiryCategory | ''
  keyword: string
  page: number
}

const EMPTY_FILTERS: Filters = { tab: 'ALL', category: '', keyword: '', page: 0 }

// 빈 값('전체 유형'·빈 검색어)을 여기서 걸러내지 않는다 — 와이어 모양은 queries 층의
// normalizeInquirySearchParams가 한 곳에서 소유한다. 서버는 `?status=`처럼 값이 빈 파라미터를
// 미입력이 아니라 형식 오류로 거절한다.
function toParams(filters: Filters): SellerInquirySearchInput {
  return {
    status: filters.tab === 'ALL' ? '' : filters.tab,
    category: filters.category,
    keyword: filters.keyword,
    page: filters.page,
  }
}

function InquiriesRoute() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openId, setOpenId] = useState<string | null>(null)
  const toast = useToast()

  const listQuery = useSellerInquiries(toParams(filters))
  const { data, isLoading, isError, error, isFetching, isPlaceholderData } = listQuery
  const answerInquiry = useAnswerInquiry()

  const metrics = data?.metrics
  const rows = data?.inquiries ?? []
  // 열려 있는 Drawer는 캐시가 갱신되면 같은 id의 새 행을 따라간다 — 답변을 보낸 직후 무효화로
  // 돌아온 응답에 답변이 실려 있어야 입력칸이 "보낸 답변"으로 바뀐다.
  const openInquiry = rows.find(row => row.inquiryId === openId) ?? null

  // 열어 둔 문의가 목록에서 사라지면(철회·필터 변경) Drawer를 닫는다 — 빈 Drawer가 남지 않게.
  useEffect(() => {
    if (openId != null && !isPlaceholderData && data && openInquiry == null) setOpenId(null)
  }, [openId, openInquiry, data, isPlaceholderData])

  // 마지막 페이지의 유일한 건이 조건에서 빠지면 페이지 이동 버튼도 없는 빈 페이지에 남는다.
  // 전환 중(`isPlaceholderData`)에는 보정하지 않는다 — 그때 totalPages는 이전 조건의 값이다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && !isPlaceholderData && filters.page > lastPage) {
      setFilters(prev => ({ ...prev, page: lastPage }))
    }
  }, [data, isPlaceholderData, filters.page, lastPage])

  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) =>
    setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const totalPages = data?.totalPages ?? 0
  const hasRows = rows.length > 0
  const metricValue = (value: number | undefined) => (value == null ? '—' : `${value}건`)

  return (
    <div className="p-6">
      <PageHeader title="고객 문의" />
      <p className="-mt-3 mb-4 text-body-sm text-text-secondary">
        답변 기한은 접수한 다음 영업일부터 2영업일이에요. 답변은 문의당 한 번만 보낼 수 있어요.
      </p>

      {/* 지표는 탭·유형·검색어와 무관한 스토어 전체 범위다(서버가 그렇게 센다) — 탭을 눌러도
          흔들리지 않는다. 불러오지 못한 동안에는 0건이 아니라 —로 둔다(0건은 사실 주장이다). */}
      <section aria-label="문의 지표" className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="답변 대기"
          value={metricValue(metrics?.pending)}
          variant={(metrics?.pending ?? 0) > 0 ? 'urgent' : 'default'}
        />
        <MetricCard
          label="답변 기한 지남"
          value={metricValue(metrics?.overdue)}
          variant={(metrics?.overdue ?? 0) > 0 ? 'urgent' : 'default'}
        />
        <MetricCard label="전체 문의" value={metricValue(metrics?.total)} variant="quiet" />
      </section>

      <Tabs
        tabs={INQUIRY_STATUS_TABS.map(tab => ({
          key: tab,
          label: INQUIRY_TAB_LABEL[tab],
          // 배지는 서버가 세어 준 지표만 쓴다 — '전체'는 total, 두 탭은 각자의 건수다.
          // 답변 완료는 전체에서 대기를 뺀 값이다(서버가 따로 세어 주지 않는다).
          ...(metrics
            ? {
                badge:
                  tab === 'ALL'
                    ? metrics.total
                    : tab === 'RECEIVED'
                      ? metrics.pending
                      : metrics.total - metrics.pending,
              }
            : {}),
        }))}
        activeKey={filters.tab}
        onSelect={key => setFilter({ tab: key as InquiryStatusTab })}
        className="mb-4"
      />

      <FilterBar>
        <Select
          aria-label="문의 유형"
          options={CATEGORY_OPTIONS}
          value={filters.category}
          onChange={value => setFilter({ category: value as ProductInquiryCategory | '' })}
        />
        <SearchInput
          aria-label="문의 검색"
          placeholder="문의 제목이나 상품명으로 찾기"
          value={filters.keyword}
          onChange={keyword => setFilter({ keyword })}
        />
        <Button variant="ghost" size="md" onClick={() => setFilters(EMPTY_FILTERS)}>
          초기화
        </Button>
      </FilterBar>

      {/* 목록 조회 실패를 표의 빈 상태로 흘리지 않는다 — 실 API에는 403/120112(정지·탈퇴 셀러),
          403/20006(온보딩 미완), 400/90001, 500이 모두 있고 그 전부가 "조건에 맞는 문의가 없어요"로
          보이면 셀러는 필터를 의심한다(claims와 같은 처리). */}
      {isError && (
        <Alert variant="error" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {inquiryErrorMessage(error)}
              {hasRows && ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching}
              onClick={() => void listQuery.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      {/* 전환 중에는 건수를 이전 값으로 두지 않는다 — 조건을 바꾼 직후 data는 이전 조건의 응답이다. */}
      <p className="mt-4 text-caption text-text-tertiary">
        총 {data && !isPlaceholderData ? data.totalCount.toLocaleString() : '—'}건
        {isPlaceholderData && (
          <span className="ml-2">바뀐 조건으로 불러오는 중이에요. 아래 목록은 이전 결과예요.</span>
        )}
      </p>

      <div className={`mt-2${isPlaceholderData ? ' opacity-60' : ''}`}>
        <InquiriesTable
          inquiries={rows}
          onOpen={setOpenId}
          emptyLabel={
            isError
              ? '목록을 불러오지 못했어요.'
              : isLoading
                ? '문의를 불러오고 있어요.'
                : '조건에 맞는 문의가 없어요.'
          }
        />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        행을 누르면 문의 전문과 답변 폼을 볼 수 있어요. 비밀글은 구매자와 나만 볼 수 있어요.
      </p>

      {totalPages > 1 && (
        <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page === 0 || isPlaceholderData}
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
            disabled={!data?.hasNext || isPlaceholderData}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </nav>
      )}

      <InquiryAnswerDrawer
        inquiry={openInquiry}
        sending={answerInquiry.isPending}
        errorMessage={answerInquiry.isError ? inquiryErrorMessage(answerInquiry.error) : null}
        onClose={() => {
          // 요청이 떠 있는 동안 창만 닫히면 셀러는 보내지 않은 줄로 읽는다 — 요청은 취소할 수 없다.
          if (answerInquiry.isPending) return
          answerInquiry.reset()
          setOpenId(null)
        }}
        onSend={content => {
          if (openInquiry == null) return
          answerInquiry.mutate(
            { inquiryId: openInquiry.inquiryId, content },
            {
              onSuccess: () => {
                answerInquiry.reset()
                setOpenId(null)
                toast.show('답변을 보냈어요.')
              },
            },
          )
        }}
      />

      {toast.element}
    </div>
  )
}
