import { useEffect, useMemo } from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type Query,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from '@tanstack/react-query'
import {
  blockUser,
  customInstance,
  deleteSnsPost,
  errorResponse,
  followUser,
  getFollowers,
  getFollowings,
  getMyBlocks,
  getMySnsSaves,
  getMyMutes,
  getMySnsProfile,
  getSnsExploreFeed,
  getSnsFollowingFeed,
  getSnsPopularFeed,
  getSnsPost,
  getSnsProfile,
  getSnsUserPosts,
  getSnsUserReposts,
  getSnsUserVideos,
  muteUser,
  repostSnsPost,
  saveSnsPost,
  searchSnsHashtags,
  submitReport,
  unblockUser,
  unfollowUser,
  unmuteUser,
  unrepostSnsPost,
  unsaveSnsPost,
  updateSnsPost,
  type SnsFeedItemResult,
  type SnsFeedPageResult,
  type SnsPostCreateRequest,
  type SnsPostCreateResponse,
  type SnsPostDetailResult,
  type SnsPostGridItemResult,
  type SnsPostGridPageResult,
  type SnsPostUpdateRequest,
  type SnsProfileResult,
  type SnsRelationItemResult,
  type SnsRelationPageResult,
  type SnsUserItemResult,
  type SnsUserPageResult,
} from '@aechak/api'
import { useIsLoggedIn } from '@/shared/auth'

// SNS-01(프로필, 팔로우, 차단, 뮤트), SNS-02(게시물, 해시태그), SNS-03(피드, 리포스트, 저장, 프로필 탭)을
// spec/contracts/sns.yaml에 붙이는 어댑터. 생성된 react-query 훅이 아니라 fetcher만 소비하고 여기서 자체
// useQuery/useInfiniteQuery로 감싼다(AGENTS.md 6절).

export type SnsProfile = SnsProfileResult
export type SnsUserItem = SnsUserItemResult
export type SnsRelationItem = SnsRelationItemResult
export type SnsPost = SnsPostDetailResult
export type SnsFeedItem = SnsFeedItemResult
export type SnsFeedKind = 'following' | 'explore' | 'popular'
export type SnsGridItem = SnsPostGridItemResult
/** 프로필 게시물 탭. 저장됨은 내 프로필에만 있다 */
export type SnsProfileTab = 'grid' | 'video' | 'repost' | 'saved'
export type SnsUserPostTab = Exclude<SnsProfileTab, 'saved'>
export type FollowDirection = 'followers' | 'followings'
export type RelationKind = 'blocks' | 'mutes'
export type SnsToggleKind = 'follow' | 'block' | 'mute'
export type SnsReactionKind = 'repost' | 'save'

/**
 * 볼 수 없는 사용자(없음, 탈퇴, 온보딩 전). 팔로워, 팔로잉 목록과 팔로우 요청은 나를 차단한 사용자에게도 이 코드다.
 * 프로필 조회는 나를 차단한 사용자를 200 blockingMe=true 기본 프로필로 준다(R2-06).
 */
export const SNS_UNAVAILABLE = 130000
/** 내가 차단한 사용자의 팔로워, 팔로잉 목록과 팔로우 요청. 내가 차단한 작성자의 게시물 상세(G4) */
export const SNS_BLOCKED_BY_ME = 130001
/** 자기 자신 팔로우 */
export const SNS_SELF_FOLLOW = 130300
/** 볼 수 없는 게시물(없음, 삭제, 작성자 탈퇴, 작성자가 나를 차단). 원인과 상관없이 삭제된 게시물 안내다(A7, P7) */
export const SNS_POST_UNAVAILABLE = 130400
/** 본인 게시물이 아닌 수정, 삭제 */
export const SNS_POST_NOT_MINE = 130401
/** 없거나 이미 쓴 tmp key. 작성 화면을 연 채 버킷 수명 규칙(expire-tmp)이 tmp 원본을 지웠을 때도 온다 */
export const SNS_UPLOAD_NOT_FOUND = 100001
/** 본인 원글 리포스트(SNS-03 초안). 리포스트 버튼은 본인 글에서 잠겨 있어 다시 실행한 요청에서만 온다 */
export const SNS_REPOST_OWN_POST = 130600
/** 이용 제한(RESTRICTED) 계정의 SNS 쓰기(UserStatusFilter) */
export const SNS_ACCOUNT_RESTRICTED = 20013
/** 잘못되거나 만료된 커서(인기 피드 31분, Redis 장애 포함). 그 목록을 첫 페이지부터 다시 연다(sns.yaml SNS-03 FE 3) */
export const SNS_INVALID_CURSOR = 90002

