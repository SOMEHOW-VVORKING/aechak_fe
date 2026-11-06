import { beforeEach, describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse, setAccessToken } from '@aechak/api'
import {
  SNS_BANNED_WORD,
  SNS_ME,
  SNS_POST_BLOCKER,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_MINE,
  SNS_POST_SPAM,
  SNS_POST_TORI,
  currentSns,
  expireSnsUploads,
  seedSns,
} from '../server'

// SNS-02 MSW 핸들러 자체의 계약 검증. 화면 테스트가 이 판정 순서와 에러 코드를 전제로 하므로 여기서 깨지면
// 화면 실패 원인이 핸들러인지 화면인지 가릴 수 있다(order-handlers.test.ts와 같은 자리).

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

const presign = (body: Record<string, unknown>) =>
  axiosInstance.post<{ data: { url: string; key: string } }>('/files/presigned-url', body)

async function upload(purpose = 'SNS_POST_IMAGE', contentType = 'image/jpeg') {
  const { data } = await presign({ purpose, contentType, contentLength: 1000 })
  await fetch(data.data.url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: 'x' })
  return data.data.key
}

const createPost = (body: Record<string, unknown>, key = 'key-1') =>
  axiosInstance.post<{ data: { publicId: string } }>('/sns/posts', body, { headers: { 'Idempotency-Key': key } })

const getPost = (publicId: string) => axiosInstance.get(`/sns/posts/${publicId}`)

beforeEach(() => {
  seedSns()
  setAccessToken('test-token')
})

describe('presigned 발급(SNS 용도)', () => {
  it('SNS_POST_IMAGE에 contentLength가 없으면 400 90001이다', async () => {
    expect(await failureOf(presign({ purpose: 'SNS_POST_IMAGE', contentType: 'image/jpeg' }))).toEqual({
      status: 400,
      errorCode: 90001,
    })
  })

  it('10MB와 100MB를 넘으면 400 100004이고 정확히 상한이면 발급한다', async () => {
    expect(
      await failureOf(presign({ purpose: 'SNS_POST_IMAGE', contentType: 'image/jpeg', contentLength: 10 * 1024 * 1024 + 1 })),
    ).toEqual({ status: 400, errorCode: 100004 })
    expect(
      await failureOf(
        presign({ purpose: 'SNS_POST_VIDEO', contentType: 'video/mp4', contentLength: 100 * 1024 * 1024 + 1 }),
      ),
    ).toEqual({ status: 400, errorCode: 100004 })
    const { data } = await presign({ purpose: 'SNS_POST_IMAGE', contentType: 'image/jpeg', contentLength: 10 * 1024 * 1024 })
    expect(data.data.key).toMatch(/^tmp\/1\/sns\/posts\/images\/\w{26}\.jpeg$/)
  })

  it('용도 밖 형식은 100000, 모르는 용도와 0 길이는 90001이다', async () => {
    expect(await failureOf(presign({ purpose: 'SNS_POST_IMAGE', contentType: 'video/mp4', contentLength: 1 }))).toEqual({
      status: 400,
      errorCode: 100000,
    })
    expect(await failureOf(presign({ purpose: 'UNKNOWN', contentType: 'image/jpeg' }))).toEqual({
      status: 400,
      errorCode: 90001,
    })
    expect(await failureOf(presign({ purpose: 'REVIEW_IMAGE', contentType: 'image/png', contentLength: 0 }))).toEqual({
      status: 400,
      errorCode: 90001,
    })
  })

  it('기존 용도는 contentLength 없이 그대로 발급한다', async () => {
    const { data } = await presign({ purpose: 'REVIEW_IMAGE', contentType: 'image/png' })
    expect(data.data.key).toBe('tmp/1/reviews/images/fixture.png')
  })
})

