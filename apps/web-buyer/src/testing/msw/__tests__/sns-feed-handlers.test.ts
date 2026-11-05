import { beforeEach, describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse, setAccessToken } from '@aechak/api'
import {
  SNS_BLOCKER,
  SNS_CHOCO,
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  SNS_POST_BLOCKER,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_MINE,
  SNS_POST_MINE_PHOTO,
  SNS_POST_NO_CAPTION,
  SNS_POST_SPAM,
  SNS_POST_TORI,
  SNS_POST_VIDEO,
  SNS_SPAM,
  SNS_TORI,
  currentSns,
  expireSnsPopularRankings,
  seedSns,
  snsAct,
  snsPost,
  snsRelation,
} from '../server'

// SNS-03 MSW 핸들러 자체의 계약 검증(sns.yaml 0.4.0 SNS-03 초안). 화면 테스트가 이 판정 순서, 노출 규칙, 커서를
// 전제로 하므로 여기서 깨지면 화면 실패 원인이 핸들러인지 화면인지 가릴 수 있다(sns-post-handlers.test.ts와 같은 자리).

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

interface Page<T> {
  items: T[]
  nextCursor: string | null
  hasNext: boolean
}
interface FeedItem {
  post: { publicId: string; repostCount: number; reposted: boolean; saved: boolean }
  repostedBy: { publicId: string; nickname: string } | null
}
interface GridItem {
  publicId: string
}

const get = async <T>(path: string, params: Record<string, unknown> = {}) =>
  (await axiosInstance.get<{ data: Page<T> }>(path, { params })).data.data
const feed = (kind: string, params: Record<string, unknown> = {}) => get<FeedItem>(`/sns/feeds/${kind}`, params)
const grid = (path: string, params: Record<string, unknown> = {}) => get<GridItem>(path, params)
const ids = (page: Page<FeedItem>) => page.items.map(item => item.post.publicId)
const cells = (page: Page<GridItem>) => page.items.map(item => item.publicId)
const detail = async (publicId: string) =>
  (await axiosInstance.get<{ data: FeedItem['post'] }>(`/sns/posts/${publicId}`)).data.data

const asGuest = () => setAccessToken(null)

beforeEach(() => {
  seedSns()
  setAccessToken('test-token')
})

describe('리포스트와 저장 켜기, 끄기', () => {
  it('켜기는 201이고 반복해도 수가 한 번 한 것과 같으며 끄기는 204다', async () => {
    expect((await axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/repost`)).status).toBe(201)
    expect((await axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/repost`)).status).toBe(201)
    expect(await detail(SNS_POST_COCO)).toMatchObject({ repostCount: 1, reposted: true })

    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}/repost`)).status).toBe(204)
    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}/repost`)).status).toBe(204)
    expect(await detail(SNS_POST_COCO)).toMatchObject({ repostCount: 0, reposted: false })
  })

  it('본인 글 리포스트는 400 130600이고 본인 글 저장은 201이며 저장은 어떤 수도 바꾸지 않는다', async () => {
    expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_MINE}/repost`))).toEqual({
      status: 400,
      errorCode: 130600,
    })
    expect((await axiosInstance.post(`/sns/posts/${SNS_POST_MINE}/save`)).status).toBe(201)
    expect(await detail(SNS_POST_MINE)).toMatchObject({ repostCount: 0, reposted: false, saved: true })
  })

  it('켜기는 지운 글과 나를 차단한 작성자 404 130400, 내가 차단한 작성자 403 130001이다', async () => {
    for (const action of ['repost', 'save']) {
      expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_DELETED}/${action}`))).toEqual({
        status: 404,
        errorCode: 130400,
      })
      expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_BLOCKER}/${action}`))).toEqual({
        status: 404,
        errorCode: 130400,
      })
      expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_SPAM}/${action}`))).toEqual({
        status: 403,
        errorCode: 130001,
      })
    }
  })

  it('끄기는 지운 글에도 204이고 없는 publicId만 404 130400이다', async () => {
    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_DELETED}/repost`)).status).toBe(204)
    expect(await failureOf(axiosInstance.delete('/sns/posts/01JF9W3Q6R8T2V4X7Z9B1C3ZZZ/save'))).toEqual({
      status: 404,
      errorCode: 130400,
    })
  })

  it('이용 제한 계정은 켜기와 끄기 모두 403 20013이고 비로그인은 401이다', async () => {
    seedSns({ restricted: [SNS_ME] })
    expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/save`))).toEqual({
      status: 403,
      errorCode: 20013,
    })
    expect(await failureOf(axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}/repost`))).toEqual({
      status: 403,
      errorCode: 20013,
    })
    asGuest()
    expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/repost`))).toEqual({
      status: 401,
      errorCode: 20004,
    })
  })

  it('차단해도 두 사람이 서로의 글에 한 리포스트는 지우지 않는다(A12)', async () => {
    seedSns({
      reposts: [snsAct(SNS_ME, SNS_POST_COCO), snsAct(SNS_COCO, SNS_POST_MINE), snsAct(SNS_MONG, SNS_POST_COCO)],
    })
    await axiosInstance.post(`/sns/users/${SNS_COCO}/block`)
    expect(currentSns().reposts.map(r => [r.user, r.post])).toEqual([
      [SNS_ME, SNS_POST_COCO],
      [SNS_COCO, SNS_POST_MINE],
      [SNS_MONG, SNS_POST_COCO],
    ])
  })
})