const PAGE_SIZE = 20
/** 게시물 하나에 다는 해시태그 상한(A8). 넘으면 서버도 130406으로 거부한다 */
export const HASHTAG_MAX = 30
const HASHTAG_SEARCH_SIZE = 20

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
  hashtags: (query: string) => ['sns', 'hashtags', query] as const,
  // 피드는 profiles 밖에 둔다. 팔로우 성공이 profiles를 무효화해 그 아래에 두면 모든 피드 페이지를 다시 읽는다(design 6절 3번).
  feeds: ['sns', 'feed'] as const,
  feed: (kind: SnsFeedKind, loggedIn: boolean) => ['sns', 'feed', kind, loggedIn] as const,
  // 프로필 탭도 같은 이유로 profiles 밖에 둔다(design 6절 3번).
  userPostLists: ['sns', 'user-posts'] as const,
  userPosts: (publicId: string, tab: SnsUserPostTab, loggedIn: boolean) =>
    ['sns', 'user-posts', publicId, tab, loggedIn] as const,
  // 저장됨은 로그인한 나만 본다. 로그아웃과 세션 만료가 캐시를 비운다.
  saves: () => ['sns', 'saves'] as const,
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
export function useSnsPost(publicId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const loggedIn = useIsLoggedIn()
  return useQuery({
    queryKey: [...snsKeys.post(publicId), loggedIn],
    queryFn: async ({ signal }) => (await getSnsPost(publicId, signal)).data,
    retry: retryTransient,
    enabled,
  })
}

/**
 * 수정(PATCH). 바뀐 것이 없어도 204이고 수정됨 표시는 다시 읽은 상세의 edited를 따른다(P8). 그사이 지운
 * 게시물(404 130400)이면 상세도 다시 읽는다. 캐시를 그대로 두면 돌아간 상세가 지운 게시물을 그린다.
 * 성공하면 받아 둔 피드 카드도 다시 읽은 상세로 바꾸고 프로필 탭은 다음에 열 때 다시 읽는다. 그대로 두면 staleTime 안에
 * 돌아간 목록이 고치기 전 내용을 그린다.
 */
export function useUpdateSnsPost(publicId: string) {
  const queryClient = useQueryClient()
  const refetchPost = () => queryClient.invalidateQueries({ queryKey: snsKeys.post(publicId) })
  return useMutation({
    mutationFn: (body: SnsPostUpdateRequest) => updateSnsPost(publicId, body),
    onSuccess: async () => {
      await refetchPost()
      // 수정은 로그인한 작성자만 해서 로그인 응답 상세를 읽는다. 피드는 다시 읽으면 보던 위치를 잃어 그 카드만 바꾼다.
      const detailKey = [...snsKeys.post(publicId), true]
      const post = queryClient.getQueryData<SnsPost>(detailKey)
      // invalidateQueries는 다시 읽기 실패를 알리지 않고 상세에는 고치기 전 내용이 남는다. 그 내용을 적으면 피드가 새로 받은
      // 것으로 표시돼 다시 읽지 않는다. 다시 읽지 못했으면 피드를 낡은 것으로만 표시해 다음에 열 때 다시 읽는다.
      if (post && queryClient.getQueryState(detailKey)?.isInvalidated === false) {
        const { caption, hashtags, edited } = post
        queryClient.setQueriesData<InfiniteData<SnsFeedPageResult>>({ queryKey: snsKeys.feeds }, data =>
          mapPages(data, items =>
            items.map(item =>
              item.post.publicId === publicId ? { ...item, post: { ...item.post, caption, hashtags, edited } } : item,
            ),
          ),
        )
      } else {
        void queryClient.invalidateQueries({ queryKey: snsKeys.feeds, refetchType: 'none' })
      }
      // 프로필 탭 칸의 본문 앞부분(captionPreview)은 서버가 잘라 주므로 칸은 고치지 않고 다음에 열 때 다시 읽는다.
      void queryClient.invalidateQueries({ queryKey: snsKeys.userPostLists })
      void queryClient.invalidateQueries({ queryKey: snsKeys.saves() })
    },
    onError: error => {
      if (snsErrorCode(error) === SNS_POST_UNAVAILABLE) void refetchPost()
    },
  })
}