describe('POST /sns/posts', () => {
  it('같은 Idempotency-Key로 다시 보내면 같은 publicId이고 게시물은 하나다', async () => {
    const photo = await upload()
    const first = await createPost({ caption: '첫 글', photoKeys: [photo], video: null, hashtags: [] })
    const replay = await createPost({ caption: '본문이 달라도', photoKeys: [], video: null, hashtags: [] })
    expect(replay.data.data.publicId).toBe(first.data.data.publicId)
    expect(currentSns().posts.filter(p => p.idempotencyKey === 'key-1')).toHaveLength(1)
  })

  it('같은 키로 동시에 두 번 보내도 게시물은 하나다', async () => {
    const body = { caption: '연타', photoKeys: [], video: null, hashtags: [] }
    const [a, b] = await Promise.all([createPost(body, 'tap'), createPost(body, 'tap')])
    expect(a.data.data.publicId).toBe(b.data.data.publicId)
    expect(currentSns().posts.filter(p => p.idempotencyKey === 'tap')).toHaveLength(1)
  })

  it('판정 순서는 130402가 해시태그 규칙보다 먼저다', async () => {
    expect(await failureOf(createPost({ caption: null, hashtags: ['bad!'] }))).toEqual({ status: 400, errorCode: 130402 })
  })

  it('남이 발급받은 키는 403 100002다', async () => {
    expect(await failureOf(createPost({ photoKeys: ['tmp/2/sns/posts/images/x.jpeg'] }))).toEqual({
      status: 403,
      errorCode: 100002,
    })
  })

  it('헤더가 없으면 90001, 비었으면 90004다', async () => {
    const body = { caption: '글', photoKeys: [], video: null, hashtags: [] }
    expect(await failureOf(axiosInstance.post('/sns/posts', body))).toEqual({ status: 400, errorCode: 90001 })
    expect(await failureOf(createPost(body, ' '))).toEqual({ status: 400, errorCode: 90004 })
  })

  it('캡션과 첨부가 없으면 해시태그가 있어도 130402다', async () => {
    expect(await failureOf(createPost({ caption: '   ', photoKeys: [], video: null, hashtags: ['산책'] }))).toEqual({
      status: 400,
      errorCode: 130402,
    })
  })

  it('캡션은 코드 포인트로 세어 2,200자를 넘으면 130403이다', async () => {
    await createPost({ caption: '😀'.repeat(2200), photoKeys: [], video: null, hashtags: [] }, 'emoji-ok')
    expect(
      await failureOf(createPost({ caption: '😀'.repeat(2201), photoKeys: [], video: null, hashtags: [] }, 'emoji-over')),
    ).toEqual({ status: 400, errorCode: 130403 })
  })

  it('사진 11장, 같은 키 두 번, 사진과 영상 함께는 130404다', async () => {
    const photo = await upload()
    expect(await failureOf(createPost({ photoKeys: Array.from({ length: 11 }, (_, i) => `k${i}`) }))).toEqual({
      status: 400,
      errorCode: 130404,
    })
    expect(await failureOf(createPost({ photoKeys: [photo, photo] }))).toEqual({ status: 400, errorCode: 130404 })
    const video = { key: 'tmp/1/sns/posts/videos/a.mp4', thumbnailKey: 'tmp/1/sns/posts/images/b.jpeg', durationMs: 1000 }
    expect(await failureOf(createPost({ photoKeys: [photo], video }))).toEqual({ status: 400, errorCode: 130404 })
  })

  it('영상이 60초를 넘으면 130407이다', async () => {
    const video = await upload('SNS_POST_VIDEO', 'video/mp4')
    const thumbnail = await upload()
    expect(
      await failureOf(createPost({ video: { key: video, thumbnailKey: thumbnail, durationMs: 60_001 } })),
    ).toEqual({ status: 400, errorCode: 130407 })
  })

  it('해시태그 규칙(130500, 130501, 130406, 130502)을 지키고 표기만 다른 태그는 하나로 합친다', async () => {
    const tags = (hashtags: string[], key: string) => createPost({ caption: '글', hashtags }, key)
    expect(await failureOf(tags(['산 책'], 'a'))).toEqual({ status: 400, errorCode: 130500 })
    expect(await failureOf(tags(['가'.repeat(31)], 'b'))).toEqual({ status: 400, errorCode: 130501 })
    expect(await failureOf(tags(Array.from({ length: 31 }, (_, i) => `태그${i}`), 'c'))).toEqual({
      status: 400,
      errorCode: 130406,
    })
    expect(await failureOf(tags([SNS_BANNED_WORD], 'd'))).toEqual({ status: 400, errorCode: 130502 })
    const created = await tags(['#DOG', 'dog'], 'e')
    expect((await getPost(created.data.data.publicId)).data.data.hashtags).toEqual(['dog'])
  })

  it('금지어 비율이 0.5를 넘으면 130405이고 이하면 가려서 저장한다', async () => {
    expect(await failureOf(createPost({ caption: `${SNS_BANNED_WORD} ${SNS_BANNED_WORD}` }, 'a'))).toEqual({
      status: 400,
      errorCode: 130405,
    })
    const created = await createPost({ caption: `오늘 산책 ${SNS_BANNED_WORD}` }, 'b')
    expect((await getPost(created.data.data.publicId)).data.data.caption).toBe('오늘 산책 **')
  })

  it('다른 용도의 키는 100003, 올리지 않았거나 이미 쓴 키는 404 100001이다', async () => {
    const review = (await presign({ purpose: 'REVIEW_IMAGE', contentType: 'image/png' })).data.data.key
    expect(await failureOf(createPost({ photoKeys: [review] }, 'a'))).toEqual({ status: 400, errorCode: 100003 })

    const photo = await upload()
    await createPost({ photoKeys: [photo] }, 'b')
    expect(await failureOf(createPost({ photoKeys: [photo] }, 'c'))).toEqual({ status: 404, errorCode: 100001 })

    const expired = await upload()
    expireSnsUploads()
    expect(await failureOf(createPost({ photoKeys: [expired] }, 'd'))).toEqual({ status: 404, errorCode: 100001 })
  })

  it('비로그인은 401 20004다', async () => {
    setAccessToken(null)
    expect(await failureOf(createPost({ caption: '글' }))).toEqual({ status: 401, errorCode: 20004 })
  })
})

