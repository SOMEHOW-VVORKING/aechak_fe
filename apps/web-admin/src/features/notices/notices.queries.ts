import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createAdminNotice,
  getAdminNoticeDetail,
  getAdminNotices,
  publishAdminNotice,
  unpublishAdminNotice,
  updateAdminNotice,
  type AdminNoticeDetailData,
  type AdminNoticeListData,
  type GetAdminNoticesParams,
  type SaveNoticeRequest,
} from '@aechak/api'
import {
  toNoticeDetailView,
  toNoticeRow,
  type AdminNoticeDetailView,
  type AdminNoticeRow,
  type NoticeAudienceValue,
  type NoticeStatusValue,
} from './notices.map'

// 어드민 공지 6종(목록·초안 생성·상세·수정·게시·내림)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비한다(AGENTS 6-2).

export const NOTICES_QUERY_KEY = ['admin-notices'] as const

/** 서버 기본값과 같은 페이지 크기. 1~100 밖이면 서버가 절삭한다(400이 아니다). */
export const DEFAULT_PAGE_SIZE = 20

/**
 * 대상 필터의 "미선택" 센티넬.
 *
 * 이 축에는 `'ALL'`이 **실제 값**으로 있다(전체 회원 대상 공지) — 다른 어드민 목록의 `'all'`
 * 센티넬 관례를 그대로 쓰면 "전체 대상"을 골라도 미선택으로 읽혀 서버로 `audience`가 나가지 않고,
 * 운영자는 전체 목록을 보면서 걸러진 것으로 읽는다.
 */
export const AUDIENCE_ANY = 'any'

export interface NoticeListParams {
  status: NoticeStatusValue | 'all'
  audience: NoticeAudienceValue | typeof AUDIENCE_ANY
  /** 서버는 **제목 부분일치**만 본다. 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  size?: number
}

function listParams(params: NoticeListParams, cursor?: string): GetAdminNoticesParams {
  const keyword = params.keyword.trim()
  return {
    ...(params.status === 'all' ? {} : { status: params.status }),
    ...(params.audience === AUDIENCE_ANY ? {} : { audience: params.audience }),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface NoticeListResult {
  rows: AdminNoticeRow[]
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록.
 *
 * **필터를 쿼리 키에 넣는다** — 이 경로의 커서에는 필터 조건이 실리지 않아(서버 커서 코덱이 마지막
 * 행만 담는다) 조건이 바뀐 채 옛 커서를 보내도 **서버가 거부하지 않는다**. 엉뚱한 앵커에서 이어 읽은
 * 섞인 목록이 그대로 그려지므로 FE가 유일한 방어선이다. 키에 넣으면 조건이 바뀌는 순간 커서 사슬이
 * 새로 시작해 애초에 옛 커서를 보내지 않는다.
 *
 * `더 보기`는 `query.hasNextPage`로만 열고 **응답 본문의 `hasNext`로 열지 않는다**. placeholder
 * 구간에는 `data`가 이전 조건의 페이지라, 본문 값을 읽으면 버튼이 열려 있고 그 버튼이 옛 커서를
 * 요구한다.
 *
 * `totalCount`는 **화면에 쓰지 않는다** — 첫 페이지에만 실리고 커서 페이지에서는 null이라, 그 값을
 * 붙들어 두면 `더 보기`로 쌓은 목록 위에 첫 페이지 기준의 낡은 숫자가 남는다.
 */
export function useAdminNotices(params: NoticeListParams): NoticeListResult {
  const query = useInfiniteQuery<AdminNoticeListData>({
    queryKey: [...NOTICES_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminNotices(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toNoticeRow)),
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

export interface NoticeDetailResult {
  notice: AdminNoticeDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 상세 조회.
 *
 * 목록 summary에 `content`·`internalMemo`가 **없다** — 목록 행만으로 편집 폼을 열면 본문이 빈 채로
 * 뜨고, 그대로 저장하면 빈 내용으로 PUT이 나가 공지 본문이 지워지거나 400이다. 그래서 드로어를 열
 * 때마다 이 경로를 따로 부른다. 생성 모드(`noticeId == null`)에서는 `skipToken`으로 끊는다.
 */
export function useAdminNoticeDetail(noticeId: string | null): NoticeDetailResult {
  const query = useQuery<AdminNoticeDetailData>({
    queryKey: [...NOTICES_QUERY_KEY, 'detail', noticeId],
    queryFn:
      noticeId == null
        ? skipToken
        : ({ signal }) => getAdminNoticeDetail(noticeId, signal).then(response => response.data),
  })
  return {
    notice: query.data ? toNoticeDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface NoticeSaveInput {
  /** null이면 초안 생성(POST), 있으면 수정(PUT)이다. */
  noticeId: string | null
  body: SaveNoticeRequest
}

/**
 * 초안 생성·수정.
 *
 * **게시와 묶지 않는다.** PUT은 상태를 바꾸지 않으므로 "고치기만 하고 게시는 미루기"가 가능해야
 * 하고, 둘을 한 요청처럼 보여 주면 PUT 성공 뒤 publish 실패 구간에서 어느 쪽이 들어갔는지 운영자가
 * 알 수 없다. 성공·실패 모두 무효화한다 — 400·404는 "화면이 낡았다"는 신호다.
 */
export function useSaveNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noticeId, body }: NoticeSaveInput) =>
      noticeId == null
        ? createAdminNotice(body).then(response => response.data)
        : updateAdminNotice(noticeId, body).then(response => response.data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY }),
  })
}

export interface NoticeTransitionInput {
  noticeId: string
  action: 'publish' | 'unpublish'
}

/**
 * 게시·내림.
 *
 * 둘 다 멱등이 아니라 거절이다(409/150006 재게시, 409/150007 미게시 내림). 그래서 낙관적 갱신을
 * 하지 않고 무효화 후 재조회로 반영하며, **실패해도 무효화한다** — 두 409는 전부 화면이 낡았다는
 * 신호라 그 자리에서 서버 상태를 다시 받아야 버튼이 맞는 쪽으로 바뀐다.
 */
export function useNoticeTransition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noticeId, action }: NoticeTransitionInput) =>
      action === 'publish'
        ? publishAdminNotice(noticeId).then(response => response.data)
        : unpublishAdminNotice(noticeId).then(response => response.data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTICES_QUERY_KEY }),
  })
}
