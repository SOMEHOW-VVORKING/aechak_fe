import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
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
  getSnsPost,
  getSnsProfile,
  muteUser,
  unblockUser,
  unfollowUser,
  unmuteUser,
  type SnsPostDetailResult,
  type SnsProfileResult,
  type SnsRelationItemResult,
  type SnsRelationPageResult,
  type SnsUserItemResult,
  type SnsUserPageResult,
} from '@aechak/api'
import { useIsLoggedIn } from '@/shared/auth'

// SNS-01(프로필, 팔로우, 차단, 뮤트)과 SNS-02(게시물, 해시태그)를 spec/contracts/sns.yaml에 붙이는 어댑터.
// 생성된 react-query 훅이 아니라 fetcher만 소비하고 여기서 자체 useQuery/useInfiniteQuery로 감싼다(AGENTS.md 6절).

export type SnsProfile = SnsProfileResult
export type SnsUserItem = SnsUserItemResult
export type SnsRelationItem = SnsRelationItemResult
export type SnsPost = SnsPostDetailResult
export type FollowDirection = 'followers' | 'followings'
export type RelationKind = 'blocks' | 'mutes'
export type SnsToggleKind = 'follow' | 'block' | 'mute'

/** 볼 수 없는 사용자(없음, 탈퇴, 온보딩 전, 나를 차단). 차단 사실을 드러내지 않으려고 한 코드로 온다(A7). */
export const SNS_UNAVAILABLE = 130000
/** 내가 차단한 사용자의 팔로워, 팔로잉 목록과 팔로우 요청. 내가 차단한 작성자의 게시물 상세(G4) */
export const SNS_BLOCKED_BY_ME = 130001
/** 자기 자신 팔로우 */
export const SNS_SELF_FOLLOW = 130300
/** 볼 수 없는 게시물(없음, 삭제, 작성자 탈퇴, 작성자가 나를 차단). 원인과 상관없이 삭제된 게시물 안내다(A7, P7) */
export const SNS_POST_UNAVAILABLE = 130400

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
  posts: ['sns', 'post'] as const,
  post: (publicId: string) => ['sns', 'post', publicId] as const,
}

export function snsErrorCode(error: unknown): number | undefined {
  return errorResponse(error)?.data?.errorCode
}

// 4xx(130000, 130001, 90002 등)는 다시 보내도 같은 답이라 재시도하지 않는다. 응답이 없거나 5xx만 한 번 더 보낸다.
function retryTransient(failureCount: number, error: unknown): boolean {
  const status = errorResponse(error)?.status
  return (status == null || status >= 500) && failureCount < 1
}

/**
 * 게시물 상세(GET /sns/posts/{publicId}). 비로그인도 된다. 프로필처럼 비로그인 응답과 로그인 응답의 보는 사람
 * 필드(isMine, following, mutedByMe)와 차단 판정이 달라 세션 상태를 키에 넣는다.
 */
export function useSnsPost(publicId: string) {
  const loggedIn = useIsLoggedIn()
  return useQuery({
    queryKey: [...snsKeys.post(publicId), loggedIn],
    queryFn: async ({ signal }) => (await getSnsPost(publicId, signal)).data,
    retry: retryTransient,
  })
}

/** publicId가 없으면 내 프로필(GET /sns/me, 로그인 필요)을 읽는다. 다른 사용자 프로필은 비로그인도 된다. */
export function useSnsProfile(publicId?: string) {
  // 같은 프로필도 비로그인 응답과 로그인 응답의 관계 필드가 다르다. 세션 상태가 바뀌면 캐시를 다시 쓰지 않는다.
  const loggedIn = useIsLoggedIn()
  return useQuery({
    queryKey: publicId ? [...snsKeys.profile(publicId), loggedIn] : snsKeys.me,
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

// 켜기, 끄기 뒤 다시 읽을 캐시(design 6절 8). 팔로우는 대상과 목록 주인의 수가 바뀌어 열려 있는 프로필 전부와
// 내 프로필, 차단은 두 방향 팔로우가 지워져 팔로우 목록까지, 뮤트는 대상 프로필과 뮤트 목록만 다시 읽는다.
// 팔로우와 뮤트는 게시물 상세의 following, mutedByMe도 바꾸므로 게시물 상세도 다시 읽는다(SNS-02 상세).
// 차단은 상세가 닫히고 이전 화면으로 가므로(P12) 열린 상세를 다시 읽지 않는다. 읽으면 닫히기 전에 차단 안내가 비친다.
// 대신 다음에 열 때 다시 읽도록 게시물 캐시를 낡은 것으로만 표시한다(아래 onSuccess).
const REFETCH_AFTER: Record<SnsToggleKind, (publicId: string) => QueryKey[]> = {
  follow: () => [snsKeys.profiles, snsKeys.me, snsKeys.posts],
  block: publicId => [snsKeys.profile(publicId), snsKeys.me, snsKeys.follows, snsKeys.relations('blocks')],
  mute: publicId => [snsKeys.profile(publicId), snsKeys.relations('mutes'), snsKeys.posts],
}

// 켜기와 끄기는 화면에서 수를 직접 더하지 않고 성공 뒤 서버 값을 다시 읽는다.
// 실패하면 요청 전 화면을 그대로 두고, 요청을 낸 화면(프로필, 팔로우 목록, 관리 목록)을 다시 읽어
// following/blockedByMe/mutedByMe로 버튼을 맞춘다. 응답을 받지 못했지만 서버는 반영한 경우와 그사이 볼 수 없게 된
// 경우까지 한 번에 맞춘다(design 6절 6).
export function useSnsToggle() {
  const queryClient = useQueryClient()
  const refetch = (keys: QueryKey[]) =>
    Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey })))
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
      }
      if (kind === 'block') {
        // 차단과 차단 해제는 게시물 상세 응답(403 130001)을 바꾼다. 다음에 열 때 캐시를 믿지 않고 서버에 다시 묻게 한다.
        void queryClient.invalidateQueries({ queryKey: snsKeys.posts, refetchType: 'none' })
      }
      await refetch(REFETCH_AFTER[kind](publicId))
    },
    // 재조회를 기다리지 않는다. 실패 안내와 행 잠금 해제가 재조회(와 그 재시도)에 묶이지 않게 한다.
    onError: (_error, { kind, publicId }) => {
      void refetch([
        ...REFETCH_AFTER[kind](publicId),
        // 성공 때는 행을 남기려고 목록을 다시 읽지 않지만, 실패하면 목록 행도 서버 값으로 맞춘다.
        ...(kind === 'follow' ? [snsKeys.follows] : []),
      ])
    },
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
