import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  blockUser,
  errorResponse,
  followUser,
  getFollowers,
  getFollowings,
  getMyBlocks,
  getMyMutes,
  getMySnsProfile,
  getSnsProfile,
  muteUser,
  unblockUser,
  unfollowUser,
  unmuteUser,
  type SnsProfileResult,
  type SnsRelationItemResult,
  type SnsRelationPageResult,
  type SnsUserItemResult,
  type SnsUserPageResult,
} from '@aechak/api'

// SNS-01(프로필, 팔로우, 차단, 뮤트)을 spec/contracts/sns.yaml에 붙이는 어댑터. 생성된 react-query 훅이 아니라
// fetcher만 소비하고 여기서 자체 useQuery/useInfiniteQuery로 감싼다(AGENTS.md 6절).

export type SnsProfile = SnsProfileResult
export type SnsUserItem = SnsUserItemResult
export type SnsRelationItem = SnsRelationItemResult
export type FollowDirection = 'followers' | 'followings'
export type RelationKind = 'blocks' | 'mutes'
export type SnsToggleKind = 'follow' | 'block' | 'mute'

/** 볼 수 없는 사용자(없음, 탈퇴, 온보딩 전, 나를 차단). 차단 사실을 드러내지 않으려고 한 코드로 온다(A7). */
export const SNS_UNAVAILABLE = 130000
/** 내가 차단한 사용자의 팔로워, 팔로잉 목록과 팔로우 요청 */
export const SNS_BLOCKED_BY_ME = 130001
/** 자기 자신 팔로우 */
export const SNS_SELF_FOLLOW = 130300

const PAGE_SIZE = 20

export const snsKeys = {
  all: ['sns'] as const,
  profiles: ['sns', 'profile'] as const,
  profile: (publicId: string) => ['sns', 'profile', publicId] as const,
  me: ['sns', 'me'] as const,
  follows: ['sns', 'follows'] as const,
  followList: (publicId: string, direction: FollowDirection, nickname: string) =>
    ['sns', 'follows', publicId, direction, nickname] as const,
  relations: (kind: RelationKind) => ['sns', kind] as const,
}

export function snsErrorCode(error: unknown): number | undefined {
  return errorResponse(error)?.data?.errorCode
}

// 4xx(130000, 130001, 90002 등)는 다시 보내도 같은 답이라 재시도하지 않는다. 응답이 없거나 5xx만 한 번 더 보낸다.
function retryTransient(failureCount: number, error: unknown): boolean {
  const status = errorResponse(error)?.status
  return (status == null || status >= 500) && failureCount < 1
}

/** publicId가 없으면 내 프로필(GET /sns/me, 로그인 필요)을 읽는다. 다른 사용자 프로필은 비로그인도 된다. */
export function useSnsProfile(publicId?: string) {
  return useQuery({
    queryKey: publicId ? snsKeys.profile(publicId) : snsKeys.me,
    queryFn: async ({ signal }) =>
      (publicId ? await getSnsProfile(publicId, signal) : await getMySnsProfile(signal)).data,
    retry: retryTransient,
  })
}

// 팔로워, 팔로잉 목록은 totalCount가 항상 null이라 탭 수는 프로필의 수를 쓴다(FE 리뷰 포인트 4).
// 검색어가 바뀌면 키가 바뀌어 커서 없이 첫 페이지부터 다시 부른다(커서는 검색어에 묶인다, D1).
export function useFollowList(
  publicId: string,
  direction: FollowDirection,
  nickname: string,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: snsKeys.followList(publicId, direction, nickname),
    queryFn: async ({ pageParam, signal }) => {
      const fetcher = direction === 'followers' ? getFollowers : getFollowings
      const params = { cursor: pageParam, size: PAGE_SIZE, nickname: nickname || undefined }
      return (await fetcher(publicId, params, signal)).data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: data => data.pages.flatMap(page => page.items),
    retry: retryTransient,
    enabled,
  })
}

/** 차단, 뮤트 관리 목록. 탭 수는 첫 페이지의 totalCount를 쓴다(이후 페이지는 null). */
export function useRelationList(kind: RelationKind) {
  return useInfiniteQuery({
    queryKey: snsKeys.relations(kind),
    queryFn: async ({ pageParam, signal }) => {
      const fetcher = kind === 'blocks' ? getMyBlocks : getMyMutes
      return (await fetcher({ cursor: pageParam, size: PAGE_SIZE }, signal)).data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: (data: InfiniteData<SnsRelationPageResult>) => ({
      items: data.pages.flatMap(page => page.items),
      totalCount: data.pages[0]?.totalCount ?? 0,
    }),
    retry: retryTransient,
  })
}

export interface SnsToggleInput {
  kind: SnsToggleKind
  publicId: string
  /** true면 켜기(POST 201), false면 끄기(DELETE 204). 둘 다 반복해도 같은 응답이다. */
  on: boolean
}

const TOGGLE_FETCHERS: Record<SnsToggleKind, [(id: string) => Promise<unknown>, (id: string) => Promise<unknown>]> = {
  follow: [followUser, unfollowUser],
  block: [blockUser, unblockUser],
  mute: [muteUser, unmuteUser],
}

// 켜기와 끄기는 화면에서 수를 직접 더하지 않고 성공 뒤 서버 값을 다시 읽는다(design 6절 8).
// 실패하면 요청 전 화면을 그대로 두고, 대상 프로필만 다시 읽어 following/blockedByMe/mutedByMe로 버튼을 맞춘다
// (응답을 받지 못했거나 그사이 볼 수 없게 된 경우까지 한 번에 맞춘다).
export function useSnsToggle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, publicId, on }: SnsToggleInput) =>
      TOGGLE_FETCHERS[kind][on ? 0 : 1](publicId),
    onSuccess: async (_data, { kind, publicId, on }) => {
      if (kind === 'follow') {
        // 목록에서 누른 행은 그 행 버튼만 바꾸고 목록에 머문다(언팔로우해도 행은 남는다).
        queryClient.setQueriesData<InfiniteData<SnsUserPageResult>>({ queryKey: snsKeys.follows }, data =>
          data && {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              items: page.items.map(item => (item.publicId === publicId ? { ...item, following: on } : item)),
            })),
          },
        )
        // 대상과 목록 주인의 수가 바뀌므로 열려 있는 프로필과 내 프로필을 다시 읽는다.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: snsKeys.profiles }),
          queryClient.invalidateQueries({ queryKey: snsKeys.me }),
        ])
        return
      }
      if (kind === 'block') {
        // 차단은 두 방향 팔로우를 지워 수와 목록이 바뀐다.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: snsKeys.profile(publicId) }),
          queryClient.invalidateQueries({ queryKey: snsKeys.me }),
          queryClient.invalidateQueries({ queryKey: snsKeys.follows }),
          queryClient.invalidateQueries({ queryKey: snsKeys.relations('blocks') }),
        ])
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: snsKeys.profile(publicId) }),
        queryClient.invalidateQueries({ queryKey: snsKeys.relations('mutes') }),
      ])
    },
    onError: (_error, { publicId }) => queryClient.invalidateQueries({ queryKey: snsKeys.profile(publicId) }),
  })
}

export function snsToggleErrorMessage(error: unknown): string {
  switch (snsErrorCode(error)) {
    case SNS_UNAVAILABLE:
      return '볼 수 없는 계정이에요'
    case SNS_BLOCKED_BY_ME:
      return '차단한 계정이에요'
    default:
      return '요청을 처리하지 못했어요. 다시 시도해 주세요'
  }
}
