import { beforeEach, describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse, setAccessToken } from '@aechak/api'
import {
  SNS_BLOCKER,
  SNS_CHOCO,
  SNS_COCO,
  SNS_COMMENT_DELETED,
  SNS_COMMENT_MINE,
  SNS_COMMENT_MONG,
  SNS_FANS,
  SNS_ME,
  SNS_MONG,
  SNS_POST_BLOCKER,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_MINE,
  SNS_POST_SPAM,
  SNS_REPLY_CHOCO,
  SNS_REPLY_COCO,
  SNS_SPAM,
  SNS_TORI,
  SNS_WITHDRAWN,
  currentSns,
  seedSns,
  snsComment,
  snsExampleCommentLikes,
  snsExampleComments,
  snsLike,
  snsRelation,
} from '../server'

// SNS-04 MSW 핸들러 자체의 계약 검증(sns.yaml 0.5.0 SNS-04 초안). 화면 테스트가 이 판정 순서, 숨김 규칙, 안내 문구 규칙을
// 전제로 하므로 여기서 깨지면 화면 실패 원인이 핸들러인지 화면인지 가릴 수 있다(sns-feed-handlers.test.ts와 같은 자리).

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

interface Item {
  publicId: string
  parentPublicId: string | null
  status: string
  content: string | null
  likeCount: number
  liked: boolean
  edited: boolean
  replyable: boolean
  isMine: boolean
}
interface Page {
  items: Item[]
  nextCursor: string | null
  hasNext: boolean
}

const comments = async (post: string, params: Record<string, unknown> = {}) =>
  (await axiosInstance.get<{ data: Page }>(`/sns/posts/${post}/comments`, { params })).data.data
const ids = (page: Page) => page.items.map(item => item.publicId)
const detail = async (post: string) =>
  (await axiosInstance.get<{ data: { likeCount: number; liked: boolean; commentCount: number } }>(`/sns/posts/${post}`))
    .data.data
const write = (post: string, body: Record<string, unknown>, key: string | null = 'key-1') =>
  axiosInstance.post<{ data: Item }>(`/sns/posts/${post}/comments`, body, {
    headers: key == null ? {} : { 'Idempotency-Key': key },
  })
const likers = async (path: string) =>
  (
    await axiosInstance.get<{
      data: { likeCount: number; hasMore: boolean; items: { publicId: string; isMe: boolean; following: boolean }[] }
    }>(path)
  ).data.data

const asGuest = () => setAccessToken(null)

beforeEach(() => {
  seedSns({ comments: snsExampleComments(), likes: snsExampleCommentLikes() })
  setAccessToken('test-token')
})

describe('게시물 좋아요', () => {
  it('켜기는 201, 끄기는 200이고 둘 다 지금의 수를 주며 반복해도 같다', async () => {
    seedSns({ likes: [snsLike(SNS_MONG, SNS_POST_COCO)] })
    const on = await axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/like`)
    expect([on.status, on.data]).toEqual([201, { data: { likeCount: 2 } }])
    expect((await axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/like`)).data).toEqual({ data: { likeCount: 2 } })
    expect(await detail(SNS_POST_COCO)).toMatchObject({ likeCount: 2, liked: true })

    const off = await axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}/like`)
    expect([off.status, off.data]).toEqual([200, { data: { likeCount: 1 } }])
    expect((await axiosInstance.delete(`/sns/posts/${SNS_POST_COCO}/like`)).data).toEqual({ data: { likeCount: 1 } })
    expect(await detail(SNS_POST_COCO)).toMatchObject({ likeCount: 1, liked: false })
  })

  it('자기 게시물에도 누를 수 있고 끄기도 켜기와 같은 판정이다', async () => {
    expect((await axiosInstance.post(`/sns/posts/${SNS_POST_MINE}/like`)).status).toBe(201)
    for (const send of [axiosInstance.post, axiosInstance.delete]) {
      expect(await failureOf(send(`/sns/posts/${SNS_POST_DELETED}/like`))).toEqual({ status: 404, errorCode: 130400 })
      expect(await failureOf(send(`/sns/posts/${SNS_POST_BLOCKER}/like`))).toEqual({ status: 404, errorCode: 130400 })
      expect(await failureOf(send(`/sns/posts/${SNS_POST_SPAM}/like`))).toEqual({ status: 403, errorCode: 130001 })
    }
  })

  it('이용 제한 계정은 403 20013이고 비로그인은 401이며 비로그인 상세의 liked는 false다', async () => {
    seedSns({ restricted: [SNS_ME], likes: [snsLike(SNS_ME, SNS_POST_COCO)] })
    expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/like`))).toEqual({
      status: 403,
      errorCode: 20013,
    })
    asGuest()
    expect(await detail(SNS_POST_COCO)).toMatchObject({ likeCount: 1, liked: false })
    expect(await failureOf(axiosInstance.post(`/sns/posts/${SNS_POST_COCO}/like`))).toEqual({
      status: 401,
      errorCode: 20004,
    })
  })
})

