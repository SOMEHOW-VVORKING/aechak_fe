import { http, HttpResponse } from 'msw'
import { axiosInstance, type SnsPetResult } from '@aechak/api'

// SNS-01, SNS-02 계약(spec/contracts/sns.yaml) 상태형 MSW. 사용자와 팔로우, 차단, 뮤트 관계, 게시물을 메모리에 두고
// 계약의 판정 순서를 그대로 흉내 낸다. 보는 사람은 Authorization 헤더가 있을 때만 seedSns({ viewer })의 사용자이고
// 헤더가 없으면 비로그인이다(프로필과 게시물 상세는 관계 필드가 모두 false, 나머지는 401 20004).
const base = axiosInstance.defaults.baseURL ?? ''
export const SNS_PROFILE_URL = `${base}/sns/users/:publicId`
export const SNS_ME_URL = `${base}/sns/me`
export const SNS_FOLLOWERS_URL = `${base}/sns/users/:publicId/followers`
export const SNS_FOLLOWINGS_URL = `${base}/sns/users/:publicId/followings`
export const SNS_FOLLOW_URL = `${base}/sns/users/:publicId/follow`
export const SNS_BLOCK_URL = `${base}/sns/users/:publicId/block`
export const SNS_MUTE_URL = `${base}/sns/users/:publicId/mute`
export const SNS_MY_BLOCKS_URL = `${base}/sns/me/blocks`
export const SNS_MY_MUTES_URL = `${base}/sns/me/mutes`
export const SNS_POSTS_URL = `${base}/sns/posts`
export const SNS_POST_URL = `${base}/sns/posts/:publicId`
export const SNS_HASHTAGS_URL = `${base}/sns/hashtags`
export const SNS_REPOST_URL = `${base}/sns/posts/:publicId/repost`
export const SNS_SAVE_URL = `${base}/sns/posts/:publicId/save`
export const SNS_FOLLOWING_FEED_URL = `${base}/sns/feeds/following`
export const SNS_EXPLORE_FEED_URL = `${base}/sns/feeds/explore`
export const SNS_POPULAR_FEED_URL = `${base}/sns/feeds/popular`
export const SNS_USER_POSTS_URL = `${base}/sns/users/:publicId/posts`
export const SNS_USER_VIDEOS_URL = `${base}/sns/users/:publicId/videos`
export const SNS_USER_REPOSTS_URL = `${base}/sns/users/:publicId/reposts`
export const SNS_MY_SAVES_URL = `${base}/sns/me/saves`
export const SNS_POST_LIKE_URL = `${base}/sns/posts/:publicId/like`
export const SNS_POST_LIKERS_URL = `${base}/sns/posts/:publicId/likers`
export const SNS_COMMENTS_URL = `${base}/sns/posts/:publicId/comments`
export const SNS_COMMENT_URL = `${base}/sns/comments/:commentPublicId`
export const SNS_COMMENT_LIKE_URL = `${base}/sns/comments/:commentPublicId/like`
export const SNS_COMMENT_LIKERS_URL = `${base}/sns/comments/:commentPublicId/likers`
export const SNS_SEARCH_POSTS_URL = `${base}/sns/search/posts`
export const SNS_SEARCH_USERS_URL = `${base}/sns/search/users`
export const SNS_SEARCH_HASHTAGS_URL = `${base}/sns/search/hashtags`
export const SNS_HASHTAG_POSTS_URL = `${base}/sns/hashtags/:name/posts`

export const SNS_ME = '01JB7XQ2M4K9TR3N5W8YZC6DHF'
export const SNS_COCO = '01JABCDEF0123456789ABCDEFG'
export const SNS_MONG = '01JC2D8FMK4N7P9QRS3TVWXYZ5'
export const SNS_CHOCO = '01JE3F6GH9JK2M5NP8QRS4TVWX'
export const SNS_SPAM = '01JD5G7HJK8M2N4PQ6RSTV9WXY'
export const SNS_TORI = '01JF8H2JK4M6N8PQ2RSTV5WXYZ'
/** 나(SNS_ME)를 차단한 사용자 */
export const SNS_BLOCKER = '01JG9J3KM5N7P9QR3STV6WXYZA'
/** 나(SNS_ME)와 서로 차단한 사용자 */
export const SNS_MUTUAL = '01JH4K6MN8P2QR5ST7VW9XYZAB'

interface SnsUserFixture {
  nickname: string
  profileImageUrl: string | null
  bio: string | null
  pets: SnsPetResult[]
}

const USERS: Record<string, SnsUserFixture> = {
  [SNS_ME]: { nickname: '보리언니', profileImageUrl: null, bio: '보리와 산책 기록', pets: [{ breedLabel: '푸들', birthYearMonth: '2020-11' }] },
  [SNS_COCO]: {
    nickname: '코코집사',
    profileImageUrl: 'https://cdn.aechak.com/users/profile/abc.webp',
    bio: '코코와 삽니다',
    pets: [
      { breedLabel: '골든리트리버', birthYearMonth: '2021-03' },
      { breedLabel: '말티즈', birthYearMonth: null },
    ],
  },
  [SNS_MONG]: {
    nickname: '몽이아빠',
    profileImageUrl: null,
    bio: null,
    pets: [
      { breedLabel: '골든리트리버', birthYearMonth: '2019-05' },
      { breedLabel: '시바견', birthYearMonth: '2022-01' },
    ],
  },
  [SNS_CHOCO]: { nickname: '초코맘', profileImageUrl: null, bio: null, pets: [] },
  [SNS_SPAM]: { nickname: '광고계정01', profileImageUrl: null, bio: null, pets: [] },
  [SNS_TORI]: { nickname: '토리네', profileImageUrl: null, bio: null, pets: [] },
  [SNS_BLOCKER]: { nickname: '차단러', profileImageUrl: null, bio: null, pets: [] },
  [SNS_MUTUAL]: {
    nickname: '맞차단러',
    profileImageUrl: 'https://cdn.aechak.com/users/profile/mutual.webp',
    bio: '서로 차단한 사이',
    pets: [{ breedLabel: '비숑', birthYearMonth: '2022-04' }],
  },
}

/** 페이지 크기(20)를 넘는 목록을 만들 때 쓰는 사용자 25명(닉네임 이웃1~이웃25) */
export const SNS_NEIGHBORS = Array.from({ length: 25 }, (_, i) => `01JN${String(i + 1).padStart(22, '0')}`)
SNS_NEIGHBORS.forEach((id, i) => {
  USERS[id] = { nickname: `이웃${i + 1}`, profileImageUrl: null, bio: null, pets: [] }
})

/** 좋아요한 사람 100명 상한을 넘길 때 쓰는 사용자 101명(닉네임 팬1~팬101) */
export const SNS_FANS = Array.from({ length: 101 }, (_, i) => `01JP${String(i + 1).padStart(22, '0')}`)
SNS_FANS.forEach((id, i) => {
  USERS[id] = { nickname: `팬${i + 1}`, profileImageUrl: null, bio: null, pets: [] }
})

/** 탈퇴한 사용자. 프로필 행이 없어 USERS에 없다(SNS-T18 전 댓글은 WITHDRAWN 안내 문구, 좋아요한 사람에서는 빠진다) */
export const SNS_WITHDRAWN = '01JQ0000000000000000WITHDR'

interface Relation {
  from: string
  to: string
  createdAt: string
}

/** 게시물 행(SNS-02). 서버처럼 지운 게시물도 행을 남긴다. */
export interface SnsPostRow {
  publicId: string
  author: string
  caption: string | null
  hashtags: string[]
  photoUrls: string[]
  video: { url: string; thumbnailUrl: string; durationMs: number } | null
  /** 게시할 때의 대표 펫. 계약은 지금 정보를 읽지만 픽스처는 게시물에 바로 둔다 */
  pet: SnsPetResult | null
  createdAt: string
  edited: boolean
  deleted: boolean
  idempotencyKey?: string
}

/** 리포스트와 저장 행(SNS-03). id는 서버 관계 행 id처럼 늘기만 하고 리포스트 탭과 저장됨 커서가 담는다 */
export interface SnsActRow {
  id: number
  user: string
  post: string
  createdAt: string
}

/** 좋아요 행(SNS-04). target은 게시물이나 댓글 publicId다. 배열 뒤쪽이 최근에 누른 행이다 */
export interface SnsLikeRow {
  user: string
  target: string
}

/** 댓글 행(SNS-04). 서버처럼 지운 댓글도 행을 남긴다. 배열 순서가 작성 순서다 */
export interface SnsCommentRow {
  publicId: string
  post: string
  /** 대댓글이면 최상위 댓글 publicId */
  parent: string | null
  author: string
  content: string | null
  createdAt: string
  edited: boolean
  deleted: boolean
  idempotencyKey?: string
}

export interface SnsSeed {
  /** 보는 사람. null이면 비로그인 */
  viewer: string | null
  follows: Relation[]
  blocks: Relation[]
  mutes: Relation[]
  posts: SnsPostRow[]
  /** PUT까지 끝났고 아직 게시에 쓰지 않은 tmp key. 게시가 쓰면 지운다(다시 쓰면 404 100001) */
  uploads: string[]
  /** 배열 뒤쪽이 최근 행이다. id는 seedSns가 배열 순서대로 다시 매긴다 */
  reposts: SnsActRow[]
  saves: SnsActRow[]
  /** 이용 제한(RESTRICTED) 사용자. 게시, 수정, 삭제와 팔로우, 차단, 뮤트, 리포스트, 저장, 좋아요의 켜기, 끄기와 댓글 쓰기가 403 20013이다 */
  restricted: string[]
  /** 접수된 SNS 신고(SNS-07). 같은 신고자의 같은 대상은 409다. 리뷰 화면 경로로 한 사용자 신고도 여기에 둔다 */
  reports: SnsReportRow[]
  likes: SnsLikeRow[]
  comments: SnsCommentRow[]
  /** 첫 페이지 요청 시각. 탐색 피드 7일과 인기 피드 72시간을 여기서 거꾸로 센다 */
  now: string
}

