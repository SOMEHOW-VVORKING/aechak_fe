import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import { PRODUCT_LIKE_URL, server } from '@/testing/msw/server'
import { isWished, resetWishlist } from '../wishlist.store'
import { toggleWishlist } from '../wishlist.queries'

describe('toggleWishlist', () => {
  beforeEach(() => {
    resetWishlist()
  })

  it('[AC-WISH-009] 목업 상품(mock 카탈로그 id)은 서버 호출 없이 클라이언트 토글만 한다', async () => {
    let likeCalls = 0
    server.use(
      http.post(PRODUCT_LIKE_URL, () => {
        likeCalls += 1
        return new HttpResponse(null, { status: 201 })
      }),
    )

    toggleWishlist('p-feeder-5l') // 목업 카탈로그 id
    expect(isWished('p-feeder-5l')).toBe(true) // 낙관적 반영

    // 서버 호출이 없어야 한다 — 잠깐 대기 후 카운터가 0인지 확인.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(likeCalls).toBe(0)
  })

  it('[AC-WISH-010] 실 상품 id는 낙관적 반영 후 서버 like를 발사한다', async () => {
    let likeCalls = 0
    server.use(
      http.post(PRODUCT_LIKE_URL, () => {
        likeCalls += 1
        return new HttpResponse(null, { status: 201 })
      }),
    )

    toggleWishlist('p-real-1') // mock 카탈로그에 없는 실 id
    expect(isWished('p-real-1')).toBe(true) // 낙관적 반영
    await waitFor(() => expect(likeCalls).toBe(1))
  })

  it('[AC-WISH-011] 서버 like 실패(비401)면 낙관적 반영을 롤백한다', async () => {
    server.use(
      http.post(PRODUCT_LIKE_URL, () =>
        HttpResponse.json({ errorCode: 40000, message: 'not found' }, { status: 404 }),
      ),
    )

    toggleWishlist('p-real-2')
    expect(isWished('p-real-2')).toBe(true) // 낙관적
    await waitFor(() => expect(isWished('p-real-2')).toBe(false)) // 롤백
  })
})