describe('좋아요한 사람', () => {
  it('최근에 누른 순서이고 차단 관계와 탈퇴한 사용자는 빠지되 수에는 남고 뮤트한 사용자는 나온다', async () => {
    seedSns({
      likes: [
        snsLike(SNS_TORI, SNS_POST_COCO),
        snsLike(SNS_SPAM, SNS_POST_COCO),
        snsLike(SNS_BLOCKER, SNS_POST_COCO),
        snsLike(SNS_WITHDRAWN, SNS_POST_COCO),
        snsLike(SNS_ME, SNS_POST_COCO),
        snsLike(SNS_COCO, SNS_POST_COCO),
      ],
      follows: [snsRelation(SNS_ME, SNS_COCO)],
    })
    const result = await likers(`/sns/posts/${SNS_POST_COCO}/likers`)
    expect(result.likeCount).toBe(6)
    expect(result.hasMore).toBe(false)
    expect(result.items).toEqual([
      expect.objectContaining({ publicId: SNS_COCO, isMe: false, following: true }),
      expect.objectContaining({ publicId: SNS_ME, isMe: true, following: false }),
      expect.objectContaining({ publicId: SNS_TORI, isMe: false, following: false }),
    ])
  })

  it('뺀 뒤에도 100명을 넘으면 100명까지 주고 hasMore가 true다', async () => {
    seedSns({ likes: SNS_FANS.map(fan => snsLike(fan, SNS_POST_COCO)) })
    const result = await likers(`/sns/posts/${SNS_POST_COCO}/likers`)
    expect([result.likeCount, result.items.length, result.hasMore]).toEqual([101, 100, true])
    expect(result.items[0]!.publicId).toBe(SNS_FANS[100])
  })

  it('게시물 판정은 상세와 같고 댓글은 안내 문구면 130700이며 비로그인은 401이다', async () => {
    expect(await failureOf(likers(`/sns/posts/${SNS_POST_DELETED}/likers`))).toEqual({ status: 404, errorCode: 130400 })
    expect(await failureOf(likers(`/sns/posts/${SNS_POST_SPAM}/likers`))).toEqual({ status: 403, errorCode: 130001 })
    expect(await failureOf(likers(`/sns/comments/${SNS_COMMENT_DELETED}/likers`))).toEqual({
      status: 404,
      errorCode: 130700,
    })
    expect((await likers(`/sns/comments/${SNS_COMMENT_MONG}/likers`)).likeCount).toBe(2)
    asGuest()
    expect(await failureOf(likers(`/sns/posts/${SNS_POST_COCO}/likers`))).toEqual({ status: 401, errorCode: 20004 })
  })
})

