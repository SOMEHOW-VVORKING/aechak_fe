import { beforeEach, describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse, setAccessToken } from '@aechak/api'
import {
  SNS_BLOCKER,
  SNS_COCO,
  SNS_ME,
  SNS_MUTUAL,
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_POST_MINE_PHOTO,
  SNS_POST_NO_CAPTION,
  seedSns,
} from '../server'

// SNS-06 MSW 핸들러 자체의 계약 검증(sns.yaml 0.5.0 SNS-06 초안). 화면 테스트가 이 매칭, 수, 커서 규칙을 전제로 한다.

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const response = errorResponse(error)
    if (!response) throw error
    return { status: response.status, errorCode: response.data?.errorCode }
  }
  throw new Error('요청이 실패해야 하는데 성공했다')
}

interface PostPage {
  items: { post: { publicId: string } }[]
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}
interface UserItem {
  publicId: string
  nickname: string
  followerCount: number | null
  petSummary: unknown
  isMe: boolean
  blockingMe: boolean
}

const get = async <T>(path: string, params: Record<string, unknown>) =>
  (await axiosInstance.get<{ data: T }>(path, { params })).data.data
const posts = (params: Record<string, unknown>) => get<PostPage>('/sns/search/posts', params)
const ids = (page: PostPage) => page.items.map(item => item.post.publicId)

beforeEach(() => {
  seedSns()
  setAccessToken('test-token')
})

describe('GET /sns/search/posts', () => {
  it('캡션이나 해시태그에 든 원글을 찾고 앞의 # 하나는 떼고 찾는다', async () => {
    const page = await posts({ keyword: '산책' })
    expect(ids(page).sort()).toEqual([SNS_POST_COCO, SNS_POST_MINE, SNS_POST_NO_CAPTION].sort())
    expect(page.totalCount).toBe(3)
    expect(ids(await posts({ keyword: '#산책' })).sort()).toEqual(ids(page).sort())
  })

  it('여러 단어는 캡션과 해시태그 어디에 있어도 모두 들어 있어야 한다', async () => {
    expect(ids(await posts({ keyword: '한강 산책' }))).toEqual([SNS_POST_COCO])
    expect(ids(await posts({ keyword: '코코 골든리트리버' }))).toEqual([SNS_POST_COCO])
  })

  it('totalCount는 뮤트한 작성자의 글도 세고 items에서는 뺀다(P10)', async () => {
    const page = await posts({ keyword: '생일' })
    expect(page.totalCount).toBe(2)
    expect(ids(page)).toEqual([SNS_POST_MINE_PHOTO])
  })

  it('#만 남는 검색어는 빈 결과다', async () => {
    expect(await posts({ keyword: '#' })).toEqual({ items: [], totalCount: 0, nextCursor: null, hasNext: false })
  })

  it('커서는 검색어와 정렬에 묶이고 다음 페이지는 totalCount가 null이다', async () => {
    const first = await posts({ keyword: '산책', size: 2 })
    expect(first.hasNext).toBe(true)
    const second = await posts({ keyword: '산책', size: 2, cursor: first.nextCursor })
    expect(second.totalCount).toBeNull()
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(3)
    expect(await failureOf(posts({ keyword: '코코', size: 2, cursor: first.nextCursor }))).toEqual({
      status: 400,
      errorCode: 90002,
    })
    expect(await failureOf(posts({ keyword: '산책', sort: 'LATEST', size: 2, cursor: first.nextCursor }))).toEqual({
      status: 400,
      errorCode: 90002,
    })
  })
})

describe('GET /sns/search/users', () => {
  const users = (keyword: string) => get<{ items: UserItem[] }>('/sns/search/users', { keyword })

  it('나를 차단한 사용자는 내가 차단했어도 기본 프로필로 나오고 내가 차단만 한 사용자는 빠진다', async () => {
    const { items } = await users('차단')
    expect(items.map(item => item.publicId)).toEqual([SNS_BLOCKER, SNS_MUTUAL])
    expect(items.every(item => item.blockingMe && item.followerCount === null && item.petSummary === null)).toBe(true)
    expect((await users('광고')).items).toEqual([])
  })

  it('본인 행은 isMe이고 공백을 뺀 검색어로 찾는다', async () => {
    expect((await users('보리 언니')).items).toMatchObject([{ publicId: SNS_ME, isMe: true }])
    expect((await users('코코')).items).toMatchObject([{ publicId: SNS_COCO, followerCount: 2, isMe: false }])
  })
})

describe('GET /sns/search/hashtags, /sns/hashtags/{name}/posts', () => {
  it('해시태그 세그먼트는 이름에 검색어가 든 태그를 게시글 수 순으로 준다', async () => {
    const { items } = await get<{ items: { name: string; postCount: number }[] }>('/sns/search/hashtags', {
      keyword: '산책',
    })
    expect(items).toEqual([
      { name: '산책스타그램', postCount: 840 },
      { name: '산책', postCount: 52 },
      { name: '아침산책', postCount: 31 },
    ])
  })

  it('해시태그 게시물 목록은 정확히 같은 태그의 글이고 없는 태그는 게시글 수 0이다', async () => {
    const page = await get<PostPage & { hashtag: { name: string; postCount: number } }>(
      `/sns/hashtags/${encodeURIComponent('산책')}/posts`,
      {},
    )
    expect(page.hashtag).toEqual({ name: '산책', postCount: 52 })
    expect(ids(page).sort()).toEqual([SNS_POST_COCO, SNS_POST_NO_CAPTION].sort())
    const empty = await get<PostPage & { hashtag: unknown }>('/sns/hashtags/없는태그/posts', {})
    expect(empty).toEqual({ hashtag: { name: '없는태그', postCount: 0 }, items: [], nextCursor: null, hasNext: false })
  })
})