describe('GET /sns/posts/{publicId}', () => {
  it('삭제, 없음, 나를 차단한 작성자는 404 130400이고 내가 차단한 작성자는 403 130001이다', async () => {
    for (const id of [SNS_POST_DELETED, 'nope', SNS_POST_BLOCKER]) {
      expect(await failureOf(getPost(id))).toEqual({ status: 404, errorCode: 130400 })
    }
    expect(await failureOf(getPost(SNS_POST_SPAM))).toEqual({ status: 403, errorCode: 130001 })
  })

  it('뮤트한 작성자는 200과 mutedByMe=true, 내 게시물은 isMine=true다', async () => {
    expect((await getPost(SNS_POST_TORI)).data.data.mutedByMe).toBe(true)
    expect((await getPost(SNS_POST_MINE)).data.data.isMine).toBe(true)
  })

  it('비로그인은 보는 사람 필드가 모두 false이고 차단 판정을 하지 않는다', async () => {
    setAccessToken(null)
    const { data } = await getPost(SNS_POST_SPAM)
    expect([data.data.isMine, data.data.following, data.data.mutedByMe]).toEqual([false, false, false])
  })
})

describe('PATCH와 DELETE /sns/posts/{publicId}', () => {
  const patch = (publicId: string, body: Record<string, unknown>) => axiosInstance.patch(`/sns/posts/${publicId}`, body)

  it('caption이나 hashtags가 빠지면 90001이다', async () => {
    expect(await failureOf(patch(SNS_POST_MINE, { hashtags: [] }))).toEqual({ status: 400, errorCode: 90001 })
    expect(await failureOf(patch(SNS_POST_MINE, { caption: '글' }))).toEqual({ status: 400, errorCode: 90001 })
  })

  it('바뀐 것 없이 저장하면 edited가 그대로고 바꾸면 true다', async () => {
    await patch(SNS_POST_MINE, { caption: '산책 코스 추천받아요', hashtags: [] })
    expect((await getPost(SNS_POST_MINE)).data.data.edited).toBe(false)
    await patch(SNS_POST_MINE, { caption: '바꾼 캡션', hashtags: ['산책'] })
    const { data } = await getPost(SNS_POST_MINE)
    expect([data.data.edited, data.data.caption, data.data.hashtags]).toEqual([true, '바꾼 캡션', ['산책']])
  })

  it('텍스트 게시물 캡션 비우기 130402, 남의 게시물 403 130401, 삭제된 게시물 404 130400이다', async () => {
    expect(await failureOf(patch(SNS_POST_MINE, { caption: null, hashtags: [] }))).toEqual({
      status: 400,
      errorCode: 130402,
    })
    expect(await failureOf(patch(SNS_POST_COCO, { caption: '남의 글', hashtags: [] }))).toEqual({
      status: 403,
      errorCode: 130401,
    })
    seedSns({ posts: currentSns().posts.map(p => (p.publicId === SNS_POST_MINE ? { ...p, deleted: true } : p)) })
    expect(await failureOf(patch(SNS_POST_MINE, { caption: '글', hashtags: [] }))).toEqual({
      status: 404,
      errorCode: 130400,
    })
  })

  it('삭제는 두 번 보내도 204이고 남의 게시물은 403 130401이다', async () => {
    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_MINE}`)).status).toBe(204)
    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_MINE}`)).status).toBe(204)
    expect(currentSns().posts.find(p => p.publicId === SNS_POST_MINE)?.deleted).toBe(true)
    expect(await failureOf(axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}`))).toEqual({
      status: 403,
      errorCode: 130401,
    })
  })
})

describe('GET /sns/hashtags', () => {
  const search = (query?: string, size?: number) =>
    axiosInstance.get('/sns/hashtags', { params: { query, size } }).then(r => r.data.data)

  it('댕을 입력하면 NEW와 수 많은 순 부분 일치 목록이다', async () => {
    const data = await search('댕')
    expect(data.status).toBe('NEW')
    expect(data.items.map((t: { name: string }) => t.name)).toEqual(['댕댕이', '댕댕', '댕청미'])
  })

  it('같은 이름이 있으면 EXISTS와 exact이고 items에는 다시 없다', async () => {
    const data = await search('#산책')
    expect(data.status).toBe('EXISTS')
    // 기본 50과 SNS_POST_COCO, SNS_POST_NO_CAPTION의 태그 두 개를 합해 52다.
    expect(data.exact).toEqual({ name: '산책', postCount: 52 })
    expect(data.items.some((t: { name: string }) => t.name === '산책')).toBe(false)
  })

  it('빈 입력과 #만 입력하면 EMPTY와 추천 태그다', async () => {
    expect((await search('#')).status).toBe('EMPTY')
    expect((await search()).items[0]).toEqual({ name: '댕댕이', postCount: 1200 })
  })

  it('INVALID, TOO_LONG은 빈 목록이고 BANNED는 400을 내지 않는다', async () => {
    expect(await search('산책!')).toMatchObject({ status: 'INVALID', items: [] })
    expect(await search('가'.repeat(31))).toMatchObject({ status: 'TOO_LONG', items: [] })
    expect((await search(SNS_BANNED_WORD)).status).toBe('BANNED')
  })

  it('size가 1부터 50 밖이면 90001이고 비로그인은 401이다', async () => {
    expect(await failureOf(search('댕', 51))).toEqual({ status: 400, errorCode: 90001 })
    setAccessToken(null)
    seedSns({ viewer: SNS_ME })
    expect(await failureOf(search('댕'))).toEqual({ status: 401, errorCode: 20004 })
  })
})
