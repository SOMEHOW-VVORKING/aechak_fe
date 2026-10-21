import { http, HttpResponse } from 'msw'
import { axiosInstance, type SnsPetResult } from '@aechak/api'

// SNS-01 계약(spec/contracts/sns.yaml) 상태형 MSW. 사용자와 팔로우, 차단, 뮤트 관계를 메모리에 두고 계약의 판정
// 순서를 그대로 흉내 낸다. 보는 사람은 Authorization 헤더가 있을 때만 seedSns({ viewer })의 사용자이고
// 헤더가 없으면 비로그인이다(프로필은 관계 필드가 모두 false, 나머지는 401 20004).
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

export const SNS_ME = '01JB7XQ2M4K9TR3N5W8YZC6DHF'
export const SNS_COCO = '01JABCDEF0123456789ABCDEFG'
export const SNS_MONG = '01JC2D8FMK4N7P9QRS3TVWXYZ5'
export const SNS_CHOCO = '01JE3F6GH9JK2M5NP8QRS4TVWX'
export const SNS_SPAM = '01JD5G7HJK8M2N4PQ6RSTV9WXY'
export const SNS_TORI = '01JF8H2JK4M6N8PQ2RSTV5WXYZ'
/** 나(SNS_ME)를 차단한 사용자 */
export const SNS_BLOCKER = '01JG9J3KM5N7P9QR3STV6WXYZA'

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
}

interface Relation {
  from: string
  to: string
  createdAt: string
}

export interface SnsSeed {
  /** 보는 사람. null이면 비로그인 */
  viewer: string | null
  follows: Relation[]
  blocks: Relation[]
  mutes: Relation[]
}

const rel = (from: string, to: string, createdAt = '2026-10-01T09:00:00'): Relation => ({ from, to, createdAt })

const DEFAULT_SEED = (): SnsSeed => ({
  viewer: SNS_ME,
  // 배열 뒤쪽이 최근 관계다.
  follows: [rel(SNS_CHOCO, SNS_COCO), rel(SNS_MONG, SNS_COCO), rel(SNS_COCO, SNS_MONG)],
  blocks: [rel(SNS_ME, SNS_SPAM, '2026-06-12T10:00:00'), rel(SNS_BLOCKER, SNS_ME)],
  mutes: [rel(SNS_ME, SNS_TORI, '2026-06-20T10:00:00')],
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
  const counted = (pick: (r: Relation) => boolean) => state.follows.filter(pick).length
  return {
    publicId: target,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl,
    bio: blockedByMe ? null : user.bio,
    pets: blockedByMe ? null : user.pets,
    postCount: blockedByMe ? null : 0,
    followerCount: blockedByMe ? null : counted(r => r.to === target),
    followingCount: blockedByMe ? null : counted(r => r.from === target),
    isMe: viewer === target,
    following: viewer != null && has(state.follows, viewer, target),
    blockedByMe,
    mutedByMe: viewer != null && has(state.mutes, viewer, target),
  }
}

function page<T>(items: T[], url: URL, withTotal: boolean) {
  const start = Number(url.searchParams.get('cursor') ?? 0)
  const size = Number(url.searchParams.get('size') ?? 20)
  const slice = items.slice(start, start + size)
  const hasNext = start + size < items.length
  return HttpResponse.json({
    data: {
      items: slice,
      totalCount: withTotal && start === 0 ? items.length : null,
      nextCursor: hasNext ? String(start + size) : null,
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
    return page(items, url, false)
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
    return page(items, new URL(request.url), true)
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
    if (viewer != null && viewer !== target && has(state.blocks, target, viewer)) return unavailable()
    return HttpResponse.json({ data: profile(target, viewer) })
  }),
  http.post(SNS_FOLLOW_URL, follow),
  http.delete(SNS_FOLLOW_URL, unfollow),
  http.post(SNS_BLOCK_URL, block),
  http.delete(SNS_BLOCK_URL, unblock),
  http.post(SNS_MUTE_URL, mute),
  http.delete(SNS_MUTE_URL, unmute),
]