/**
 * 삭제(DELETE). 다른 기기에서 이미 지운 게시물(404 130400)도 지운 것으로 본다(AC-SNS02-027). 게시물 수가 바뀌어 내
 * 프로필을 다시 읽는다. 상세 캐시는 다음에 열 때 다시 읽도록 낡은 것으로만 표시한다. 지우면 이전 화면으로 가기 전의
 * 열린 상세가 스켈레톤을 그리고 지운 게시물을 다시 읽는다(차단과 같다). 피드 카드에서도 지우므로 대상은 mutate로 받는다.
 */
export function useDeleteSnsPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (publicId: string) => {
      try {
        await deleteSnsPost(publicId)
      } catch (error) {
        if (snsErrorCode(error) !== SNS_POST_UNAVAILABLE) throw error
      }
    },
    onSuccess: async (_data, publicId) => {
      void queryClient.invalidateQueries({ queryKey: snsKeys.post(publicId), refetchType: 'none' })
      // 받아 둔 피드와 프로필 탭에서 그 게시물을 바로 뺀다(design 6절 4번). 다시 읽으면 보던 위치를 잃는다.
      await Promise.all([
        removeFromLists<InfiniteData<SnsFeedPageResult>>(queryClient, { queryKey: snsKeys.feeds }, data =>
          mapPages(data, items => items.filter(item => item.post.publicId !== publicId)),
        ),
        removeGridCell(queryClient, { queryKey: snsKeys.userPostLists }, publicId),
        removeGridCell(queryClient, { queryKey: snsKeys.saves() }, publicId),
      ])
      return refetchMyProfiles(queryClient)
    },
  })
}

/** 게시물 수가 바뀐 내 프로필. 내 프로필(GET /sns/me)과 주소로 연 내 공개 프로필(GET /sns/users/{내 publicId})이다 */
function refetchMyProfiles(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: snsKeys.me }),
    queryClient.invalidateQueries({
      queryKey: snsKeys.profiles,
      predicate: query => (query.state.data as SnsProfile | undefined)?.isMe === true,
    }),
  ])
}

export interface CreateSnsPostInput {
  /** 작성 화면을 열 때 만든 키. 그 화면의 모든 게시 시도에 같은 값을 보낸다(design 6절 2번) */
  idempotencyKey: string
  body: SnsPostCreateRequest
}

// orval이 header 파라미터를 생성하지 않아 Idempotency-Key는 customInstance로 직접 붙인다(주문그룹 생성과 같다).
export function createSnsPostWithKey(input: CreateSnsPostInput): Promise<SnsPostCreateResponse> {
  return customInstance<SnsPostCreateResponse>({
    url: '/sns/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
    data: input.body,
  })
}

/**
 * 게시. 201이면 게시물 수가 바뀌어 내 프로필을 다시 읽는다(SNS-T04부터 postCount가 오른다). 내 프로필 탭도 무효화해
 * 다음에 열 때 새 글이 맨 위에 나오게 한다. 그대로 두면 staleTime 안에는 수만 오르고 칸은 그대로다.
 */
export function useCreateSnsPost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSnsPostInput) => (await createSnsPostWithKey(input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: snsKeys.userPostLists, predicate: query => query.meta?.['mine'] === true })
      return refetchMyProfiles(queryClient)
    },
  })
}

// 이용 제한(RESTRICTED) 계정의 SNS 쓰기(20013). 게시, 수정, 삭제와 켜기, 끄기가 같은 문구다.
const RESTRICTED_COPY = '이용이 제한된 계정이라 이 기능을 사용할 수 없어요'