export interface SnsReportRow {
  reporter: string
  targetType: 'SNS_POST' | 'SNS_COMMENT' | 'SNS_USER'
  targetId: string
  reasonCode: string
  reasonText: string | null
}

const rel = (from: string, to: string, createdAt = '2026-10-01T09:00:00'): Relation => ({ from, to, createdAt })

export const SNS_POST_COCO = '01JF9W3Q6R8T2V4X7Z9B1C3D5J'
export const SNS_POST_MINE = '01JF9W3Q6R8T2V4X7Z9B1C3D5M'
export const SNS_POST_MINE_PHOTO = '01JF9W3Q6R8T2V4X7Z9B1C3D5P'
export const SNS_POST_VIDEO = '01JF9W3Q6R8T2V4X7Z9B1C3D5K'
export const SNS_POST_NO_CAPTION = '01JF9W3Q6R8T2V4X7Z9B1C3D5Q'
/** 내가 차단한 SNS_SPAM의 게시물(403 130001) */
export const SNS_POST_SPAM = '01JF9W3Q6R8T2V4X7Z9B1C3D5S'
/** 나를 차단한 SNS_BLOCKER의 게시물(404 130400) */
export const SNS_POST_BLOCKER = '01JF9W3Q6R8T2V4X7Z9B1C3D5B'
/** 내가 뮤트한 SNS_TORI의 게시물 */
export const SNS_POST_TORI = '01JF9W3Q6R8T2V4X7Z9B1C3D5T'
export const SNS_POST_DELETED = '01JF9W3Q6R8T2V4X7Z9B1C3D5D'

const cdn = (path: string) => `https://cdn.aechak.com/${path}`

const post = (publicId: string, author: string, fields: Partial<SnsPostRow> = {}): SnsPostRow => ({
  publicId,
  author,
  caption: null,
  hashtags: [],
  photoUrls: [],
  video: null,
  pet: USERS[author]?.pets[0] ?? null,
  createdAt: '2026-10-22T09:30:00',
  edited: false,
  deleted: false,
  ...fields,
})

const DEFAULT_POSTS = (): SnsPostRow[] => [
  post(SNS_POST_COCO, SNS_COCO, {
    caption: '오늘 코코랑 한강 산책',
    hashtags: ['산책', '골든리트리버'],
    photoUrls: [cdn('sns/posts/images/coco-1.jpg'), cdn('sns/posts/images/coco-2.jpg')],
  }),
  post(SNS_POST_MINE, SNS_ME, { caption: '산책 코스 추천받아요', createdAt: '2026-10-21T18:00:00' }),
  post(SNS_POST_MINE_PHOTO, SNS_ME, {
    caption: '보리 생일',
    hashtags: ['생일'],
    photoUrls: [cdn('sns/posts/images/bori-1.jpg'), cdn('sns/posts/images/bori-2.jpg')],
  }),
  post(SNS_POST_VIDEO, SNS_CHOCO, {
    video: {
      url: cdn('sns/posts/videos/choco.mp4'),
      thumbnailUrl: cdn('sns/posts/images/choco-thumb.jpg'),
      durationMs: 42500,
    },
  }),
  post(SNS_POST_NO_CAPTION, SNS_MONG, { hashtags: ['산책'], photoUrls: [cdn('sns/posts/images/mong-1.jpg')] }),
  post(SNS_POST_SPAM, SNS_SPAM, { caption: '광고 게시물' }),
  post(SNS_POST_BLOCKER, SNS_BLOCKER, { caption: '나를 차단한 사람의 글' }),
  post(SNS_POST_TORI, SNS_TORI, { caption: '토리 생일', photoUrls: [cdn('sns/posts/images/tori-1.jpg')] }),
  post(SNS_POST_DELETED, SNS_COCO, { deleted: true }),
]

const DEFAULT_SEED = (): SnsSeed => ({
  viewer: SNS_ME,
  // 배열 뒤쪽이 최근 관계다.
  follows: [rel(SNS_CHOCO, SNS_COCO), rel(SNS_MONG, SNS_COCO), rel(SNS_COCO, SNS_MONG)],
  blocks: [
    rel(SNS_ME, SNS_MUTUAL, '2026-06-01T10:00:00'),
    rel(SNS_ME, SNS_SPAM, '2026-06-12T10:00:00'),
    rel(SNS_BLOCKER, SNS_ME),
    rel(SNS_MUTUAL, SNS_ME),
  ],
  mutes: [rel(SNS_ME, SNS_TORI, '2026-06-20T10:00:00')],
  posts: DEFAULT_POSTS(),
  uploads: [],
  reposts: [],
  saves: [],
  restricted: [],
  reports: [],
  likes: [],
  comments: [],
  // 픽스처 게시물(10월 21일, 22일)이 탐색 7일과 인기 72시간 안에 든다.
  now: '2026-10-24T09:00:00',
})

let state = DEFAULT_SEED()
let clock = 0
/** 리포스트와 저장 행 id. 지운 행의 id를 다시 쓰지 않게 늘기만 한다 */
let actSeq = 0
/** 인기 피드 순위. 첫 페이지마다 하나 만들고 다음 페이지 커서가 그 순위를 따른다(G1) */
const rankings = new Map<string, string[]>()
let rankingSeq = 0

export function seedSns(overrides: Partial<SnsSeed> = {}): void {
  state = { ...DEFAULT_SEED(), ...overrides }
  actSeq = 0
  state.reposts = state.reposts.map(r => ({ ...r, id: ++actSeq }))
  state.saves = state.saves.map(r => ({ ...r, id: ++actSeq }))
  rankings.clear()
}

/** 핸들러가 반영한 현재 관계. 테스트가 서버 상태를 단언할 때 읽는다. */
export function currentSns(): SnsSeed {
  return structuredClone(state)
}

export { rel as snsRelation }

const viewerOf = (request: Request) => (request.headers.get('Authorization') ? state.viewer : null)

const has = (list: Relation[], from: string, to: string) => list.some(r => r.from === from && r.to === to)
const without = (list: Relation[], from: string, to: string) => list.filter(r => !(r.from === from && r.to === to))
const now = () => `2026-10-21T10:${String(clock++ % 60).padStart(2, '0')}:00`

const error = (status: number, errorCode: number) => HttpResponse.json({ errorCode, message: '' }, { status })
const unavailable = () => error(404, 130000)
const unauthenticated = () => error(401, 20004)

function profile(target: string, viewer: string | null) {
  const user = USERS[target]!
  const blockedByMe = viewer != null && has(state.blocks, viewer, target)
  // 나를 차단한 사용자(서로 차단 포함)는 404가 아니라 nickname만 채운 기본 프로필이다(sns.yaml 0.3.0, R2-06).
  const blockingMe = viewer != null && has(state.blocks, target, viewer)
  const hidden = blockedByMe || blockingMe
  const counted = (pick: (r: Relation) => boolean) => state.follows.filter(pick).length
  return {
    publicId: target,
    nickname: user.nickname,
    profileImageUrl: blockingMe ? null : user.profileImageUrl,
    bio: hidden ? null : user.bio,
    pets: hidden ? null : user.pets,
    postCount: hidden ? null : state.posts.filter(row => row.author === target && !row.deleted).length,
    followerCount: hidden ? null : counted(r => r.to === target),
    followingCount: hidden ? null : counted(r => r.from === target),
    isMe: viewer === target,
    following: viewer != null && has(state.follows, viewer, target),
    blockedByMe,
    mutedByMe: viewer != null && has(state.mutes, viewer, target),
    blockingMe,
  }
}

// 커서는 목록 범위(종류, 주인, 정규화한 검색어)에 묶인다(D1). 범위가 다른 커서는 400 90002, size가 1~100 밖이면 400 90001.
function page<T>(items: T[], url: URL, withTotal: boolean, scope: string) {
  const size = Number(url.searchParams.get('size') ?? 20)
  if (!Number.isInteger(size) || size < 1 || size > 100) return error(400, 90001)
  const cursor = url.searchParams.get('cursor')
  if (cursor != null && !cursor.startsWith(`${scope}|`)) return error(400, 90002)
  const start = cursor == null ? 0 : Number(cursor.slice(scope.length + 1))
  const slice = items.slice(start, start + size)
  const hasNext = start + size < items.length
  return HttpResponse.json({
    data: {
      items: slice,
      totalCount: withTotal && start === 0 ? items.length : null,
      nextCursor: hasNext ? `${scope}|${start + size}` : null,
      hasNext,
    },
  })
}

function followList(direction: 'followers' | 'followings') {
  return ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    const owner = String(params['publicId'])
    if (!USERS[owner]) return unavailable()
    if (owner !== viewer && has(state.blocks, owner, viewer)) return unavailable()
    if (owner !== viewer && has(state.blocks, viewer, owner)) return error(403, 130001)
    const url = new URL(request.url)
    const nickname = (url.searchParams.get('nickname') ?? '').trim().normalize('NFC')
    const ids = state.follows
      .filter(r => (direction === 'followers' ? r.to === owner : r.from === owner))
      .map(r => (direction === 'followers' ? r.from : r.to))
      .reverse()
      .filter(id => USERS[id] && !has(state.blocks, viewer, id) && !has(state.blocks, id, viewer))
      .filter(id => nickname.length <= 12 && USERS[id]!.nickname.includes(nickname))
    const items = ids.map(id => {
      const pets = USERS[id]!.pets
      return {
        publicId: id,
        nickname: USERS[id]!.nickname,
        profileImageUrl: USERS[id]!.profileImageUrl,
        petSummary: pets[0] ? { breedLabel: pets[0].breedLabel, activePetCount: pets.length } : null,
        isMe: id === viewer,
        following: id !== viewer && has(state.follows, viewer, id),
      }
    })
    return page(items, url, false, `${direction === 'followers' ? 'fw' : 'fg'}:${owner}:${nickname}`)
  }
}