describe('댓글 목록', () => {
  it('계약 예시처럼 오래된순 스레드이고 size는 최상위 댓글 수이며 커서로 이어 부른다', async () => {
    const first = await comments(SNS_POST_COCO, { size: 2 })
    expect(ids(first)).toEqual([SNS_COMMENT_MONG, SNS_REPLY_COCO, SNS_COMMENT_DELETED, SNS_REPLY_CHOCO])
    expect(first.items.map(item => [item.status, item.replyable])).toEqual([
      ['ACTIVE', true],
      ['ACTIVE', true],
      ['DELETED', false],
      ['ACTIVE', false],
    ])
    expect(first.items[0]).toMatchObject({ likeCount: 2, liked: true, isMine: false })
    expect(first.items[1]).toMatchObject({ parentPublicId: SNS_COMMENT_MONG, edited: true })
    expect(first.items[2]).toMatchObject({ content: null, likeCount: 0 })
    expect(first.hasNext).toBe(true)

    const last = await comments(SNS_POST_COCO, { size: 2, cursor: first.nextCursor })
    expect(ids(last)).toEqual([SNS_COMMENT_MINE])
    expect(last.items[0]).toMatchObject({ isMine: true, likeCount: 1 })
    expect([last.hasNext, last.nextCursor]).toEqual([false, null])
  })

  it('다른 게시물의 커서는 400 90002, 범위 밖 size는 400 90001이다', async () => {
    const first = await comments(SNS_POST_COCO, { size: 1 })
    expect(await failureOf(comments(SNS_POST_MINE, { cursor: first.nextCursor }))).toEqual({
      status: 400,
      errorCode: 90002,
    })
    expect(await failureOf(comments(SNS_POST_COCO, { size: 101 }))).toEqual({ status: 400, errorCode: 90001 })
  })

  it('비로그인도 읽고 liked와 isMine이 false다', async () => {
    asGuest()
    const page = await comments(SNS_POST_COCO)
    expect(page.items).toHaveLength(5)
    expect(page.items.every(item => !item.liked && !item.isMine)).toBe(true)
  })

  it('차단 관계, 내가 뮤트한 사용자의 댓글은 대댓글과 함께 빠지고 댓글 수는 줄지 않는다', async () => {
    seedSns({
      comments: snsExampleComments(),
      blocks: [...currentSns().blocks, snsRelation(SNS_ME, SNS_MONG)],
      mutes: [...currentSns().mutes, snsRelation(SNS_ME, SNS_CHOCO)],
    })
    // 몽이아빠의 댓글과 그 아래 코코집사의 대댓글이 빠지고, 초코맘의 대댓글이 빠져 지운 최상위 댓글의 안내 문구도 빠진다.
    expect(ids(await comments(SNS_POST_COCO))).toEqual([SNS_COMMENT_MINE])
    expect((await detail(SNS_POST_COCO)).commentCount).toBe(4)
  })

  it('게시물 작성자가 뮤트한 사용자의 댓글은 그 사용자에게만 보이고 그 사용자의 수에만 든다', async () => {
    seedSns({ comments: snsExampleComments(), mutes: [snsRelation(SNS_COCO, SNS_MONG)] })
    expect(ids(await comments(SNS_POST_COCO))).not.toContain(SNS_COMMENT_MONG)
    expect((await detail(SNS_POST_COCO)).commentCount).toBe(2)

    seedSns({ viewer: SNS_MONG, comments: snsExampleComments(), mutes: [snsRelation(SNS_COCO, SNS_MONG)] })
    expect(ids(await comments(SNS_POST_COCO)).slice(0, 2)).toEqual([SNS_COMMENT_MONG, SNS_REPLY_COCO])
    expect((await detail(SNS_POST_COCO)).commentCount).toBe(4)
  })

  it('탈퇴한 사용자의 댓글은 SNS-T18 전처럼 WITHDRAWN 안내 문구이고 그 아래 대댓글은 답글을 달 수 없다', async () => {
    seedSns({
      comments: [
        snsComment('01KCW0000000000000000000A1', SNS_POST_COCO, SNS_WITHDRAWN),
        snsComment('01KCW0000000000000000000A2', SNS_POST_COCO, SNS_MONG, { parent: '01KCW0000000000000000000A1' }),
      ],
    })
    const page = await comments(SNS_POST_COCO)
    expect(page.items.map(item => [item.status, item.replyable])).toEqual([
      ['WITHDRAWN', false],
      ['ACTIVE', false],
    ])
  })
})