// 게시, 수정, 삭제 실패 문구. 게시물 규칙(1304xx)과 해시태그 규칙(1305xx)은 코드별로 알리고 입력은 남긴다.
// 키와 요청 형식 오류(100002, 100003, 90001, 90004)와 서버 오류는 일반 실패 문구다.
const POST_ERROR_COPY: Record<number, string> = {
  [SNS_ACCOUNT_RESTRICTED]: RESTRICTED_COPY,
  130402: '캡션이나 사진, 영상 중 하나는 있어야 해요',
  130403: '캡션은 2,200자까지 쓸 수 있어요',
  130404: '사진은 10장까지, 영상은 1개만 올릴 수 있어요',
  130405: '쓸 수 없는 단어가 많아 올릴 수 없어요. 내용을 고쳐 주세요',
  130406: '해시태그는 30개까지 달 수 있어요',
  130407: '60초 이하 영상만 올릴 수 있어요',
  130500: '해시태그는 한글, 영문, 숫자, 밑줄만 쓸 수 있어요',
  130501: '해시태그는 30자 이하로 써 주세요',
  130502: '쓸 수 없는 단어가 든 해시태그가 있어요',
}

const RATE_LIMITED_COPY = '잠시 후 다시 시도해 주세요'

// 빈도 제한은 errorCode가 아니라 HTTP 429로 분기한다(sns.yaml SNS-03 FE 5). develop의 90006은 404 경로 없음이라
// errorCode로 보면 아직 그 경로가 없는 BE를 부를 때 잠시 후 다시 시도 안내가 나온다.
const isRateLimited = (error: unknown) => errorResponse(error)?.status === 429

export function snsPostErrorMessage(error: unknown, fallback: string): string {
  if (isRateLimited(error)) return RATE_LIMITED_COPY
  const code = snsErrorCode(error)
  return (code != null && POST_ERROR_COPY[code]) || fallback
}

/**
 * 해시태그 자동완성(GET /sns/hashtags). 빈 검색어는 EMPTY와 추천 태그다. 입력이 바뀌는 동안 이전 결과를 남겨
 * 목록이 깜빡이지 않게 한다. 검색어 정규화와 상태 판정은 서버가 한다(design 6절 6번).
 */
