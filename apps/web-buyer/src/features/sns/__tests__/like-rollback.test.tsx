import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { setAccessToken, type SnsFeedPageResult } from '@aechak/api'
import { SNS_POST_LIKE_URL, server } from '@/testing/msw/server'
import { snsKeys, useSnsLike, type SnsPost } from '../sns.queries'

const ID = '01JF9W3Q6R8T2V4X7Z9B1C3D5J'
const post = (likeCount: number, liked: boolean) => ({ publicId: ID, likeCount, liked }) as SnsPost
const feed = (p: SnsPost): InfiniteData<SnsFeedPageResult> => ({
  pages: [{ items: [{ post: p, repostedBy: null }], nextCursor: null, hasNext: false } as SnsFeedPageResult],
  pageParams: [undefined],
})

describe('좋아요 실패 뒤 되돌리기', () => {
  it('[AC-SNS04-002] 캐시마다 받은 값이 달라도 각 캐시를 누르기 전 자기 값으로 되돌린다', async () => {
    setAccessToken('test-token')
    server.use(http.post(SNS_POST_LIKE_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const detailKey = [...snsKeys.post(ID), true]
    const feedKey = snsKeys.feed('explore', true)
    queryClient.setQueryData(detailKey, post(0, false))
    queryClient.setQueryData(feedKey, feed(post(5, false)))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSnsLike(ID), { wrapper })

    result.current(true)

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(queryClient.getQueryData<SnsPost>(detailKey)).toMatchObject({ likeCount: 0, liked: false })
    expect(queryClient.getQueryData<InfiniteData<SnsFeedPageResult>>(feedKey)?.pages[0]?.items[0]?.post).toMatchObject({
      likeCount: 5,
      liked: false,
    })
  })
  it('[AC-SNS04-001] 상세와 카드처럼 다른 훅에서 눌러도 같은 게시물의 요청이 끝날 때까지 다음 요청을 보내지 않는다', async () => {
    setAccessToken('test-token')
    let requests = 0
    server.use(
      http.post(SNS_POST_LIKE_URL, async () => {
        requests += 1
        await delay(30)
        return HttpResponse.json({ data: { likeCount: 1 } }, { status: 201 })
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData([...snsKeys.post(ID), true], post(0, false))
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const detail = renderHook(() => useSnsLike(ID), { wrapper })
    const card = renderHook(() => useSnsLike(ID), { wrapper })

    detail.result.current(true)
    card.result.current(true)

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(requests).toBe(1)
  })
})
