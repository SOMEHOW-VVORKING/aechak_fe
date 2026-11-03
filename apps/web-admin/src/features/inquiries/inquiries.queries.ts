import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  answerAdminInquiry,
  changeAdminInquiryStatus,
  getAdminInquiries,
  getAdminInquiryDetail,
  type AdminInquiryDetailData,
  type AdminInquiryListData,
  type GetAdminInquiriesParams,
} from '@aechak/api'
import { useMetricValue } from '@/shared/hooks/useMetricValue'
import {
  statusToWire,
  toInquiryDetailView,
  toInquiryRow,
  typeToWire,
  type AdminInquiryDetailView,
  type AdminInquiryRow,
  type InquiryStatusValue,
  type InquiryTypeValue,
  type ManualStatusTarget,
} from './inquiries.map'

// 어드민 서비스 문의 4종(목록·상세·답변·상태 전이)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다
// (AGENTS 6-2). 캐시 키 접두를 공유해 쓰기 한 번의 무효화가 목록과 열린 상세를 함께 갱신한다.

export const INQUIRIES_QUERY_KEY = ['admin-inquiries'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

export interface InquiryListParams {
  status: InquiryStatusValue | 'all'
  type: InquiryTypeValue | 'all'
  /** 문의 내용·답변 수신 이메일 부분일치. 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  size?: number
}

function listParams(params: InquiryListParams, cursor?: string): GetAdminInquiriesParams {
  const keyword = params.keyword.trim()
  return {
    // 값이 빈 파라미터는 키째 뺀다(AGENTS 6-6).
    ...(params.status === 'all' ? {} : { status: statusToWire(params.status) }),
    ...(params.type === 'all' ? {} : { inquiryType: typeToWire(params.type) }),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface InquiryListResult {
  rows: AdminInquiryRow[]
  /** 현재 필터 기준 전체 수. 서버가 첫 페이지에만 싣는다. */
  totalCount: number | null
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록. 필터·검색어를 쿼리 키에 넣어 필터가 바뀌는 순간 커서 사슬이 새로 시작되게 한다.
 *
 * `keepPreviousData`를 쓰므로 두 가지를 직접 끊는다.
 * ① **더 보기는 `query.hasNextPage`로만 열고 응답 본문의 `hasNext`로 열지 않는다.** placeholder
 *    구간(새 조건의 첫 페이지가 아직 오지 않은 동안)에는 `data`가 이전 조건의 페이지라서, 본문
 *    `hasNext`를 읽으면 버튼이 열려 있고 그 버튼이 이전 사슬의 커서를 요구해 새 조건의 첫 페이지를
 *    건너뛴다. `hasNextPage`는 그 구간에 이미 false이고(react-query v5가 새 쿼리 상태로 센다),
 *    `isPlaceholderData`를 함께 보는 것은 그 성질에 기대지 않겠다는 뜻이다 — 계약은 테스트가
 *    고정한다(`[AC-ADM-*-01x] 필터를 바꾼 뒤 …`).
 * ② 조회가 실패하면 `isError`를 올려 **화면이 처리 버튼을 잠그게 한다**(AGENTS 6-7). 행은 지우지
 *    않는다 — 마지막으로 본 내용은 정보다. 대신 그 낡은 행으로 되돌릴 수 없는 처리를 지시하지
 *    못하게 막는 책임이 화면에 있고, 그래서 `isError`를 결과에 그대로 싣는다.
 */
export function useAdminInquiries(params: InquiryListParams): InquiryListResult {
  const query = useInfiniteQuery<AdminInquiryListData>({
    queryKey: [...INQUIRIES_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminInquiries(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toInquiryRow)),
    totalCount: pages[0]?.totalCount ?? null,
    hasNext: query.hasNextPage && !query.isPlaceholderData && !query.isError,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

/**
 * 답변 대기(`RECEIVED`) 문의 건수. 대시보드 첫 화면의 칸과 할 일 줄이 쓴다.
 *
 * **`미답변` 전체가 아니라 `답변 대기`다.** 서버 상태는 넷(RECEIVED·IN_PROGRESS·ON_HOLD·DONE)이고
 * 답변이 달린 것은 DONE뿐이라, 답변이 없는 문의는 앞의 셋 전부다. 그런데 목록 경로의 `status`는
 * **값 하나만** 받아 "DONE이 아닌 것"을 한 번에 셀 수 없다 — 그래서 RECEIVED만 세고 칸 라벨도
 * 목록 화면과 같은 어휘(`답변 대기`)로 적는다. `미답변`으로 적으면 확인 중·보류가 빠진 수를
 * 운영자가 미답변 전부로 읽는다.
 */
export function useReceivedInquiryCount(): number | null {
  const params: GetAdminInquiriesParams = { status: statusToWire('received'), size: 1 }
  return useMetricValue([...INQUIRIES_QUERY_KEY, 'received-count'], signal =>
    getAdminInquiries(params, signal).then(response => response.data.totalCount),
  )
}

export interface InquiryDetailResult {
  inquiry: AdminInquiryDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useAdminInquiryDetail(inquiryId: number | null): InquiryDetailResult {
  const query = useQuery<AdminInquiryDetailData>({
    queryKey: [...INQUIRIES_QUERY_KEY, 'detail', inquiryId],
    queryFn:
      inquiryId == null
        ? skipToken
        : ({ signal }) => getAdminInquiryDetail(inquiryId, signal).then(response => response.data),
  })
  return {
    inquiry: query.data ? toInquiryDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export type InquiryWriteInput =
  | { kind: 'answer'; inquiryId: number; answer: string }
  | { kind: 'status'; inquiryId: number; target: ManualStatusTarget }

/**
 * 답변 등록과 상태 전이를 한 mutation으로 묶는다 — 둘 다 같은 상세를 돌려주고 같은 캐시를 무효화하며,
 * 화면에는 제출 버튼이 하나뿐이라 `isPending` 하나로 중복 제출과 다른 조작을 함께 잠글 수 있다.
 * 실패해도 무효화하는 이유는 409(이미 답변됨·전이 불가)가 "화면이 낡았다"는 신호라 그 자리에서
 * 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useWriteInquiry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InquiryWriteInput) => {
      if (input.kind === 'answer') {
        const answer = input.answer.trim()
        if (answer === '') {
          // 빈 답변은 화면이 막지만 요청을 만들 수 있는 자리에서도 끊는다.
          return Promise.reject(new Error('답변 내용을 입력해 주세요.'))
        }
        return answerAdminInquiry(input.inquiryId, { answer })
      }
      return changeAdminInquiryStatus(input.inquiryId, { status: statusToWire(input.target) })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: INQUIRIES_QUERY_KEY }),
  })
}