export function useHashtagSearch(query: string) {
  return useQuery({
    queryKey: snsKeys.hashtags(query),
    // 빈 검색어는 키째 뺀다(AGENTS.md 6절 6). 서버는 검색어가 없으면 EMPTY로 답한다.
    queryFn: async ({ signal }) =>
      (await searchSnsHashtags({ query: query || undefined, size: HASHTAG_SEARCH_SIZE }, signal)).data,
    placeholderData: keepPreviousData,
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
        // 화면에 없는 목록은 받아 둔 행만 고치면 새로 팔로우한 사람이 빠진 채 남는다. 다음에 열 때 다시 읽게 낡은 것으로만 표시한다.
        void queryClient.invalidateQueries({
          queryKey: snsKeys.follows,
          refetchType: 'none',
          predicate: query => query.getObserversCount() === 0,
        })
      }
      if (kind === 'block') {
        // 차단과 차단 해제는 게시물 상세 응답(403 130001)을 바꾼다. 다음에 열 때 캐시를 믿지 않고 서버에 다시 묻게 한다.
        void queryClient.invalidateQueries({ queryKey: snsKeys.posts, refetchType: 'none' })
      }
      await refetch(REFETCH_AFTER[kind](publicId))
      // 차단, 뮤트와 그 해제 뒤에는 숨었던 글이 다시 나오고 새로 숨을 글이 빠져야 해서 받아 둔 피드, 프로필 탭, 저장됨을
      // 지운다(design 6절 7번). 열린 목록은 이 mutation을 쓰는 화면이 다시 그릴 때 첫 페이지부터 다시 읽는다. 팔로우는
      // 다음 페이지부터 반영된다(G3).
      if (kind !== 'follow') {
        queryClient.removeQueries({ queryKey: snsKeys.feeds })
        queryClient.removeQueries({ queryKey: snsKeys.userPostLists })
        queryClient.removeQueries({ queryKey: snsKeys.saves() })
      }
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

// 켜기와 끄기 실패 문구. 팔로우, 차단, 뮤트와 SNS-03의 리포스트, 저장이 같이 쓴다. 게시물이 사라졌으면(130400)
// 원인과 상관없이 삭제된 게시물 안내다(A7).
export function snsToggleErrorMessage(error: unknown): string {
  if (isRateLimited(error)) return RATE_LIMITED_COPY
  switch (snsErrorCode(error)) {
    case SNS_UNAVAILABLE:
      return '볼 수 없는 계정이에요'
    case SNS_BLOCKED_BY_ME:
      return '차단한 계정이에요'
    case SNS_POST_UNAVAILABLE:
      return '삭제된 게시물이에요'
    case SNS_REPOST_OWN_POST:
      return '내 게시물은 리포스트할 수 없어요'
    case SNS_ACCOUNT_RESTRICTED:
      return RESTRICTED_COPY
    default:
      return '요청을 처리하지 못했어요. 다시 시도해 주세요'
  }
}

// ── SNS-03 피드 ─────────────────────────────────────────────────────────────

const FEED_FETCHERS = {
  following: getSnsFollowingFeed,
  explore: getSnsExploreFeed,
  popular: getSnsPopularFeed,
} satisfies Record<SnsFeedKind, unknown>

/** 받아 둔 목록 페이지의 항목을 바꾼다. 데이터가 없는 캐시는 그대로 둔다 */
function mapPages<T extends { items: unknown[] }>(
  data: InfiniteData<T> | undefined,
  map: (items: T['items']) => T['items'],
) {
  return data && { ...data, pages: data.pages.map(page => ({ ...page, items: map(page.items) })) }
}

/**
 * 받아 둔 목록에서 항목을 뺀다. 빼기 전에 보낸 목록 조회는 뺀 항목을 다시 들고 올 수 있어 멈추고 뺀 뒤 그 목록만 다시
 * 읽는다. 멈춘 조회는 조회 전 데이터로 돌아가고 첫 조회였으면 다시 읽어야 끝난다. 받는 중이 아니던 목록은 다시 읽지 않는다.
 */
async function removeFromLists<T>(
  queryClient: QueryClient,
  filters: QueryFilters,
  remove: (data: T | undefined) => T | undefined,
) {
  const fetching = queryClient.getQueryCache().findAll(filters).filter(query => query.state.fetchStatus !== 'idle')
  await queryClient.cancelQueries(filters)
  queryClient.setQueriesData<T>(filters, remove)
  if (fetching.length > 0) void queryClient.invalidateQueries({ predicate: query => fetching.includes(query) })
}

/** 받아 둔 프로필 탭에서 그 게시물 칸을 뺀다 */
function removeGridCell(queryClient: QueryClient, filters: QueryFilters, publicId: string) {
  return removeFromLists<InfiniteData<SnsPostGridPageResult>>(queryClient, filters, data =>
    mapPages(data, items => items.filter(item => item.publicId !== publicId)),
  )
}

// 팔로잉 피드는 페이지 사이에 같은 원글이 다시 올 수 있다(G3). 먼저 받은 자리 하나만 남긴다(design 6절 6번).
function selectFeedItems(data: InfiniteData<SnsFeedPageResult>): SnsFeedItem[] {
  const seen = new Set<string>()
  return data.pages
    .flatMap(page => page.items)
    .filter(item => {
      if (seen.has(item.post.publicId)) return false
      seen.add(item.post.publicId)
      return true
    })
}

// 다음 페이지나 다시 읽기가 400 90002면 그 목록을 첫 페이지부터 다시 연다(design 6절 6번). 첫 페이지는 커서가 없어
// 90002가 오지 않으므로 받아 둔 페이지가 있을 때만 본다.
function useRestartOnInvalidCursor(queryKey: QueryKey, error: unknown, hasData: boolean) {
  const queryClient = useQueryClient()
  const invalid = hasData && snsErrorCode(error) === SNS_INVALID_CURSOR
  useEffect(() => {
    if (invalid) void queryClient.resetQueries({ queryKey, exact: true })
  }, [invalid, queryKey, queryClient])
}

/**
 * 피드(GET /sns/feeds/{kind}). 비로그인 응답과 로그인 응답의 보는 사람 필드가 달라 세션 상태를 키에 넣는다.
 * 팔로잉 피드는 로그인 필요라 비로그인이면 부르지 않는다.
 */
export function useSnsFeed(kind: SnsFeedKind) {
  const loggedIn = useIsLoggedIn()
  const queryKey = useMemo(() => snsKeys.feed(kind, loggedIn), [kind, loggedIn])
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }) =>
      (await FEED_FETCHERS[kind]({ cursor: pageParam, size: PAGE_SIZE }, signal)).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectFeedItems,
    retry: retryTransient,
    enabled: kind !== 'following' || loggedIn,
  })
  useRestartOnInvalidCursor(queryKey, query.error, query.data != null)
  return query
}