function relationList(key: 'blocks' | 'mutes') {
  return ({ request }: { request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    const items = state[key]
      .filter(r => r.from === viewer && USERS[r.to])
      .reverse()
      .map(r => ({
        publicId: r.to,
        nickname: USERS[r.to]!.nickname,
        profileImageUrl: USERS[r.to]!.profileImageUrl,
        createdAt: r.createdAt,
      }))
    return page(items, new URL(request.url), true, `${key === 'blocks' ? 'bk' : 'mt'}:${viewer}`)
  }
}

// 켜기(POST 201)와 끄기(DELETE 204). 이미 그 상태여도 같은 코드로 응답한다. 이용 제한 계정은 둘 다 403 20013이다.
function toggle(key: 'follows' | 'blocks' | 'mutes', selfCode: number) {
  const on = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    if (state.restricted.includes(viewer)) return error(403, 20013)
    const target = String(params['publicId'])
    if (!USERS[target]) return unavailable()
    if (target === viewer) return error(400, selfCode)
    if (key === 'follows') {
      if (has(state.blocks, target, viewer)) return unavailable()
      if (has(state.blocks, viewer, target)) return error(403, 130001)
    }
    if (!has(state[key], viewer, target)) state[key] = [...state[key], rel(viewer, target, now())]
    // 차단은 두 방향 팔로우만 지우고(차단 해제로 되살아나지 않는다) 리포스트는 남긴다(A12, 2026-11-05 변경).
    if (key === 'blocks') state.follows = without(without(state.follows, viewer, target), target, viewer)
    return new HttpResponse(null, { status: 201 })
  }
  const off = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    if (state.restricted.includes(viewer)) return error(403, 20013)
    const target = String(params['publicId'])
    if (!USERS[target]) return unavailable()
    state[key] = without(state[key], viewer, target)
    return new HttpResponse(null, { status: 204 })
  }
  return [on, off] as const
}

const [follow, unfollow] = toggle('follows', 130300)
const [block, unblock] = toggle('blocks', 130100)
const [mute, unmute] = toggle('mutes', 130200)

// ── SNS-02 게시물과 해시태그 ─────────────────────────────────────────────────────────────
// 계약(sns.yaml 0.3.0)의 판정 순서와 에러 코드를 흉내 낸다. 금지어는 BANNED_WORDS 하나로 대신한다.

export const SNS_BANNED_WORD = '욕설'
const CAPTION_MAX = 2200
const PHOTO_MAX = 10
const HASHTAG_MAX = 30
const HASHTAG_NAME_MAX = 30
const VIDEO_MAX_MS = 60_000
const HASHTAG_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣa-z0-9_]+$/
const IMAGE_KEY_PREFIX = /^tmp\/\d+\/sns\/posts\/images\//
const VIDEO_KEY_PREFIX = /^tmp\/\d+\/sns\/posts\/videos\//

// 게시물이 쓰지 않은 해시태그 게시글 수. 자동완성 예시(sns.yaml)가 그대로 나오게 둔다.
// 실제 수는 여기에 지우지 않은 게시물의 태그 수를 합한 값이다.
const HASHTAG_BASE_COUNTS: Record<string, number> = {
  댕댕이: 1200,
  댕댕: 300,
  댕청미: 15,
  산책스타그램: 840,
  아침산책: 31,
  산책: 50,
}

/** PUT까지 끝난 tmp key를 남긴다(server.ts의 presigned PUT 핸들러가 부른다). */
export function recordSnsUpload(key: string): void {
  if (!state.uploads.includes(key)) state.uploads = [...state.uploads, key]
}

/** 버킷 수명 규칙 expire-tmp가 tmp 원본을 지운 상황(게시가 404 100001을 받는다) */
export function expireSnsUploads(): void {
  state.uploads = []
}

export { post as snsPost }

const normalizeCaption = (caption: string | null | undefined) => {
  const text = (caption ?? '').normalize('NFC').replace(/\r\n/g, '\n').trim()
  return text === '' ? null : text
}