describe('댓글 작성', () => {
  it('같은 키로 다시 보내면 본문이 달라도 처음 댓글이고 새 키는 같은 문장이어도 새 댓글이다', async () => {
    const first = (await write(SNS_POST_MINE, { content: '첫 댓글' }, 'key-a')).data.data
    const again = await write(SNS_POST_MINE, { content: '다른 문장' }, 'key-a')
    expect([again.status, again.data.data]).toEqual([201, first])
    expect(first).toMatchObject({ status: 'ACTIVE', isMine: true, replyable: true, content: '첫 댓글' })

    const next = (await write(SNS_POST_MINE, { content: '첫 댓글' }, 'key-b')).data.data
    expect(next.publicId).not.toBe(first.publicId)
    // 다른 게시물에서 같은 키를 쓰면 새 댓글이다.
    expect((await write(SNS_POST_COCO, { content: '첫 댓글' }, 'key-a')).data.data.publicId).not.toBe(first.publicId)
  })

  it('원래 댓글을 그사이 지웠으면 같은 키 재요청은 201과 DELETED 항목이다', async () => {
    const first = (await write(SNS_POST_MINE, { content: '지울 댓글' }, 'key-a')).data.data
    await axiosInstance.delete(`/sns/comments/${first.publicId}`)
    expect((await write(SNS_POST_MINE, { content: '지울 댓글' }, 'key-a')).data.data).toMatchObject({
      publicId: first.publicId,
      status: 'DELETED',
    })
  })

  it('키와 내용 규칙은 90001, 90004, 130702, 130703, 130704 순서이고 기준 이하의 금지어는 가린다', async () => {
    expect(await failureOf(write(SNS_POST_MINE, { content: '키 없음' }, null))).toEqual({ status: 400, errorCode: 90001 })
    expect(await failureOf(write(SNS_POST_MINE, { content: '빈 키' }, ' '))).toEqual({ status: 400, errorCode: 90004 })
    expect(await failureOf(write(SNS_POST_MINE, { content: ' \n ' }))).toEqual({ status: 400, errorCode: 130702 })
    expect(await failureOf(write(SNS_POST_MINE, { content: '가'.repeat(501) }))).toEqual({ status: 400, errorCode: 130703 })
    expect(await failureOf(write(SNS_POST_MINE, { content: '욕설 욕설 좋아' }))).toEqual({ status: 400, errorCode: 130704 })
    // 500자는 된다. 이모지 하나는 한 글자다.
    expect((await write(SNS_POST_MINE, { content: '😀'.repeat(500) }, 'key-500')).status).toBe(201)
    expect((await write(SNS_POST_MINE, { content: '욕설 좋아' }, 'key-mask')).data.data.content).toBe('** 좋아')
  })

  it('대댓글에 단 답글은 최상위 댓글 아래 붙는다', async () => {
    const reply = (await write(SNS_POST_COCO, { content: '저도요', parentPublicId: SNS_REPLY_COCO })).data.data
    expect(reply.parentPublicId).toBe(SNS_COMMENT_MONG)
    expect(ids(await comments(SNS_POST_COCO)).slice(0, 3)).toEqual([SNS_COMMENT_MONG, SNS_REPLY_COCO, reply.publicId])
  })

  it('안내 문구 스레드의 답글은 409 130705, 숨긴 댓글과 다른 게시물의 댓글은 404 130700이다', async () => {
    for (const parent of [SNS_COMMENT_DELETED, SNS_REPLY_CHOCO]) {
      expect(await failureOf(write(SNS_POST_COCO, { content: '답글', parentPublicId: parent }))).toEqual({
        status: 409,
        errorCode: 130705,
      })
    }
    expect(await failureOf(write(SNS_POST_MINE, { content: '답글', parentPublicId: SNS_COMMENT_MONG }))).toEqual({
      status: 404,
      errorCode: 130700,
    })
    seedSns({ comments: snsExampleComments(), mutes: [snsRelation(SNS_ME, SNS_MONG)] })
    expect(await failureOf(write(SNS_POST_COCO, { content: '답글', parentPublicId: SNS_REPLY_COCO }))).toEqual({
      status: 404,
      errorCode: 130700,
    })
  })

  it('게시물 판정은 상세와 같고 이용 제한 계정은 403 20013이다', async () => {
    expect(await failureOf(write(SNS_POST_DELETED, { content: '댓글' }))).toEqual({ status: 404, errorCode: 130400 })
    expect(await failureOf(write(SNS_POST_SPAM, { content: '댓글' }))).toEqual({ status: 403, errorCode: 130001 })
    seedSns({ restricted: [SNS_ME] })
    expect(await failureOf(write(SNS_POST_COCO, { content: '댓글' }))).toEqual({ status: 403, errorCode: 20013 })
  })
})