// ── SNS-03 리포스트, 저장 ───────────────────────────────────────────────────

const REACTION_FETCHERS: Record<SnsReactionKind, [(id: string) => Promise<unknown>, (id: string) => Promise<unknown>]> = {
  repost: [repostSnsPost, unrepostSnsPost],
  save: [saveSnsPost, unsaveSnsPost],
}

/** 리포스트는 상태가 바뀔 때만 수를 1 올리거나 내린다. 저장은 어떤 수도 바꾸지 않는다(A23) */
function withReaction(post: SnsPost, kind: SnsReactionKind, on: boolean): SnsPost {
  if (kind === 'save') return post.saved === on ? post : { ...post, saved: on }
  if (post.reposted === on) return post
  return { ...post, reposted: on, repostCount: Math.max(0, post.repostCount + (on ? 1 : -1)) }
}

const feedHasPost = (data: unknown, publicId: string) =>
  (data as InfiniteData<SnsFeedPageResult> | undefined)?.pages.some(page =>
    page.items.some(item => item.post.publicId === publicId),
  ) ?? false

/** 그 게시물이 든 캐시(상세, 피드 항목의 post)를 바꾼다 */
function setReaction(queryClient: QueryClient, kind: SnsReactionKind, publicId: string, on: boolean) {
  queryClient.setQueriesData<SnsPost>({ queryKey: snsKeys.post(publicId) }, post => post && withReaction(post, kind, on))
  queryClient.setQueriesData<InfiniteData<SnsFeedPageResult>>({ queryKey: snsKeys.feeds }, data =>
    mapPages(data, items =>
      items.map(item => (item.post.publicId === publicId ? { ...item, post: withReaction(item.post, kind, on) } : item)),
    ),
  )
}

// 같은 게시물에 이어서 누른 요청 묶음. latest는 마지막으로 누른 요청이고 confirmed는 성공한 요청까지 반영한 서버 값이다.
// 묶음의 첫 confirmed는 바꾸기 전 캐시 값이다. 누른 값의 반대로 짐작하면 이미 켜진 글에 다시 켜기를 보내는 로그인 뒤 다시
// 실행(A26)이 실패했을 때 꺼진 상태로 되돌린다. 받아 둔 곳이 없어 모르면 되돌리지 않는다. 요청은 차례로 가므로 앞 요청의
// 실패는 뒤 요청이 덮는다. 마지막 요청이 실패할 때만 confirmed로 되돌린다.
interface ReactionRun {
  latest: number
  confirmed: boolean | undefined
}
const reactionRuns = new WeakMap<QueryClient, Map<string, ReactionRun>>()
let reactionSeq = 0

function runsOf(queryClient: QueryClient) {
  let runs = reactionRuns.get(queryClient)
  if (!runs) reactionRuns.set(queryClient, (runs = new Map()))
  return runs
}

/** 로그인 응답(상세, 피드 항목)에 받아 둔 그 게시물의 반응 값. 받아 둔 곳이 없으면 undefined */
function cachedReaction(queryClient: QueryClient, kind: SnsReactionKind, publicId: string): boolean | undefined {
  const post =
    queryClient.getQueryData<SnsPost>([...snsKeys.post(publicId), true]) ??
    queryClient
      .getQueriesData<InfiniteData<SnsFeedPageResult>>({ queryKey: snsKeys.feeds, predicate: query => query.queryKey[3] === true })
      .flatMap(([, data]) => data?.pages.flatMap(page => page.items) ?? [])
      .find(item => item.post.publicId === publicId)?.post
  return post && (kind === 'repost' ? post.reposted : post.saved)
}

/**
 * 리포스트, 저장 켜기(POST 201)와 끄기(DELETE 204). design 6절 5번이다. 누르는 즉시 받는 중인 조회를 멈추고 그 게시물이 든
 * 캐시를 바꾼 뒤 요청을 보낸다. 같은 게시물의 요청은 scope로 차례로 보낸다. 빠르게 켜고 끄면 POST와 DELETE가 거꾸로 도착할
 * 수 있고 응답에 본문이 없어(D3) 서버와 화면이 어긋나도 맞출 수 없기 때문이다. 실패하면 되돌리고 안내는 부른 화면이 띄운다.
 */