describe('팔로잉 피드', () => {
  it('나와 팔로우한 사용자의 원글과 리포스트를 가장 늦은 이벤트 시각에 한 번 싣는다', async () => {
    seedSns({
      follows: [snsRelation(SNS_ME, SNS_MONG), snsRelation(SNS_ME, SNS_COCO)],
      reposts: [
        snsAct(SNS_MONG, SNS_POST_VIDEO, '2026-10-23T08:00:00'),
        snsAct(SNS_MONG, SNS_POST_COCO, '2026-10-23T09:00:00'),
      ],
    })
    // 코코의 원글은 몽이의 리포스트(더 늦음) 위치에 한 번 나오고 몽이가 리포스트한 사람으로 붙는다.
    expect((await feed('following')).items.map(item => [item.post.publicId, item.repostedBy?.nickname ?? null])).toEqual([
      [SNS_POST_COCO, '몽이아빠'],
      [SNS_POST_VIDEO, '몽이아빠'],
      [SNS_POST_NO_CAPTION, null],
      [SNS_POST_MINE_PHOTO, null],
      [SNS_POST_MINE, null],
    ])
  })

  it('차단 상대와 뮤트 상대의 글은 리포스트로 들어와도 빠지고 비로그인은 401이다', async () => {
    seedSns({
      follows: [snsRelation(SNS_ME, SNS_MONG)],
      reposts: [snsAct(SNS_MONG, SNS_POST_TORI), snsAct(SNS_MONG, SNS_POST_SPAM)],
    })
    expect(ids(await feed('following'))).toEqual([SNS_POST_NO_CAPTION, SNS_POST_MINE_PHOTO, SNS_POST_MINE])
    asGuest()
    expect(await failureOf(feed('following'))).toEqual({ status: 401, errorCode: 20004 })
  })

  it('커서로 넘기면 첫 페이지 뒤의 리포스트가 끼어들지 않고 새로 부르면 맨 위에 나온다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_MONG)] })
    const first = await feed('following', { size: 1 })
    expect(ids(first)).toEqual([SNS_POST_NO_CAPTION])

    await axiosInstance.post(`/sns/posts/${SNS_POST_VIDEO}/repost`)
    const second = await feed('following', { size: 10, cursor: first.nextCursor })
    expect(ids(second)).toEqual([SNS_POST_MINE_PHOTO, SNS_POST_MINE])
    expect(second.hasNext).toBe(false)
    expect(ids(await feed('following', { size: 1 }))).toEqual([SNS_POST_VIDEO])
  })

  it('다른 목록의 커서는 400 90002이고 크기가 범위 밖이면 400 90001이다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_MONG)] })
    const first = await feed('following', { size: 1 })
    expect(await failureOf(feed('explore', { cursor: first.nextCursor }))).toEqual({ status: 400, errorCode: 90002 })
    expect(await failureOf(feed('following', { cursor: 'fl||9~0|2026-10-22T09:30:00~없는글' }))).toEqual({
      status: 400,
      errorCode: 90002,
    })
    expect(await failureOf(feed('following', { size: 0 }))).toEqual({ status: 400, errorCode: 90001 })
  })
})

describe('탐색 피드', () => {
  it('비로그인은 7일 안의 모든 원글을 본다. 7일이 지난 글과 리포스트 표시는 없다', async () => {
    seedSns({
      posts: [
        ...currentSns().posts,
        snsPost('01JF9W3Q6R8T2V4X7Z9B1C3OLD', SNS_COCO, { caption: '오래된 글', createdAt: '2026-10-16T09:00:00' }),
      ],
    })
    asGuest()
    const page = await feed('explore')
    expect(ids(page)).not.toContain('01JF9W3Q6R8T2V4X7Z9B1C3OLD')
    expect(ids(page)).toEqual(expect.arrayContaining([SNS_POST_MINE, SNS_POST_TORI, SNS_POST_SPAM]))
    expect(page.items.every(item => item.repostedBy === null && !item.post.reposted)).toBe(true)
  })

  it('로그인이면 내 글, 팔로우한 사용자, 차단 관계, 뮤트한 사용자의 글을 뺀다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_MONG)] })
    expect(ids(await feed('explore'))).toEqual([SNS_POST_VIDEO, SNS_POST_COCO])
  })
})