/** 해시태그 표기 정규화. 앞의 # 하나와 앞뒤 공백을 떼고 NFC, 영문 소문자로 바꾼다 */
const normalizeHashtag = (raw: string) => raw.trim().replace(/^#/, '').trim().normalize('NFC').toLowerCase()

const hasBannedWord = (text: string) => text.includes(SNS_BANNED_WORD)

function hashtagCounts(): Record<string, number> {
  const counts = { ...HASHTAG_BASE_COUNTS }
  for (const row of state.posts) {
    if (row.deleted) continue
    for (const name of row.hashtags) counts[name] = (counts[name] ?? 0) + 1
  }
  return counts
}

// 캡션 금지어: 단어 가운데 금지어가 든 단어 비율이 0.5를 넘으면 130405, 아니면 가려서 저장한다.
function moderateCaption(caption: string | null): { blocked: boolean; text: string | null } {
  if (caption == null || !hasBannedWord(caption)) return { blocked: false, text: caption }
  const words = caption.split(/\s+/)
  const ratio = words.filter(hasBannedWord).length / words.length
  if (ratio > 0.5) return { blocked: true, text: null }
  return { blocked: false, text: caption.replaceAll(SNS_BANNED_WORD, '*'.repeat(SNS_BANNED_WORD.length)) }
}

// 게시와 수정이 같이 쓰는 캡션, 해시태그 규칙. 계약의 판정 순서대로 130403, (게시만) 첨부 규칙,
// 130500, 130501, 130406, 130405, 130502다.
function checkContent(
  rawCaption: string | null | undefined,
  rawHashtags: string[],
  mediaRule: (caption: string | null) => Response | null = () => null,
) {
  const caption = normalizeCaption(rawCaption)
  if (caption != null && Array.from(caption).length > CAPTION_MAX) return { error: error(400, 130403) }
  const mediaError = mediaRule(caption)
  if (mediaError) return { error: mediaError }
  const hashtags: string[] = []
  for (const raw of rawHashtags) {
    const name = normalizeHashtag(raw)
    if (!HASHTAG_PATTERN.test(name)) return { error: error(400, 130500) }
    if (name.length > HASHTAG_NAME_MAX) return { error: error(400, 130501) }
    if (!hashtags.includes(name)) hashtags.push(name)
  }
  if (hashtags.length > HASHTAG_MAX) return { error: error(400, 130406) }
  const moderated = moderateCaption(caption)
  if (moderated.blocked) return { error: error(400, 130405) }
  if (hashtags.some(hasBannedWord)) return { error: error(400, 130502) }
  return { caption: moderated.text, hashtags }
}

const mediaUrl = (key: string) => cdn(key.replace(/^tmp\/\d+\//, ''))

const postNow = () => `2026-11-05T09:${String(clock++ % 60).padStart(2, '0')}:00`

function postDetail(row: SnsPostRow, viewer: string | null) {
  const author = USERS[row.author]!
  const isMine = viewer === row.author
  return {
    publicId: row.publicId,
    author: { publicId: row.author, nickname: author.nickname, profileImageUrl: author.profileImageUrl },
    pet: row.pet,
    caption: row.caption,
    hashtags: row.hashtags,
    photoUrls: row.photoUrls,
    video: row.video,
    likeCount: likeCountOf(row.publicId),
    commentCount: commentCountOf(row, viewer),
    repostCount: state.reposts.filter(r => r.post === row.publicId).length,
    edited: row.edited,
    createdAt: row.createdAt,
    isMine,
    following: viewer != null && !isMine && has(state.follows, viewer, row.author),
    mutedByMe: viewer != null && !isMine && has(state.mutes, viewer, row.author),
    reposted: viewer != null && !isMine && state.reposts.some(r => r.user === viewer && r.post === row.publicId),
    saved: viewer != null && state.saves.some(r => r.user === viewer && r.post === row.publicId),
    liked: likedBy(viewer, row.publicId),
  }
}

interface CreateBody {
  caption?: string | null
  photoKeys?: string[]
  video?: { key?: string; thumbnailKey?: string | null; durationMs?: number } | null
  hashtags?: string[]
}

async function createPost({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const key = request.headers.get('Idempotency-Key')
  if (key == null) return error(400, 90001)
  if (key.trim() === '' || key.length > 100) return error(400, 90004)
  // 본문을 읽은 뒤에 찾는다. 앞에서 찾으면 같은 키의 동시 요청 둘이 await 사이로 함께 지나가 행이 둘 생긴다.
  const body = (await request.json()) as CreateBody
  const existing = state.posts.find(r => r.author === viewer && r.idempotencyKey === key)
  if (existing) return HttpResponse.json({ data: { publicId: existing.publicId } }, { status: 201 })

  const photoKeys = body.photoKeys ?? []
  const video = body.video ?? null
  if (video && !(Number.isInteger(video.durationMs) && video.durationMs! >= 1)) return error(400, 90001)
  const keys = [...photoKeys, ...(video ? [video.key ?? '', video.thumbnailKey ?? ''] : [])]
  const content = checkContent(body.caption, body.hashtags ?? [], caption => {
    if (caption == null && photoKeys.length === 0 && video == null) return error(400, 130402)
    const duplicated = new Set(keys).size !== keys.length
    if (photoKeys.length > PHOTO_MAX || (video && (photoKeys.length > 0 || !video.thumbnailKey)) || duplicated) {
      return error(400, 130404)
    }
    if (video && video.durationMs! > VIDEO_MAX_MS) return error(400, 130407)
    return null
  })
  if (content.error) return content.error

  // 키 승격. 남이 발급받은 키 100002(MSW 발급 키는 모두 사용자 1), 다른 용도로 발급받은 키 100003,
  // 없거나 이미 쓴 키 100001.
  if (keys.some(k => !k.startsWith('tmp/1/'))) return error(403, 100002)
  const imageKeys = video ? [video.thumbnailKey!] : photoKeys
  if (imageKeys.some(k => !IMAGE_KEY_PREFIX.test(k)) || (video && !VIDEO_KEY_PREFIX.test(video.key ?? ''))) {
    return error(400, 100003)
  }
  if (keys.some(k => !state.uploads.includes(k))) return error(404, 100001)
  state.uploads = state.uploads.filter(k => !keys.includes(k))

  const row = post(`01K${String(state.posts.length).padStart(23, '0')}`, viewer, {
    caption: content.caption,
    hashtags: content.hashtags,
    photoUrls: photoKeys.map(mediaUrl),
    video: video
      ? { url: mediaUrl(video.key!), thumbnailUrl: mediaUrl(video.thumbnailKey!), durationMs: video.durationMs! }
      : null,
    createdAt: postNow(),
    idempotencyKey: key,
  })
  state.posts = [...state.posts, row]
  return HttpResponse.json({ data: { publicId: row.publicId } }, { status: 201 })
}

const findPost = (params: Record<string, unknown>) => state.posts.find(r => r.publicId === String(params['publicId']))

const replacePost = (row: SnsPostRow) => {
  state.posts = state.posts.map(r => (r.publicId === row.publicId ? row : r))
}

/** 상세의 게시물 판정. 볼 수 있으면 그 행이고 아니면 오류 응답이다. SNS-04 좋아요와 댓글도 같은 판정이다 */
function visiblePost(publicId: string, viewer: string | null): SnsPostRow | Response {
  const row = state.posts.find(r => r.publicId === publicId)
  // 없음, 삭제, 작성자 탈퇴, 작성자가 나를 차단(서로 차단 포함)은 모두 404 130400이다.
  if (!row || row.deleted || !USERS[row.author]) return error(404, 130400)
  if (viewer != null && viewer !== row.author) {
    if (has(state.blocks, row.author, viewer)) return error(404, 130400)
    if (has(state.blocks, viewer, row.author)) return error(403, 130001)
  }
  return row
}

function getPost({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  const row = visiblePost(String(params['publicId']), viewer)
  return row instanceof Response ? row : HttpResponse.json({ data: postDetail(row, viewer) })
}

async function updatePost({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const body = (await request.json()) as { caption?: string | null; hashtags?: string[] }
  if (!('caption' in body) || !Array.isArray(body.hashtags)) return error(400, 90001)
  // 규칙 검사가 게시물 조회보다 먼저다(BE 7).
  const content = checkContent(body.caption, body.hashtags)
  if (content.error) return content.error
  const row = findPost(params)
  if (!row) return error(404, 130400)
  if (row.author !== viewer) return error(403, 130401)
  if (row.deleted) return error(404, 130400)
  const same = row.caption === content.caption && row.hashtags.join('\n') === content.hashtags.join('\n')
  if (same) return new HttpResponse(null, { status: 204 })
  if (content.caption == null && row.photoUrls.length === 0 && row.video == null) return error(400, 130402)
  replacePost({ ...row, caption: content.caption, hashtags: content.hashtags, edited: true })
  return new HttpResponse(null, { status: 204 })
}

function deletePost({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const row = findPost(params)
  if (!row) return error(404, 130400)
  if (row.author !== viewer) return error(403, 130401)
  if (!row.deleted) replacePost({ ...row, deleted: true, caption: null })
  return new HttpResponse(null, { status: 204 })
}

function searchHashtags({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  const url = new URL(request.url)
  const size = Number(url.searchParams.get('size') ?? 20)
  if (!Number.isInteger(size) || size < 1 || size > 50) return error(400, 90001)
  const query = normalizeHashtag(url.searchParams.get('query') ?? '')
  const counts = Object.entries(hashtagCounts())
    .filter(([, count]) => count > 0)
    .map(([name, postCount]) => ({ name, postCount }))
    .sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name))
  const respond = (status: string, items: typeof counts, exact: (typeof counts)[number] | null = null) =>
    HttpResponse.json({ data: { query, status, exact, items: items.slice(0, size) } })
  if (query === '') return respond('EMPTY', counts)
  if (!HASHTAG_PATTERN.test(query)) return respond('INVALID', [])
  if (query.length > HASHTAG_NAME_MAX) return respond('TOO_LONG', [])
  const matches = counts.filter(tag => tag.name.includes(query))
  if (hasBannedWord(query)) return respond('BANNED', matches)
  const exact = matches.find(tag => tag.name === query) ?? null
  return exact
    ? respond('EXISTS', matches.filter(tag => tag !== exact), exact)
    : respond('NEW', matches)
}

// ── SNS-03 리포스트, 저장, 피드, 프로필 탭 ─────────────────────────────────────────────────
// 계약(sns.yaml 0.4.0 SNS-03 초안)의 판정 순서, 노출 규칙, 커서 범위를 흉내 낸다. 커서는 `태그|범위|기준|마지막`이다.
// 태그나 범위(목록 주인)가 다르거나 모양이 깨졌거나 마지막 항목을 찾지 못하면 400 90002다. 피드 커서는 범위가 비어 있고
// 탐색 피드만 그 자리에 첫 페이지에서 기간을 넓혔는지(w)를 남긴다.

/** 리포스트와 저장 행. id는 seedSns가 다시 매긴다 */
export const snsAct = (user: string, post: string, createdAt = '2026-10-23T10:00:00'): SnsActRow => ({
  id: 0,
  user,
  post,
  createdAt,
})

/** 인기 피드 순위가 만료된 상황(31분이 지났거나 Redis가 순위를 잃음). 남은 커서는 400 90002다 */
export function expireSnsPopularRankings(): void {
  rankings.clear()
}

const DAY_MS = 24 * 60 * 60 * 1000
// 탐색과 인기가 기간을 넓히지 않아도 되는 글 수. 첫 화면 한 페이지다(R1-17)
const MIN_FEED_POSTS = 20
// 시각은 오프셋 없는 KST 문자열이다. 서로 빼기만 하므로 UTC로 읽는다.
const epoch = (time: string) => Date.parse(`${time}Z`)
const postRow = (publicId: string) => state.posts.find(r => r.publicId === publicId)
const blockedEither = (a: string, b: string) => has(state.blocks, a, b) || has(state.blocks, b, a)

/** 목록에 나오는 글. 지운 글, 탈퇴한 작성자, 보는 사람과 차단 관계인 작성자, (mute면) 뮤트한 작성자의 글을 뺀다 */
function shownTo(row: SnsPostRow | undefined, viewer: string | null, mute = true): row is SnsPostRow {
  if (!row || row.deleted || !USERS[row.author]) return false
  if (viewer == null || viewer === row.author) return true
  return !blockedEither(viewer, row.author) && !(mute && has(state.mutes, viewer, row.author))
}

interface Keyed {
  time: string
  publicId: string
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
/** 최신순(시각이 같으면 publicId 역순). 탐색 피드와 팔로잉 피드의 keyset 순서다 */
const newerFirst = (a: Keyed, b: Keyed) => compare(b.time, a.time) || compare(b.publicId, a.publicId)
/** keyset 순서에서 last 뒤에 오는 항목 */
const after = (item: Keyed, last: Keyed) => newerFirst(last, item) < 0

function listQuery(request: Request, tag: string, scope: string) {
  const url = new URL(request.url)
  const size = Number(url.searchParams.get('size') ?? 20)
  if (!Number.isInteger(size) || size < 1 || size > 100) return { error: error(400, 90001) }
  const raw = url.searchParams.get('cursor')
  if (raw == null) return { size, cursor: null }
  const parts = raw.split('|')
  if (parts.length !== 4 || parts[0] !== tag || parts[1] !== scope) return { error: error(400, 90002) }
  return { size, cursor: { anchor: parts[2]!, last: parts[3]! } }
}

/** size개를 싣고 하나라도 남으면 마지막 항목으로 다음 커서를 만든다 */
function listResponse<T>(rows: T[], size: number, toItem: (row: T) => unknown, cursorOf: (last: T) => string) {
  const slice = rows.slice(0, size)
  const hasNext = rows.length > size
  return HttpResponse.json({
    data: { items: slice.map(toItem), nextCursor: hasNext ? cursorOf(slice.at(-1)!) : null, hasNext },
  })
}

const feedItem = (row: SnsPostRow, viewer: string | null, by: string | null = null) => ({
  post: postDetail(row, viewer),
  repostedBy: by == null ? null : { publicId: by, nickname: USERS[by]!.nickname },
})

function gridItem(row: SnsPostRow) {
  const mediaType = row.video ? 'VIDEO' : row.photoUrls.length > 0 ? 'PHOTO' : 'TEXT'
  return {
    publicId: row.publicId,
    mediaType,
    thumbnailUrl: row.video?.thumbnailUrl ?? row.photoUrls[0] ?? null,
    photoCount: row.photoUrls.length,
    // 텍스트 게시물 캡션의 앞 100 코드 포인트(D4)
    captionPreview: mediaType === 'TEXT' ? Array.from(row.caption ?? '').slice(0, 100).join('') : null,
  }
}

// 켜기(POST 201)와 끄기(DELETE 204). 이용 제한 계정은 UserStatusFilter가 둘 다 403 20013으로 막는다(G8).
// 켜기는 상세와 같은 판정(130400, 리포스트만 본인 글 130600, 내가 차단한 작성자 130001)이고 끄기는 없는 publicId만 404다(D3).
function reaction(key: 'reposts' | 'saves') {
  const on = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    if (state.restricted.includes(viewer)) return error(403, 20013)
    const row = findPost(params)
    if (!row || row.deleted) return error(404, 130400)
    if (key === 'reposts' && row.author === viewer) return error(400, 130600)
    if (!USERS[row.author]) return error(404, 130400)
    if (row.author !== viewer) {
      if (has(state.blocks, row.author, viewer)) return error(404, 130400)
      if (has(state.blocks, viewer, row.author)) return error(403, 130001)
    }
    if (!state[key].some(r => r.user === viewer && r.post === row.publicId)) {
      state[key] = [...state[key], { id: ++actSeq, user: viewer, post: row.publicId, createdAt: postNow() }]
    }
    return new HttpResponse(null, { status: 201 })
  }
  const off = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    if (state.restricted.includes(viewer)) return error(403, 20013)
    const row = findPost(params)
    if (!row) return error(404, 130400)
    state[key] = state[key].filter(r => !(r.user === viewer && r.post === row.publicId))
    return new HttpResponse(null, { status: 204 })
  }
  return [on, off] as const
}

const [repost, unrepost] = reaction('reposts')
const [save, unsave] = reaction('saves')

// 팔로잉 피드(R1-16 (a)). 원천은 나와 팔로우한 사용자이고 원글마다 보이는 이벤트(원천의 게시와 리포스트) 중 가장 늦은
// 시각에 한 번 나온다. 기준(첫 페이지 때의 게시물 수와 리포스트 행 id)보다 뒤에 생긴 게시와 리포스트는 넣지 않는다.
function followingFeed({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  const query = listQuery(request, 'fl', '')
  if (query.error) return query.error
  const anchor = query.cursor?.anchor ?? `${state.posts.length}~${actSeq}`
  const [postLimit, repostLimit] = anchor.split('~').map(Number)
  if (!Number.isInteger(postLimit) || !Number.isInteger(repostLimit)) return error(400, 90002)
  const followed = state.follows.filter(r => r.from === viewer).map(r => r.to)
  const sources = new Set(
    [viewer, ...followed].filter(
      id => id === viewer || (USERS[id] && !blockedEither(viewer, id) && !has(state.mutes, viewer, id)),
    ),
  )
  const latest = new Map<string, { publicId: string; time: string; by: string | null }>()
  const offer = (publicId: string, time: string, by: string | null) => {
    if (!shownTo(postRow(publicId), viewer)) return
    const prev = latest.get(publicId)
    if (!prev || time >= prev.time) latest.set(publicId, { publicId, time, by })
  }
  state.posts.forEach((row, index) => {
    if (index < postLimit! && sources.has(row.author)) offer(row.publicId, row.createdAt, null)
  })
  state.reposts.forEach(r => {
    if (r.id <= repostLimit! && sources.has(r.user)) offer(r.post, r.createdAt, r.user)
  })
  let events = [...latest.values()].sort(newerFirst)
  if (query.cursor) {
    const [time = '', publicId = ''] = query.cursor.last.split('~')
    if (!postRow(publicId)) return error(400, 90002)
    events = events.filter(event => after(event, { time, publicId }))
  }
  return listResponse(
    events,
    query.size,
    event => feedItem(postRow(event.publicId)!, viewer, event.by),
    last => `fl||${anchor}|${last.time}~${last.publicId}`,
  )
}

// 탐색 피드(Q3, P4, R1-17). 기준 시각부터 7일 안의 원글을 최신순으로 싣고 7일 안의 글이 20개에 못 미치면 7일이 지난 글을 잇는다.
// BE처럼 넓힐지는 첫 페이지에서 한 번 정해 커서에 남기고 다음 페이지는 7일 안의 글을 다시 세지 않는다. 리포스트는 나오지 않는다.
function exploreFeed({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  // 커서의 범위 자리가 첫 페이지에서 정한 넓히기다. w도 빈 값도 아니면 listQuery가 400 90002로 거절한다.
  const widenedByCursor = new URL(request.url).searchParams.get('cursor')?.split('|')[1] === 'w'
  const query = listQuery(request, 'ex', widenedByCursor ? 'w' : '')
  if (query.error) return query.error
  const anchor = query.cursor?.anchor ?? state.now
  if (Number.isNaN(epoch(anchor))) return error(400, 90002)
  const from = epoch(anchor) - 7 * DAY_MS
  const candidates = state.posts.filter(
    row => shownTo(row, viewer) && (viewer == null || (row.author !== viewer && !has(state.follows, viewer, row.author))),
  )
  const inWindow = candidates.filter(row => epoch(row.createdAt) >= from)
  const widened = query.cursor ? widenedByCursor : inWindow.length < MIN_FEED_POSTS
  let rows = (widened ? candidates : inWindow)
    .map(row => ({ row, time: row.createdAt, publicId: row.publicId }))
    .sort(newerFirst)
  if (query.cursor) {
    const last = postRow(query.cursor.last)
    if (!last) return error(400, 90002)
    rows = rows.filter(item => after(item, { time: last.createdAt, publicId: last.publicId }))
  }
  return listResponse(
    rows,
    query.size,
    item => feedItem(item.row, viewer),
    last => `ex|${widened ? 'w' : ''}|${anchor}|${last.publicId}`,
  )
}

// 인기 피드(G1, G2, R1-17). 첫 페이지에서 72시간 안의 점수 있는 원글로 순위를 정해 남기고 다음 페이지는 그 순위를 따른다.
// 72시간 안의 글이 20개에 못 미치면 72시간이 지난 점수 있는 글을 그 뒤에 점수순으로 잇는다.
// SNS-04 전이라 점수는 리포스트 수 x 3이다. 읽을 때마다 지운 글과 차단, 뮤트한 작성자의 글을 빼고 그만큼 뒤 순위로 채운다.
function popularFeed({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  const query = listQuery(request, 'pp', '')
  if (query.error) return query.error
  let rankingId = query.cursor?.anchor
  let offset = 0
  if (rankingId == null) {
    const from = epoch(state.now) - 3 * DAY_MS
    const score = (row: SnsPostRow) => state.reposts.filter(r => r.post === row.publicId).length * 3
    const rank = (rows: SnsPostRow[]) =>
      rows
        .filter(row => !row.deleted && USERS[row.author] && score(row) > 0)
        .sort(
          (a, b) =>
            score(b) - score(a) ||
            newerFirst({ time: a.createdAt, publicId: a.publicId }, { time: b.createdAt, publicId: b.publicId }),
        )
        .map(row => row.publicId)
    const recent = rank(state.posts.filter(row => epoch(row.createdAt) >= from))
    const ranking = recent.length < MIN_FEED_POSTS ? [...new Set([...recent, ...rank(state.posts)])] : recent
    rankingId = String(++rankingSeq)
    rankings.set(rankingId, ranking.slice(0, 1000))
  } else {
    offset = Number(query.cursor!.last)
    if (!rankings.has(rankingId) || !Number.isInteger(offset) || offset < 0 || offset >= 1000) return error(400, 90002)
  }
  const ranking = rankings.get(rankingId)!
  const page: SnsPostRow[] = []
  let next = offset
  while (next < ranking.length && page.length < query.size) {
    const row = postRow(ranking[next]!)
    next += 1
    if (shownTo(row, viewer)) page.push(row)
  }
  const hasNext = next < ranking.length
  return HttpResponse.json({
    data: {
      items: page.map(row => feedItem(row, viewer)),
      nextCursor: hasNext ? `pp||${rankingId}|${next}` : null,
      hasNext,
    },
  })
}

// 프로필 그리드, 영상, 리포스트 탭(D5). 주인 판정은 팔로워 목록과 같고 비로그인은 차단 판정을 건너뛴다.
// 그리드와 영상은 게시물 id(배열 순서) 역순, 리포스트 탭은 리포스트 행 id 역순이다. 뮤트한 주인의 글도 그대로 나온다(A15).
function profileTab(tab: 'posts' | 'videos' | 'reposts') {
  const tag = { posts: 'gp', videos: 'gv', reposts: 'gr' }[tab]
  return ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    const owner = String(params['publicId'])
    if (!USERS[owner]) return unavailable()
    if (viewer != null && owner !== viewer) {
      if (has(state.blocks, owner, viewer)) return unavailable()
      if (has(state.blocks, viewer, owner)) return error(403, 130001)
    }
    const query = listQuery(request, tag, owner)
    if (query.error) return query.error
    if (tab === 'reposts') {
      // 주인 본인은 자기가 뮤트한 작성자의 글도 본다. 다른 보는 사람에게는 그 사람이 뮤트한 작성자의 글을 뺀다.
      const rows = state.reposts
        .filter(r => r.user === owner && shownTo(postRow(r.post), viewer, viewer !== owner))
        .sort((a, b) => b.id - a.id)
      return actPage(rows, query, tag, owner)
    }
    let rows = state.posts
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.author === owner && !row.deleted && (tab === 'posts' || row.video != null))
      .reverse()
    if (query.cursor) {
      const lastIndex = state.posts.findIndex(r => r.publicId === query.cursor!.last)
      if (lastIndex < 0) return error(400, 90002)
      rows = rows.filter(({ index }) => index < lastIndex)
    }
    return listResponse(
      rows,
      query.size,
      ({ row }) => gridItem(row),
      last => `${tag}|${owner}|-|${last.row.publicId}`,
    )
  }
}

/** 리포스트 탭과 저장됨은 관계 행 id 역순이고 커서가 마지막 행 id를 담는다 */
function actPage(
  rows: SnsActRow[],
  query: { size: number; cursor: { last: string } | null },
  tag: string,
  scope: string,
) {
  let rest = rows
  if (query.cursor) {
    const lastId = Number(query.cursor.last)
    if (!Number.isInteger(lastId)) return error(400, 90002)
    rest = rows.filter(r => r.id < lastId)
  }
  return listResponse(
    rest,
    query.size,
    r => gridItem(postRow(r.post)!),
    last => `${tag}|${scope}|-|${last.id}`,
  )
}

// 저장됨 탭. 본인만 보고 지운 글, 탈퇴한 작성자, 차단 관계와 뮤트한 작성자의 글을 숨긴다(내 글은 늘 나온다, P10).
function mySaves({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  const query = listQuery(request, 'sv', viewer)
  if (query.error) return query.error
  const rows = state.saves.filter(r => r.user === viewer && shownTo(postRow(r.post), viewer)).sort((a, b) => b.id - a.id)
  return actPage(rows, query, 'sv', viewer)
}

export const SNS_REPORTS_URL = `${base}/reports`
const SNS_REPORT_REASONS = ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'FRAUD', 'OTHER']

// 신고 접수(POST /reports)의 SNS 대상 세 종류. 판정 순서는 sns.yaml SNS-T17, SNS-T21 계약 그대로다. 다른 대상(PRODUCT, REVIEW, USER)은
// 이 핸들러가 받지 않고 넘긴다.
async function submitReport({ request }: { request: Request }) {
  const body = (await request.clone().json().catch(() => null)) as {
    targetType?: string
    targetId?: string
    reasonCode?: string
    reasonText?: string | null
  } | null
  if (body?.targetType !== 'SNS_POST' && body?.targetType !== 'SNS_COMMENT' && body?.targetType !== 'SNS_USER')
    return undefined
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  const { targetType, targetId, reasonCode } = body
  if (typeof targetId !== 'string' || !SNS_REPORT_REASONS.includes(reasonCode ?? '')) return error(400, 90001)
  if (body.reasonText != null && body.reasonText.length > 500) return error(400, 90001)
  const reasonText = body.reasonText?.trim() || null
  const duplicate = state.reports.some(r => r.reporter === viewer && r.targetType === targetType && r.targetId === targetId)
  if (targetType === 'SNS_POST') {
    const row = state.posts.find(p => p.publicId === targetId)
    if (!row || row.deleted || !USERS[row.author] || has(state.blocks, row.author, viewer)) return error(404, 130400)
    if (has(state.blocks, viewer, row.author)) return error(403, 130001)
    if (row.author === viewer) return error(400, 130800)
    if (reasonCode === 'OTHER' && reasonText == null) return error(400, 130801)
    if (duplicate) return error(409, 130802)
  } else if (targetType === 'SNS_COMMENT') {
    // 댓글 판정은 댓글 좋아요와 같다. 안내 문구만 남은 댓글도 목록에 보이지 않는 댓글과 같이 130700이다.
    const found = visibleComment(targetId, viewer)
    if (found instanceof Response) return found
    if (found.item.status !== 'ACTIVE') return error(404, 130700)
    if (found.row.author === viewer) return error(400, 130803)
    if (reasonCode === 'OTHER' && reasonText == null) return error(400, 130801)
    if (duplicate) return error(409, 130804)
  } else {
    // 사용자 신고는 두 사람 사이의 차단을 보지 않는다(P11).
    if (!USERS[targetId]) return unavailable()
    if (targetId === viewer) return error(400, 30200)
    if (reasonCode === 'OTHER' && reasonText == null) return error(400, 30201)
    if (duplicate) return error(409, 30202)
  }
  state.reports.push({ reporter: viewer, targetType, targetId, reasonCode: reasonCode!, reasonText })
  return new HttpResponse(null, { status: 201 })
}

// ── SNS-04 좋아요와 댓글 ──────────────────────────────────────────────────────
// 계약(sns.yaml 0.5.0 SNS-04 초안)의 판정 순서, 숨김 규칙, 안내 문구 규칙을 흉내 낸다. 댓글 커서는 `cm|게시물|-|마지막 최상위 댓글`이다.
// 수는 서버처럼 볼 때 센다(G1). 좋아요 수는 차단과 뮤트로 줄지 않고(Q12), 댓글 수는 지우지 않은 댓글 가운데 섀도우 처리로 숨긴
// 것만 뺀다(R1-03). 섀도우 처리는 지금의 뮤트 관계로 정한다(R1-02 추천안).

const COMMENT_MAX = 500
const LIKERS_MAX = 100

/** 좋아요 행 */
export const snsLike = (user: string, target: string): SnsLikeRow => ({ user, target })

/** 댓글 행. createdAt을 주지 않으면 작성 순서대로 늘어나는 시각이다 */
export const snsComment = (
  publicId: string,
  post: string,
  author: string,
  fields: Partial<SnsCommentRow> = {},
): SnsCommentRow => ({
  publicId,
  post,
  parent: null,
  author,
  content: `${USERS[author]?.nickname ?? '탈퇴한 사용자'}의 댓글`,
  createdAt: postNow(),
  edited: false,
  deleted: false,
  ...fields,
})

// 계약 예시(getSnsPostComments firstPage, guestLastPage)의 댓글. 모두 SNS_POST_COCO에 달렸고 지운 최상위 댓글 아래에는
// 초코맘의 대댓글이 남아 안내 문구로 보인다. 기본 시드에는 넣지 않는다(상세와 카드의 수가 바뀌어 SNS-02, SNS-03 테스트가 흔들린다).
export const SNS_COMMENT_MONG = '01JG2K7M9P1R3T5V7X9Z1B3D5F'
export const SNS_REPLY_COCO = '01JG2K8A2C4E6G8J0M2P4R6T8V'
export const SNS_COMMENT_DELETED = '01JG2K9B3D5F7H9K1N3Q5S7W9Y'
export const SNS_REPLY_CHOCO = '01JG2KAC4E6G8J0M2P4R6T8V0X'
export const SNS_COMMENT_MINE = '01JG2KBD5F7H9K1N3Q5S7W9Y1A'

export const snsExampleComments = (): SnsCommentRow[] => [
  snsComment(SNS_COMMENT_MONG, SNS_POST_COCO, SNS_MONG, {
    content: '코코 표정 너무 좋네요',
    createdAt: '2026-10-22T09:41:00',
  }),
  snsComment(SNS_REPLY_COCO, SNS_POST_COCO, SNS_COCO, {
    parent: SNS_COMMENT_MONG,
    content: '감사해요. 다음에 같이 산책해요',
    createdAt: '2026-10-22T10:02:00',
    edited: true,
  }),
  snsComment(SNS_COMMENT_DELETED, SNS_POST_COCO, SNS_COCO, {
    content: null,
    deleted: true,
    createdAt: '2026-10-22T11:15:00',
  }),
  snsComment(SNS_REPLY_CHOCO, SNS_POST_COCO, SNS_CHOCO, {
    parent: SNS_COMMENT_DELETED,
    content: '저도 궁금해요',
    createdAt: '2026-10-22T11:20:00',
  }),
  snsComment(SNS_COMMENT_MINE, SNS_POST_COCO, SNS_ME, {
    content: '산책 코스 어디예요?',
    createdAt: '2026-10-22T12:00:00',
  }),
]

/** 계약 예시의 댓글 좋아요 수(몽이아빠 2, 코코집사 1, 보리언니 1)와 보는 사람(SNS_ME)이 누른 몽이아빠 댓글 */
export const snsExampleCommentLikes = (): SnsLikeRow[] => [
  snsLike(SNS_CHOCO, SNS_COMMENT_MONG),
  snsLike(SNS_ME, SNS_COMMENT_MONG),
  snsLike(SNS_MONG, SNS_REPLY_COCO),
  snsLike(SNS_COCO, SNS_COMMENT_MINE),
]

function likeCountOf(target: string) {
  return state.likes.filter(r => r.target === target).length
}

function likedBy(viewer: string | null, target: string) {
  return viewer != null && state.likes.some(r => r.user === viewer && r.target === target)
}

function setLike(viewer: string, target: string, on: boolean) {
  const liked = likedBy(viewer, target)
  if (on && !liked) state.likes = [...state.likes, snsLike(viewer, target)]
  if (!on) state.likes = state.likes.filter(r => !(r.user === viewer && r.target === target))
}

const commentRow = (publicId: string) => state.comments.find(r => r.publicId === publicId)

/** 게시물 작성자가 뮤트한 사용자의 댓글은 그 사용자에게만 보인다(섀도우 처리, A16) */
const shadowed = (row: SnsCommentRow, postAuthor: string, viewer: string | null) =>
  row.author !== postAuthor && has(state.mutes, postAuthor, row.author) && viewer !== row.author

/** 차단 관계, 보는 사람이 뮤트한 사용자, 섀도우 처리로 숨긴 댓글이 아니면 true. 숨긴 최상위 댓글은 대댓글도 함께 숨긴다 */
function commentShown(row: SnsCommentRow, postAuthor: string, viewer: string | null) {
  const hiddenAuthor =
    viewer != null && viewer !== row.author && (blockedEither(viewer, row.author) || has(state.mutes, viewer, row.author))
  return !hiddenAuthor && !shadowed(row, postAuthor, viewer)
}

const placeholder = (row: SnsCommentRow, status: 'DELETED' | 'WITHDRAWN') => ({
  publicId: row.publicId,
  parentPublicId: row.parent,
  status,
  author: null,
  content: null,
  likeCount: 0,
  liked: false,
  edited: false,
  replyable: false,
  isMine: false,
  createdAt: row.createdAt,
})

/** 항목. 지운 댓글은 DELETED, 프로필이 없는 작성자의 댓글은 WITHDRAWN 안내 문구다(SNS-T18 전, BE 9) */
function commentItem(row: SnsCommentRow, viewer: string | null) {
  if (row.deleted) return placeholder(row, 'DELETED')
  const author = USERS[row.author]
  if (!author) return placeholder(row, 'WITHDRAWN')
  const root = row.parent == null ? row : commentRow(row.parent)!
  return {
    publicId: row.publicId,
    parentPublicId: row.parent,
    status: 'ACTIVE',
    author: { publicId: row.author, nickname: author.nickname, profileImageUrl: author.profileImageUrl },
    content: row.content,
    likeCount: likeCountOf(row.publicId),
    liked: likedBy(viewer, row.publicId),
    edited: row.edited,
    // 이 항목과 최상위 댓글이 모두 ACTIVE일 때만 답글을 달 수 있다(R1-20 추천안).
    replyable: !root.deleted && USERS[root.author] != null,
    isMine: viewer === row.author,
    createdAt: row.createdAt,
  }
}

/**
 * 보는 사람에게 보이는 스레드. 최상위 댓글 작성 순서(오래된순)이고 items는 [최상위 댓글, ...대댓글]이다. 지운 대댓글은 빠지고
 * 지운 최상위 댓글은 보이는 대댓글이 남아 있을 때만 안내 문구로 남는다(P3).
 */
function commentThreads(post: SnsPostRow, viewer: string | null) {
  const rows = state.comments.filter(r => r.post === post.publicId)
  return rows
    .filter(root => root.parent == null && commentShown(root, post.author, viewer))
    .flatMap(root => {
      const replies = rows.filter(
        r => r.parent === root.publicId && !r.deleted && commentShown(r, post.author, viewer),
      )
      if (root.deleted && replies.length === 0) return []
      return [{ root, items: [root, ...replies].map(r => commentItem(r, viewer)) }]
    })
}

/** 보는 사람에게 보이는 그 댓글의 항목. 보이지 않으면 undefined */
function shownComment(row: SnsCommentRow, post: SnsPostRow, viewer: string | null) {
  return commentThreads(post, viewer)
    .flatMap(thread => thread.items)
    .find(item => item.publicId === row.publicId)
}

function commentCountOf(post: SnsPostRow, viewer: string | null) {
  return state.comments.filter(row => {
    if (row.post !== post.publicId || row.deleted) return false
    const root = row.parent == null ? row : commentRow(row.parent)!
    return !shadowed(row, post.author, viewer) && !shadowed(root, post.author, viewer)
  }).length
}

/** 같은 게시물, 같은 키 재요청과 작성, 수정의 응답. 쓴 사람 기준 항목이고 지운 댓글이면 DELETED다 */
const ownItem = (row: SnsCommentRow, viewer: string) =>
  row.deleted ? placeholder(row, 'DELETED') : commentItem(row, viewer)

/**
 * 댓글 판정. 게시물 판정 뒤 보는 사람에게 보이는 댓글이면 그 행과 게시물이고 아니면 오류 응답이다. 좋아요와 좋아요한 사람은
 * 지운 댓글의 안내 문구도 130700이다. 계약처럼 저장된 상태를 보므로 탈퇴한 작성자의 대체 표시는 막지 않는다(BE 9).
 */
function visibleComment(publicId: string, viewer: string | null, allowDeleted = false) {
  const row = commentRow(publicId)
  if (!row) return error(404, 130700)
  const post = visiblePost(row.post, viewer)
  if (post instanceof Response) return post
  const item = shownComment(row, post, viewer)
  if (!item || (!allowDeleted && row.deleted)) return error(404, 130700)
  return { row, post, item }
}

/** 게시물과 댓글 좋아요 켜기(POST 201)와 끄기(DELETE 200). 끄기도 켜기와 같은 판정이고 둘 다 지금의 수를 준다(D3, G8) */
function like(kind: 'post' | 'comment', on: boolean) {
  return ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    if (state.restricted.includes(viewer)) return error(403, 20013)
    const id = String(params[kind === 'post' ? 'publicId' : 'commentPublicId'])
    const target = kind === 'post' ? visiblePost(id, viewer) : visibleComment(id, viewer)
    if (target instanceof Response) return target
    setLike(viewer, id, on)
    return HttpResponse.json({ data: { likeCount: likeCountOf(id) } }, { status: on ? 201 : 200 })
  }
}

// 좋아요한 사람(G4). 최근에 누른 순서로 100명까지이고 차단 관계와 탈퇴한 사용자는 빼고 뮤트한 사용자는 넣는다(A24).
// likeCount는 뺀 사용자도 센 전체 수다. hasMore는 뺀 뒤에도 100명을 넘게 남을 때 true다(R3-09 추천안).
function likers(kind: 'post' | 'comment') {
  return ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    const id = String(params[kind === 'post' ? 'publicId' : 'commentPublicId'])
    const target = kind === 'post' ? visiblePost(id, viewer) : visibleComment(id, viewer)
    if (target instanceof Response) return target
    const rows = state.likes.filter(r => r.target === id)
    const shown = [...rows]
      .reverse()
      .filter(r => USERS[r.user] && (r.user === viewer || !blockedEither(viewer, r.user)))
    return HttpResponse.json({
      data: {
        likeCount: rows.length,
        hasMore: shown.length > LIKERS_MAX,
        items: shown.slice(0, LIKERS_MAX).map(({ user }) => ({
          publicId: user,
          nickname: USERS[user]!.nickname,
          profileImageUrl: USERS[user]!.profileImageUrl,
          pet: USERS[user]!.pets[0] ?? null,
          isMe: user === viewer,
          following: user !== viewer && has(state.follows, viewer, user),
        })),
      },
    })
  }
}

// 댓글 목록(D5). 한 페이지는 최상위 댓글 size개와 그 아래 보이는 대댓글 전부다. 커서는 게시물에 묶인다(D1).
function commentList({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  const post = visiblePost(String(params['publicId']), viewer)
  if (post instanceof Response) return post
  const query = listQuery(request, 'cm', post.publicId)
  if (query.error) return query.error
  let threads = commentThreads(post, viewer)
  if (query.cursor) {
    const lastIndex = state.comments.findIndex(r => r.publicId === query.cursor!.last)
    if (lastIndex < 0) return error(400, 90002)
    threads = threads.filter(thread => state.comments.indexOf(thread.root) > lastIndex)
  }
  const slice = threads.slice(0, query.size)
  const hasNext = threads.length > query.size
  return HttpResponse.json({
    data: {
      items: slice.flatMap(thread => thread.items),
      nextCursor: hasNext ? `cm|${post.publicId}|-|${slice.at(-1)!.root.publicId}` : null,
      hasNext,
    },
  })
}

/** 내용 규칙(130702, 130703)과 금지어(130704). 통과하면 금지어를 가린 내용이다 */
function checkComment(raw: unknown): { error: Response } | { content: string } {
  if (typeof raw !== 'string') return { error: error(400, 90001) }
  const text = normalizeCaption(raw)
  if (text == null) return { error: error(400, 130702) }
  if (Array.from(text).length > COMMENT_MAX) return { error: error(400, 130703) }
  const moderated = moderateCaption(text)
  if (moderated.blocked) return { error: error(400, 130704) }
  return { content: moderated.text! }
}

// 댓글 작성. 판정 순서는 키, 같은 키 재요청, 내용과 금지어, 게시물, 답글 대상이다(sns.yaml createSnsComment).
async function createComment({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const key = request.headers.get('Idempotency-Key')
  if (key == null) return error(400, 90001)
  if (key.trim() === '' || key.length > 100) return error(400, 90004)
  const postId = String(params['publicId'])
  // 본문을 읽은 뒤에 찾는다. 앞에서 찾으면 같은 키의 동시 요청 둘이 await 사이로 함께 지나가 행이 둘 생긴다.
  const body = (await request.json()) as { content?: unknown; parentPublicId?: string | null }
  const existing = state.comments.find(r => r.author === viewer && r.post === postId && r.idempotencyKey === key)
  if (existing) return HttpResponse.json({ data: ownItem(existing, viewer) }, { status: 201 })
  const checked = checkComment(body.content)
  if ('error' in checked) return checked.error
  const post = visiblePost(postId, viewer)
  if (post instanceof Response) return post
  let parent: string | null = null
  if (body.parentPublicId != null) {
    const target = commentRow(body.parentPublicId)
    // 없는 댓글, 다른 게시물의 댓글, 쓰는 사람에게 숨긴 댓글, 지운 대댓글은 130700이다.
    if (!target || target.post !== post.publicId) return error(404, 130700)
    const root = target.parent == null ? target : commentRow(target.parent)!
    if (!commentShown(root, post.author, viewer) || !commentShown(target, post.author, viewer)) return error(404, 130700)
    if (target !== root && target.deleted) return error(404, 130700)
    // 안내 문구만 남은 최상위 댓글과 그 아래 대댓글에는 답글을 달 수 없다(R1-20 추천안). 저장된 상태를 본다(BE 9).
    if (root.deleted) return error(409, 130705)
    parent = root.publicId
  }
  const row = snsComment(`01KC${String(state.comments.length).padStart(22, '0')}`, post.publicId, viewer, {
    parent,
    content: checked.content,
    idempotencyKey: key,
  })
  state.comments = [...state.comments, row]
  return HttpResponse.json({ data: ownItem(row, viewer) }, { status: 201 })
}

// 댓글 단건(G7). 대댓글이면 최상위 댓글을 parent로 함께 준다. 안내 문구로 남은 최상위 댓글도 그대로 온다.
function getComment({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  const found = visibleComment(String(params['commentPublicId']), viewer, true)
  if (found instanceof Response) return found
  const root = found.row.parent == null ? null : commentRow(found.row.parent)!
  return HttpResponse.json({
    data: { comment: found.item, parent: root && shownComment(root, found.post, viewer)! },
  })
}

// 댓글 수정. 내용 규칙이 댓글 조회보다 먼저다(BE 6). 같은 내용이면 edited를 그대로 두고 200이다.
async function updateComment({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const checked = checkComment(((await request.json()) as { content?: unknown }).content)
  if ('error' in checked) return checked.error
  const row = commentRow(String(params['commentPublicId']))
  if (!row) return error(404, 130700)
  const post = visiblePost(row.post, viewer)
  if (post instanceof Response) return post
  if (row.author !== viewer) return error(403, 130701)
  if (row.deleted) return error(404, 130700)
  if (row.content === checked.content) return HttpResponse.json({ data: ownItem(row, viewer) })
  const edited = { ...row, content: checked.content, edited: true }
  state.comments = state.comments.map(r => (r.publicId === row.publicId ? edited : r))
  return HttpResponse.json({ data: ownItem(edited, viewer) })
}

// 댓글 삭제(멱등). 게시물 판정을 하지 않아 없는 댓글만 130700이고 남의 댓글은 지웠는지와 상관없이 130701이다(design #9).
function deleteComment({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
  if (state.restricted.includes(viewer)) return error(403, 20013)
  const row = commentRow(String(params['commentPublicId']))
  if (!row) return error(404, 130700)
  if (row.author !== viewer) return error(403, 130701)
  state.comments = state.comments.map(r => (r.publicId === row.publicId ? { ...r, deleted: true, content: null } : r))
  return new HttpResponse(null, { status: 204 })
}

// ── SNS-06 검색과 해시태그 게시물 목록 ─────────────────────────────────────────────────────
// 계약(sns.yaml 0.5.0 SNS-06 초안)의 매칭, 정렬, 수 규칙을 흉내 낸다. 커서는 `태그|정렬:검색어|-|다음 위치`이고 정렬이나 검색어가
// 다르거나 모양이 깨졌으면 400 90002다. 인기순 점수는 인기 피드처럼 리포스트 수 x 3이고 기간 제한이 없다.

const SEARCH_KEYWORD_MAX = 100
const SEARCH_USER_KEYWORD_MAX = 12

/** 검색어 정규화. 앞뒤 공백을 지우고 NFC로 바꾼 뒤 앞의 # 하나를 뗀다(P2) */
const normalizeKeyword = (raw: string) => raw.trim().normalize('NFC').replace(/^#/, '')

const searchScore = (row: SnsPostRow) => state.reposts.filter(r => r.post === row.publicId).length * 3

function sortPosts(rows: SnsPostRow[], sort: string) {
  const newer = (a: SnsPostRow, b: SnsPostRow) =>
    newerFirst({ time: a.createdAt, publicId: a.publicId }, { time: b.createdAt, publicId: b.publicId })
  return [...rows].sort(sort === 'LATEST' ? newer : (a, b) => searchScore(b) - searchScore(a) || newer(a, b))
}

/** keyword와 sort를 검사하고 첫 페이지 여부와 시작 위치를 돌려준다. 실패하면 error */
function searchQuery(request: Request, tag: string, scope: string) {
  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') ?? 'POPULAR'
  if (sort !== 'POPULAR' && sort !== 'LATEST') return { error: error(400, 90001) }
  const query = listQuery(request, tag, `${sort}:${scope}`)
  if (query.error) return { error: query.error }
  const start = query.cursor == null ? 0 : Number(query.cursor.last)
  if (!Number.isInteger(start) || start < 0) return { error: error(400, 90002) }
  return { sort, size: query.size, start, cursorOf: (next: number) => `${tag}|${sort}:${scope}|-|${next}` }
}

function searchKeyword(request: Request) {
  const raw = new URL(request.url).searchParams.get('keyword')
  if (raw == null || raw.length > SEARCH_KEYWORD_MAX) return { error: error(400, 90001), keyword: '' }
  return { error: null, keyword: normalizeKeyword(raw) }
}

function offsetPage<T>(rows: T[], start: number, size: number, cursorOf: (next: number) => string, toItem: (row: T) => unknown) {
  const slice = rows.slice(start, start + size)
  const hasNext = start + size < rows.length
  return { items: slice.map(toItem), nextCursor: hasNext ? cursorOf(start + size) : null, hasNext }
}

// 게시물 검색. 검색어를 공백으로 나눈 단어가 모두 캡션이나 그 글의 해시태그에 들어 있어야 한다(P4). 닉네임으로는 찾지 않는다.
// totalCount는 지운 글과 탈퇴한 작성자의 글만 뺀 수이고 items는 보는 사람의 차단과 뮤트까지 뺀다(P10).
function searchPosts({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  const parsed = searchKeyword(request)
  if (parsed.error) return parsed.error
  const query = searchQuery(request, 'sp', parsed.keyword)
  if (query.error) return query.error
  const words = parsed.keyword.toLowerCase().split(/\s+/).filter(Boolean)
  const matched =
    words.length === 0
      ? []
      : state.posts.filter(
          row =>
            shownTo(row, null) &&
            words.every(
              word => (row.caption ?? '').toLowerCase().includes(word) || row.hashtags.some(tag => tag.includes(word)),
            ),
        )
  const visible = sortPosts(
    matched.filter(row => shownTo(row, viewer)),
    query.sort,
  )
  return HttpResponse.json({
    data: {
      ...offsetPage(visible, query.start, query.size, query.cursorOf, row => feedItem(row, viewer)),
      totalCount: query.start === 0 ? matched.length : null,
    },
  })
}

// 계정 검색. 공백을 뺀 검색어로 닉네임을 찾고 같은 닉네임, 검색어로 시작하는 닉네임, 나머지 순, 같은 묶음은 팔로워 수 순이다(P8).
// 내가 차단한 사용자는 빠지고 나를 차단한 사용자는 내가 차단했어도 기본 프로필로 나온다(A7, A24). 뮤트한 사용자와 본인은 나온다.
function searchUsers({ request }: { request: Request }) {
  const viewer = viewerOf(request)
  const parsed = searchKeyword(request)
  if (parsed.error) return parsed.error
  const keyword = parsed.keyword.replace(/\s+/g, '')
  const query = searchQuery(request, 'su', keyword)
  if (query.error) return query.error
  const followers = (id: string) => state.follows.filter(r => r.to === id).length
  const rank = (nickname: string) => (nickname === keyword ? 0 : nickname.startsWith(keyword) ? 1 : 2)
  const ids =
    keyword === '' || keyword.length > SEARCH_USER_KEYWORD_MAX
      ? []
      : Object.keys(USERS)
          .filter(id => USERS[id]!.nickname.includes(keyword))
          .filter(id => viewer == null || !has(state.blocks, viewer, id) || has(state.blocks, id, viewer))
          .sort(
            (a, b) =>
              rank(USERS[a]!.nickname) - rank(USERS[b]!.nickname) || followers(b) - followers(a) || compare(a, b),
          )
  const item = (id: string) => {
    const user = USERS[id]!
    const blockingMe = viewer != null && id !== viewer && has(state.blocks, id, viewer)
    return {
      publicId: id,
      nickname: user.nickname,
      profileImageUrl: blockingMe ? null : user.profileImageUrl,
      petSummary: blockingMe || !user.pets[0] ? null : { breedLabel: user.pets[0].breedLabel, activePetCount: user.pets.length },
      followerCount: blockingMe ? null : followers(id),
      isMe: id === viewer,
      following: viewer != null && id !== viewer && !blockingMe && has(state.follows, viewer, id),
      blockingMe,
    }
  }
  return HttpResponse.json({ data: offsetPage(ids, query.start, query.size, query.cursorOf, item) })
}

// 해시태그 검색. 공백을 뺀 검색어를 해시태그 표기로 정규화해 이름에 든 태그를 게시글 수 순, 같으면 이름 순으로 준다(P11).
function searchHashtagSegment({ request }: { request: Request }) {
  const parsed = searchKeyword(request)
  if (parsed.error) return parsed.error
  const keyword = normalizeHashtag(parsed.keyword.replace(/\s+/g, ''))
  const query = searchQuery(request, 'sh', keyword)
  if (query.error) return query.error
  const tags =
    keyword === '' || keyword.length > HASHTAG_NAME_MAX
      ? []
      : Object.entries(hashtagCounts())
          .filter(([name, count]) => count > 0 && name.includes(keyword))
          .map(([name, postCount]) => ({ name, postCount }))
          .sort((a, b) => b.postCount - a.postCount || compare(a.name, b.name))
  return HttpResponse.json({ data: offsetPage(tags, query.start, query.size, query.cursorOf, tag => tag) })
}

// 해시태그 게시물 목록. 그 태그와 정확히 같은 태그가 달린 원글이다. 없는 태그는 게시글 수 0과 빈 목록이다(P11).
function hashtagPosts({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  const name = normalizeHashtag(String(params['name']))
  const query = searchQuery(request, 'hp', name)
  if (query.error) return query.error
  const rows = sortPosts(
    state.posts.filter(row => row.hashtags.includes(name) && shownTo(row, viewer)),
    query.sort,
  )
  return HttpResponse.json({
    data: {
      hashtag: { name, postCount: hashtagCounts()[name] ?? 0 },
      ...offsetPage(rows, query.start, query.size, query.cursorOf, row => feedItem(row, viewer)),
    },
  })
}

export const snsHandlers = [
  http.post(SNS_REPORTS_URL, submitReport),
  http.get(SNS_ME_URL, ({ request }) => {
    const viewer = viewerOf(request)
    return viewer == null ? unauthenticated() : HttpResponse.json({ data: profile(viewer, viewer) })
  }),
  http.get(SNS_MY_BLOCKS_URL, relationList('blocks')),
  http.get(SNS_MY_MUTES_URL, relationList('mutes')),
  http.get(SNS_FOLLOWERS_URL, followList('followers')),
  http.get(SNS_FOLLOWINGS_URL, followList('followings')),
  http.get(SNS_PROFILE_URL, ({ params, request }) => {
    const target = String(params['publicId'])
    const viewer = viewerOf(request)
    if (!USERS[target]) return unavailable()
    return HttpResponse.json({ data: profile(target, viewer) })
  }),
  http.post(SNS_FOLLOW_URL, follow),
  http.delete(SNS_FOLLOW_URL, unfollow),
  http.post(SNS_BLOCK_URL, block),
  http.delete(SNS_BLOCK_URL, unblock),
  http.post(SNS_MUTE_URL, mute),
  http.delete(SNS_MUTE_URL, unmute),
  http.post(SNS_POSTS_URL, createPost),
  http.get(SNS_POST_URL, getPost),
  http.patch(SNS_POST_URL, updatePost),
  http.delete(SNS_POST_URL, deletePost),
  http.get(SNS_HASHTAGS_URL, searchHashtags),
  http.post(SNS_REPOST_URL, repost),
  http.delete(SNS_REPOST_URL, unrepost),
  http.post(SNS_SAVE_URL, save),
  http.delete(SNS_SAVE_URL, unsave),
  http.get(SNS_FOLLOWING_FEED_URL, followingFeed),
  http.get(SNS_EXPLORE_FEED_URL, exploreFeed),
  http.get(SNS_POPULAR_FEED_URL, popularFeed),
  http.get(SNS_USER_POSTS_URL, profileTab('posts')),
  http.get(SNS_USER_VIDEOS_URL, profileTab('videos')),
  http.get(SNS_USER_REPOSTS_URL, profileTab('reposts')),
  http.get(SNS_MY_SAVES_URL, mySaves),
  http.post(SNS_POST_LIKE_URL, like('post', true)),
  http.delete(SNS_POST_LIKE_URL, like('post', false)),
  http.get(SNS_POST_LIKERS_URL, likers('post')),
  http.get(SNS_COMMENTS_URL, commentList),
  http.post(SNS_COMMENTS_URL, createComment),
  http.get(SNS_COMMENT_URL, getComment),
  http.patch(SNS_COMMENT_URL, updateComment),
  http.delete(SNS_COMMENT_URL, deleteComment),
  http.post(SNS_COMMENT_LIKE_URL, like('comment', true)),
  http.delete(SNS_COMMENT_LIKE_URL, like('comment', false)),
  http.get(SNS_COMMENT_LIKERS_URL, likers('comment')),
  http.get(SNS_SEARCH_POSTS_URL, searchPosts),
  http.get(SNS_SEARCH_USERS_URL, searchUsers),
  http.get(SNS_SEARCH_HASHTAGS_URL, searchHashtagSegment),
  http.get(SNS_HASHTAG_POSTS_URL, hashtagPosts),
]