export function useSnsReaction(kind: SnsReactionKind, publicId: string) {
  const queryClient = useQueryClient()
  const id = `${kind}:${publicId}`
  return useMutation({
    scope: { id },
    mutationFn: (on: boolean) => REACTION_FETCHERS[kind][on ? 0 : 1](publicId),
    // 멈춘 조회는 조회 전 값으로 돌아가므로 멈춘 뒤에 바꾼다. 차례를 기다리는 요청도 누른 즉시 여기까지 온다.
    onMutate: on => {
      const runs = runsOf(queryClient)
      const seq = ++reactionSeq
      const run = runs.get(id)
      runs.set(id, { latest: seq, confirmed: run ? run.confirmed : cachedReaction(queryClient, kind, publicId) })
      void queryClient.cancelQueries({ queryKey: snsKeys.post(publicId) })
      void queryClient.cancelQueries({ queryKey: snsKeys.feeds, predicate: query => feedHasPost(query.state.data, publicId) })
      setReaction(queryClient, kind, publicId, on)
      return seq
    },
    onSuccess: (_data, on) => {
      const run = runsOf(queryClient).get(id)
      if (run) run.confirmed = on
      // 내 리포스트 탭과 저장됨은 끄면 그 칸을 빼고 켜면 다음에 열 때 맨 위에 나오게 다시 읽는다. 끼워 넣지 않는다(P6).
      const mine: QueryFilters =
        kind === 'repost'
          ? { queryKey: snsKeys.userPostLists, predicate: isMyRepostTab }
          : { queryKey: snsKeys.saves() }
      if (on) void queryClient.invalidateQueries(mine)
      else void removeGridCell(queryClient, mine, publicId)
    },
    onError: (_error, _on, seq) => {
      const run = runsOf(queryClient).get(id)
      if (run && run.latest === seq && run.confirmed !== undefined) setReaction(queryClient, kind, publicId, run.confirmed)
    },
    // 묶음이 끝나면 열린 상세를 서버 값으로 다시 맞춘다. 멈춘 조회도 여기서 다시 읽는다. 피드는 다시 읽으면 보던 위치를
    // 잃어 바꾼 값을 그대로 둔다. 기다리지 않는다. 기다리면 그사이 누른 다음 요청이 이 조회 뒤로 밀린다.
    onSettled: (_data, _error, _on, seq) => {
      const runs = runsOf(queryClient)
      const run = runs.get(id)
      if (!run || run.latest !== seq) return
      runs.delete(id)
      // 묶음 중에 새로 시작한 피드 조회(지금 탭 다시 누르기, 포커스 재조회)는 서버 반영 전 값을 받아 왔을 수 있어 서버 값을
      // 한 번 더 적는다. 같은 값이면 그대로 두어 수가 두 번 바뀌지 않는다.
      if (run.confirmed !== undefined) setReaction(queryClient, kind, publicId, run.confirmed)
      // 아직 받는 중인 피드 조회는 그 뒤에 도착해 반영 전 값으로 덮어쓴다. 멈추고 서버 값을 다시 읽는다.
      void removeFromLists(queryClient, { queryKey: snsKeys.feeds }, data => data)
      void queryClient.invalidateQueries({ queryKey: snsKeys.post(publicId) })
    },
  })
}

// ── SNS-03 프로필 탭 ────────────────────────────────────────────────────────

const GRID_FETCHERS = {
  grid: getSnsUserPosts,
  video: getSnsUserVideos,
  repost: getSnsUserReposts,
} satisfies Record<SnsUserPostTab, unknown>

const selectGridItems = (data: InfiniteData<SnsPostGridPageResult>) => data.pages.flatMap(page => page.items)

/** 내 프로필의 리포스트 탭. 목록 주인이 나인지는 useSnsPostGrid가 남긴 meta.mine으로 안다 */
function isMyRepostTab(query: Query) {
  return query.queryKey[3] === 'repost' && query.meta?.['mine'] === true
}