describe('인기 피드', () => {
  it('리포스트 점수순이고 점수가 0인 글은 없으며 다음 페이지는 첫 페이지의 순위를 따른다', async () => {
    seedSns({
      reposts: [
        snsAct(SNS_MONG, SNS_POST_VIDEO),
        snsAct(SNS_COCO, SNS_POST_VIDEO),
        snsAct(SNS_CHOCO, SNS_POST_COCO),
        snsAct(SNS_CHOCO, SNS_POST_NO_CAPTION),
      ],
    })
    const first = await feed('popular', { size: 1 })
    expect(ids(first)).toEqual([SNS_POST_VIDEO])

    // 첫 페이지 뒤에 코코 글의 점수가 올라도 다음 페이지는 첫 페이지 순위(점수와 시각이 같으면 publicId 역순)다.
    await axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/repost`)
    const next = await feed('popular', { size: 5, cursor: first.nextCursor })
    expect(ids(next)).toEqual([SNS_POST_NO_CAPTION, SNS_POST_COCO])
    expect(next.hasNext).toBe(false)
    expect(ids(await feed('popular'))).toEqual([SNS_POST_VIDEO, SNS_POST_COCO, SNS_POST_NO_CAPTION])
  })

  it('순위가 만료되면 다음 페이지 커서가 400 90002다', async () => {
    seedSns({ reposts: [snsAct(SNS_MONG, SNS_POST_VIDEO), snsAct(SNS_CHOCO, SNS_POST_COCO)] })
    const first = await feed('popular', { size: 1 })
    expireSnsPopularRankings()
    expect(await failureOf(feed('popular', { cursor: first.nextCursor }))).toEqual({ status: 400, errorCode: 90002 })
  })
})

describe('프로필 탭과 저장됨', () => {
  it('그리드는 텍스트를 포함한 원글, 영상 탭은 영상만이고 칸 필드를 싣는다', async () => {
    expect((await grid(`/sns/users/${SNS_ME}/posts`)).items).toEqual([
      {
        publicId: SNS_POST_MINE_PHOTO,
        mediaType: 'PHOTO',
        thumbnailUrl: 'https://cdn.aechak.com/sns/posts/images/bori-1.jpg',
        photoCount: 2,
        captionPreview: null,
      },
      { publicId: SNS_POST_MINE, mediaType: 'TEXT', thumbnailUrl: null, photoCount: 0, captionPreview: '산책 코스 추천받아요' },
    ])
    expect((await grid(`/sns/users/${SNS_CHOCO}/videos`)).items).toEqual([
      {
        publicId: SNS_POST_VIDEO,
        mediaType: 'VIDEO',
        thumbnailUrl: 'https://cdn.aechak.com/sns/posts/images/choco-thumb.jpg',
        photoCount: 0,
        captionPreview: null,
      },
    ])
  })

  it('주인이 나를 차단했으면 404 130000, 내가 주인을 차단했으면 403 130001이고 다른 주인의 커서는 90002다', async () => {
    expect(await failureOf(grid(`/sns/users/${SNS_BLOCKER}/posts`))).toEqual({ status: 404, errorCode: 130000 })
    expect(await failureOf(grid(`/sns/users/${SNS_SPAM}/reposts`))).toEqual({ status: 403, errorCode: 130001 })

    const first = await grid(`/sns/users/${SNS_ME}/posts`, { size: 1 })
    expect(await failureOf(grid(`/sns/users/${SNS_COCO}/posts`, { cursor: first.nextCursor }))).toEqual({
      status: 400,
      errorCode: 90002,
    })
    expect(cells(await grid(`/sns/users/${SNS_ME}/posts`, { size: 1, cursor: first.nextCursor }))).toEqual([
      SNS_POST_MINE,
    ])
  })

  it('리포스트 탭은 최근 리포스트순이고 주인이 아닌 보는 사람에게는 그 사람이 뮤트한 작성자의 글을 뺀다', async () => {
    seedSns({
      reposts: [snsAct(SNS_MONG, SNS_POST_COCO), snsAct(SNS_MONG, SNS_POST_TORI), snsAct(SNS_MONG, SNS_POST_VIDEO)],
    })
    expect(cells(await grid(`/sns/users/${SNS_MONG}/reposts`))).toEqual([SNS_POST_VIDEO, SNS_POST_COCO])
    asGuest()
    expect(cells(await grid(`/sns/users/${SNS_MONG}/reposts`))).toEqual([SNS_POST_VIDEO, SNS_POST_TORI, SNS_POST_COCO])
  })

  it('저장됨은 최근 저장순이고 뮤트한 작성자의 글은 숨겼다가 뮤트를 풀면 다시 나오며 내 글은 늘 나온다', async () => {
    seedSns({ saves: [snsAct(SNS_ME, SNS_POST_TORI), snsAct(SNS_ME, SNS_POST_MINE), snsAct(SNS_ME, SNS_POST_COCO)] })
    expect(cells(await grid('/sns/me/saves'))).toEqual([SNS_POST_COCO, SNS_POST_MINE])
    await axiosInstance.delete(`/sns/users/${SNS_TORI}/mute`)
    expect(cells(await grid('/sns/me/saves'))).toEqual([SNS_POST_COCO, SNS_POST_MINE, SNS_POST_TORI])
    asGuest()
    expect(await failureOf(grid('/sns/me/saves'))).toEqual({ status: 401, errorCode: 20004 })
  })
})
