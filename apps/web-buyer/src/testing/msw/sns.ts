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

export interface SnsSeed {
  /** 보는 사람. null이면 비로그인 */
  viewer: string | null
  follows: Relation[]
  blocks: Relation[]
  mutes: Relation[]
  posts: SnsPostRow[]
  /** PUT까지 끝났고 아직 게시에 쓰지 않은 tmp key. 게시가 쓰면 지운다(다시 쓰면 404 100001) */
  uploads: string[]
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
})

let state = DEFAULT_SEED()
let clock = 0

export function seedSns(overrides: Partial<SnsSeed> = {}): void {
  state = { ...DEFAULT_SEED(), ...overrides }
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
    postCount: hidden ? null : 0,
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

// 켜기(POST 201)와 끄기(DELETE 204). 이미 그 상태여도 같은 코드로 응답한다.
function toggle(key: 'follows' | 'blocks' | 'mutes', selfCode: number) {
  const on = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
    const target = String(params['publicId'])
    if (!USERS[target]) return unavailable()
    if (target === viewer) return error(400, selfCode)
    if (key === 'follows') {
      if (has(state.blocks, target, viewer)) return unavailable()
      if (has(state.blocks, viewer, target)) return error(403, 130001)
    }
    if (!has(state[key], viewer, target)) state[key] = [...state[key], rel(viewer, target, now())]
    // 차단은 두 방향 팔로우를 지운다(차단 해제로 되살아나지 않는다).
    if (key === 'blocks') state.follows = without(without(state.follows, viewer, target), target, viewer)
    return new HttpResponse(null, { status: 201 })
  }
  const off = ({ params, request }: { params: Record<string, unknown>; request: Request }) => {
    const viewer = viewerOf(request)
    if (viewer == null) return unauthenticated()
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
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    edited: row.edited,
    createdAt: row.createdAt,
    isMine,
    following: viewer != null && !isMine && has(state.follows, viewer, row.author),
    mutedByMe: viewer != null && !isMine && has(state.mutes, viewer, row.author),
    reposted: false,
    saved: false,
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

function getPost({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  const row = findPost(params)
  // 없음, 삭제, 작성자 탈퇴, 작성자가 나를 차단(서로 차단 포함)은 모두 404 130400이다.
  if (!row || row.deleted || !USERS[row.author]) return error(404, 130400)
  if (viewer != null && viewer !== row.author) {
    if (has(state.blocks, row.author, viewer)) return error(404, 130400)
    if (has(state.blocks, viewer, row.author)) return error(403, 130001)
  }
  return HttpResponse.json({ data: postDetail(row, viewer) })
}

async function updatePost({ params, request }: { params: Record<string, unknown>; request: Request }) {
  const viewer = viewerOf(request)
  if (viewer == null) return unauthenticated()
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

export const snsHandlers = [
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
]