/**
 * 프로필 그리드, 영상, 리포스트 탭(GET /sns/users/{publicId}/{posts|videos|reposts})과 저장됨 탭(GET /sns/me/saves).
 * 저장됨은 내 프로필에서만 부르고 나머지는 비로그인도 된다. 이어 불러오기와 90002 재시작은 피드와 같다. 차단 관계
 * 프로필(blockedByMe, blockingMe)에서는 부르지 않는다(SNS-F04).
 */
export function useSnsPostGrid(profile: SnsProfile | undefined, tab: SnsProfileTab) {
  const loggedIn = useIsLoggedIn()
  const owner = profile?.publicId ?? ''
  const queryKey = useMemo(
    () => (tab === 'saved' ? snsKeys.saves() : snsKeys.userPosts(owner, tab, loggedIn)),
    [owner, tab, loggedIn],
  )
  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const params = { cursor: pageParam, size: PAGE_SIZE }
      return (tab === 'saved' ? await getMySnsSaves(params, signal) : await GRID_FETCHERS[tab](owner, params, signal))
        .data
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectGridItems,
    retry: retryTransient,
    enabled: profile != null && !profile.blockedByMe && !profile.blockingMe && (tab !== 'saved' || profile.isMe),
    meta: { mine: profile?.isMe === true },
  })
  useRestartOnInvalidCursor(queryKey, query.error, query.data != null)
  return query
}

// ── SNS-07 신고 ─────────────────────────────────────────────────────────────

/** 신고 대상. 게시물은 게시물 publicId(리포스트 카드는 원글), 사용자는 사용자 publicId다 */
export interface SnsReportTarget {
  type: 'SNS_POST' | 'SNS_USER'
  publicId: string
  nickname: string
  profileImageUrl: string | null
  /** 게시물 대상 카드에 한 줄로 보이는 캡션 */
  caption?: string | null
}

export type SnsReportReason = 'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'FRAUD' | 'OTHER'

export const postReportTarget = (post: SnsPost): SnsReportTarget => ({
  type: 'SNS_POST',
  publicId: post.publicId,
  nickname: post.author.nickname,
  profileImageUrl: post.author.profileImageUrl,
  caption: post.caption,
})

/** 이미 신고한 대상(409). 응답을 받지 못하고 다시 보낸 신고도 이 코드라 접수 확인으로 본다(P6, P15) */
const ALREADY_REPORTED = [130802, 30202]

export const isAlreadyReported = (error: unknown) => ALREADY_REPORTED.includes(snsErrorCode(error) ?? -1)

/** 신고 접수(POST /reports). 공백만 적은 상세 내용은 비운 것으로 보내고 서버도 그렇게 본다(P5) */
export function useSubmitSnsReport() {
  return useMutation({
    mutationFn: async ({
      target,
      reasonCode,
      reasonText,
    }: {
      target: SnsReportTarget
      reasonCode: SnsReportReason
      reasonText: string
    }) => {
      const text = reasonText.trim()
      await submitReport({
        targetType: target.type,
        targetId: target.publicId,
        reasonCode,
        reasonText: text === '' ? null : text,
      })
    },
  })
}

// 신고 실패 문구. 시트에 그대로 두고 다시 제출할 수 있게 한다. 게시물이 사라졌으면(130400) 원인과 상관없이 삭제된 게시물 안내다(A7).
const REPORT_ERROR_COPY: Record<number, string> = {
  130802: '이미 신고한 게시물이에요',
  30202: '이미 신고한 계정이에요',
  [SNS_POST_UNAVAILABLE]: '삭제된 게시물이에요',
  [SNS_BLOCKED_BY_ME]: '차단한 계정의 게시물이에요',
  130800: '내 게시물은 신고할 수 없어요',
  130801: '기타 사유는 상세 내용을 적어 주세요',
  30201: '기타 사유는 상세 내용을 적어 주세요',
  [SNS_UNAVAILABLE]: '볼 수 없는 계정이에요',
  30200: '나 자신은 신고할 수 없어요',
}

export function snsReportErrorMessage(error: unknown): string {
  const code = snsErrorCode(error)
  return (code != null && REPORT_ERROR_COPY[code]) || '신고를 접수하지 못했어요. 다시 시도해 주세요'
}
