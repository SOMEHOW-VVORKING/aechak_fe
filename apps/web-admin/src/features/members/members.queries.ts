import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getAdminMemberDetail,
  getAdminMembers,
  releaseAdminMemberSanction,
  resetAdminMemberProfile,
  sanctionAdminMember,
  type AdminMemberDetailData,
  type AdminMemberListData,
  type GetAdminMembersParams,
} from '@aechak/api'
import type { MemberAccount } from '@aechak/domain'
import {
  DECISION_TO_ACTION,
  STATUS_FILTER_TO_WIRE,
  toMemberAccount,
  toSanctionEntry,
  type MemberStatusFilterValue,
  type SanctionDecision,
  type SanctionEntryView,
} from './members.map'
import type { SanctionReasonCode } from '@aechak/api'

// 어드민 회원 관리 4종(목록·상세·제재·해제)을 실서버에 붙이는 얇은 어댑터. 생성된 react-query
// 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다(AGENTS 6-2).
// 캐시 키 접두를 공유해, 제재 한 번의 무효화가 목록과 열린 상세를 함께 갱신한다.

export const MEMBERS_QUERY_KEY = ['members'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

export interface MemberListParams {
  status: MemberStatusFilterValue
  /** 닉네임 부분일치 또는 회원 id 완전일치. 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  size?: number
}

function listParams(params: MemberListParams, cursor?: string): GetAdminMembersParams {
  const keyword = params.keyword.trim()
  return {
    // 값이 빈 파라미터는 키째 뺀다(AGENTS 6-6) — 서버가 형식 오류로 보는 자리가 있다.
    ...(params.status === 'all' ? {} : { status: STATUS_FILTER_TO_WIRE[params.status] }),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface MemberListResult {
  rows: MemberAccount[]
  /** 현재 필터 기준 전체 수. 서버가 주지 않으면 null이다. */
  totalCount: number | null
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록. 상태 필터를 커서와 함께 바꾸면 서버가 400(90002)으로 끊으므로
 * **필터·검색어를 쿼리 키에 넣어** 필터가 바뀌는 순간 커서 사슬이 새로 시작되게 한다.
 */
export function useAdminMembers(params: MemberListParams): MemberListResult {
  const query = useInfiniteQuery<AdminMemberListData>({
    queryKey: [...MEMBERS_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminMembers(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    // 필터를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toMemberAccount)),
    totalCount: pages[0]?.totalCount ?? null,
    hasNext: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

export interface MemberDetailResult {
  member: MemberAccount | null
  /** 현재 프로필 이미지 주소. 기본 이미지면 null이다. */
  profileImageUrl: string | null
  bio: string | null
  sanctions: SanctionEntryView[]
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useAdminMemberDetail(userId: number | null): MemberDetailResult {
  const query = useQuery<AdminMemberDetailData>({
    queryKey: [...MEMBERS_QUERY_KEY, 'detail', userId],
    queryFn:
      userId == null
        ? skipToken
        : ({ signal }) => getAdminMemberDetail(userId, signal).then(response => response.data),
  })
  return {
    member: query.data ? toMemberAccount(query.data.member) : null,
    profileImageUrl: query.data?.profileImageUrl ?? null,
    bio: query.data?.bio ?? null,
    sanctions: (query.data?.sanctions ?? []).map(toSanctionEntry),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface SanctionInput {
  userId: number
  /** 'release'는 제재 해제다 — 서버 조치가 아니라 별도 경로로 나간다. */
  decision: SanctionDecision | 'release'
  reasonCode: SanctionReasonCode | null
  reasonDetail: string
  /** 임시 정지에만 쓴다. 다른 조치에 보내면 서버가 400(30802)으로 거절한다. */
  durationDays: number | null
  memo: string
}

/**
 * 제재·해제. 둘 다 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
 * 실패해도 무효화하는 이유는 409(이미 영구 정지·이미 탈퇴·제재 없음)가 "화면이 낡았다"는
 * 신호라 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useSanctionMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SanctionInput) => {
      const body = {
        ...(input.reasonDetail.trim() === '' ? {} : { reasonDetail: input.reasonDetail.trim() }),
        ...(input.memo.trim() === '' ? {} : { memo: input.memo.trim() }),
      }
      if (input.decision === 'release') {
        return releaseAdminMemberSanction(input.userId, body)
      }
      if (input.reasonCode == null) {
        // 사유는 제재의 필수 입력이다 — 화면이 막지만 요청을 만들 수 있는 자리에서도 끊는다.
        return Promise.reject(new Error('제재 사유를 선택해 주세요.'))
      }
      return sanctionAdminMember(input.userId, {
        action: DECISION_TO_ACTION[input.decision],
        reasonCode: input.reasonCode,
        ...(input.durationDays == null ? {} : { durationDays: input.durationDays }),
        ...body,
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  })
}

/** 프로필 초기화. 제재와 같이 204 본문 없음이라 성공과 실패 모두 무효화 후 재조회로 반영한다. */
export function useResetMemberProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => resetAdminMemberProfile(userId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  })
}