describe('댓글 단건, 수정, 삭제, 좋아요', () => {
  it('단건은 대댓글이면 최상위 댓글을 parent로 주고 안내 문구 최상위 댓글도 그대로 준다', async () => {
    const get = async (id: string) =>
      (await axiosInstance.get<{ data: { comment: Item; parent: Item | null } }>(`/sns/comments/${id}`)).data.data
    expect(await get(SNS_REPLY_COCO)).toMatchObject({
      comment: { publicId: SNS_REPLY_COCO },
      parent: { publicId: SNS_COMMENT_MONG },
    })
    expect((await get(SNS_REPLY_CHOCO)).parent).toMatchObject({ publicId: SNS_COMMENT_DELETED, status: 'DELETED' })
    expect((await get(SNS_COMMENT_MINE)).parent).toBeNull()
    seedSns({ comments: snsExampleComments(), blocks: [snsRelation(SNS_ME, SNS_MONG)] })
    expect(await failureOf(get(SNS_REPLY_COCO))).toEqual({ status: 404, errorCode: 130700 })
  })

  it('수정은 내용 규칙이 먼저이고 남의 댓글 130701, 지운 댓글 130700이며 같은 내용은 수정됨을 그대로 둔다', async () => {
    const patch = (id: string, content: string) =>
      axiosInstance.patch<{ data: Item }>(`/sns/comments/${id}`, { content })
    expect(await failureOf(patch('01KCZZZZZZZZZZZZZZZZZZZZZZ', ''))).toEqual({ status: 400, errorCode: 130702 })
    expect(await failureOf(patch('01KCZZZZZZZZZZZZZZZZZZZZZZ', '수정'))).toEqual({ status: 404, errorCode: 130700 })
    expect(await failureOf(patch(SNS_COMMENT_MONG, '수정'))).toEqual({ status: 403, errorCode: 130701 })
    expect((await patch(SNS_COMMENT_MINE, '산책 코스 어디예요?')).data.data.edited).toBe(false)
    expect((await patch(SNS_COMMENT_MINE, '한강 쪽이면 좋겠어요')).data.data).toMatchObject({
      content: '한강 쪽이면 좋겠어요',
      edited: true,
    })
    await axiosInstance.delete(`/sns/comments/${SNS_COMMENT_MINE}`)
    expect(await failureOf(patch(SNS_COMMENT_MINE, '다시'))).toEqual({ status: 404, errorCode: 130700 })
  })

  it('삭제는 반복해도 204이고 남의 댓글은 130701, 대댓글이 남으면 안내 문구, 마지막 대댓글을 지우면 안내 문구도 빠진다', async () => {
    seedSns({ viewer: SNS_CHOCO, comments: snsExampleComments() })
    expect(await failureOf(axiosInstance.delete(`/sns/comments/${SNS_COMMENT_MONG}`))).toEqual({
      status: 403,
      errorCode: 130701,
    })
    expect((await axiosInstance.delete(`/sns/comments/${SNS_REPLY_CHOCO}`)).status).toBe(204)
    expect((await axiosInstance.delete(`/sns/comments/${SNS_REPLY_CHOCO}`)).status).toBe(204)
    expect(ids(await comments(SNS_POST_COCO))).toEqual([SNS_COMMENT_MONG, SNS_REPLY_COCO, SNS_COMMENT_MINE])

    seedSns({ viewer: SNS_MONG, comments: snsExampleComments() })
    await axiosInstance.delete(`/sns/comments/${SNS_COMMENT_MONG}`)
    expect((await comments(SNS_POST_COCO)).items.slice(0, 2).map(item => item.status)).toEqual(['DELETED', 'ACTIVE'])
    expect(await failureOf(axiosInstance.delete('/sns/comments/01KCZZZZZZZZZZZZZZZZZZZZZZ'))).toEqual({
      status: 404,
      errorCode: 130700,
    })
  })

  it('댓글 좋아요는 지금의 수를 주고 안내 문구 댓글은 130700이다', async () => {
    expect((await axiosInstance.post(`/sns/comments/${SNS_REPLY_COCO}/like`)).data).toEqual({ data: { likeCount: 2 } })
    expect((await axiosInstance.delete(`/sns/comments/${SNS_COMMENT_MONG}/like`)).data).toEqual({ data: { likeCount: 1 } })
    expect(await failureOf(axiosInstance.post(`/sns/comments/${SNS_COMMENT_DELETED}/like`))).toEqual({
      status: 404,
      errorCode: 130700,
    })
    // 자기 댓글에도 누를 수 있다.
    expect((await axiosInstance.post(`/sns/comments/${SNS_COMMENT_MINE}/like`)).status).toBe(201)
  })
})
