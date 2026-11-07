import { keepPreviousData, skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getSellerNotice, getSellerNotices } from '@aechak/api'
import type { GetSellerNoticesParams } from '@aechak/api'
import type {
  NoticeCategory,
  NoticeDetailData,
  NoticeListData,
  NoticeSummary,
} from './notices.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(claims·reviews 관례) 이 파일이 자체
// useInfiniteQuery/useQuery로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로
// queryFn에서 벗긴다 — 그래서 `getNextPageParam`이 읽는 page는 이미 `NoticeListData`다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

export const NOTICES_QUERY_KEY = ['seller-notices'] as const

/** 서버 기본값과 같은 페이지 크기. 1~100 밖이면 서버가 절삭한다(400이 아니다). */
export const DEFAULT_PAGE_SIZE = 20

/** 분류 '전체'는 빈 문자열로 들고 있고, 요청에서는 **키째 빠진다**(빈 값은 400/90001이다). */
export const CATEGORY_ANY = ''

export interface NoticeListParams {
  category: NoticeCategory | typeof CATEGORY_ANY
}

function listParams(params: NoticeListParams, cursor?: string): GetSellerNoticesParams {
  return {
    ...(params.category === CATEGORY_ANY ? {} : { category: params.category }),
    ...(cursor ? { cursor } : {}),
    size: DEFAULT_PAGE_SIZE,
  }
}

export interface NoticeListResult {
  notices: NoticeSummary[]
  /** 현재 분류 기준 전체 수 — 첫 페이지에만 실린다. 받지 못하면 null이다. */
  totalCount: number | null
  hasNext: boolean
  isLoading: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
  refetch: () => void
}

/**
 * 커서 페이징 목록.
 *
 * **분류를 쿼리 키에 넣는다** — 이 경로의 커서에는 분류가 실리지 않아(코덱이 담는 것은
 * tag·pinned·publishedAt·noticeId 넷뿐) 조건이 바뀐 채 옛 커서를 보내도 **서버가 거부하지 않는다**.
 * 엉뚱한 앵커에서 이어 읽은 섞인 목록이 그대로 그려지므로 FE가 유일한 방어선이다. 키에 넣으면
 * 조건이 바뀌는 순간 커서 사슬이 새로 시작해 애초에 옛 커서를 보내지 않는다.
 *
 * `더 보기`는 `query.hasNextPage`로만 열고 **응답 본문의 `hasNext`로 열지 않는다** —
 * `placeholderData` 구간에는 `data`가 이전 조건의 페이지라, 본문 값을 읽으면 버튼이 열려 있고
 * 그 버튼이 직전 조건의 커서를 요구한다.
 *
 * `totalCount`는 **첫 페이지 값만** 쓴다(커서 페이지에서는 null이라, 뒤 페이지로 덮으면 사라진다).
 */
export function useSellerNotices(params: NoticeListParams): NoticeListResult {
  const query = useInfiniteQuery<NoticeListData>({
    queryKey: [...NOTICES_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getSellerNotices(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    // 분류를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    notices: pages.flatMap(page => page.items),
    totalCount: pages[0]?.totalCount ?? null,
    hasNext: query.hasNextPage && !query.isPlaceholderData && !query.isError,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
    refetch: () => {
      void query.refetch()
    },
  }
}

export interface NoticeDetailResult {
  notice: NoticeDetailData | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 상세 조회.
 *
 * 목록 행에는 `contentPreview`(앞 100자, 평탄화된 것)만 있고 **전문이 없다** — 목록 행만으로
 * Drawer를 열면 잘린 글이 공지 전문으로 읽힌다. 그래서 열 때마다 이 경로를 따로 부른다
 * (어드민 공지가 같은 이유로 그렇게 한다). 닫힌 동안(`noticeId == null`)은 `skipToken`으로 끊는다.
 */
export function useSellerNoticeDetail(noticeId: string | null): NoticeDetailResult {
  const query = useQuery<NoticeDetailData>({
    queryKey: [...NOTICES_QUERY_KEY, 'detail', noticeId],
    queryFn:
      noticeId == null
        ? skipToken
        : ({ signal }) => getSellerNotice(noticeId, signal).then(response => response.data),
  })
  return {
    notice: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}
