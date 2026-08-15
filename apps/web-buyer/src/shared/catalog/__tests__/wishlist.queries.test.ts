import { waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import type { ProductSummaryResponse } from '@aechak/api'
import { PRODUCT_LIKE_URL, server } from '@/testing/msw/server'
import { addWish, isWished, removeWish, resetWishlist } from '../wishlist.store'
import {
  currentSessionEpoch,
  hydrateLikedFromDetail,
  hydrateLikedFromSummaries,
  onWishlistLogout,
  resetWishlistState,
  toggleWishlist,
} from '../wishlist.queries'

function summary(productId: string, isLiked: boolean): ProductSummaryResponse {
  return {
    productId,
    name: '',
    sellerName: '',
    thumbnailImageKey: null,
    regularPrice: 0,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: null,
    reviewCount: 0,
    isLiked,
  }
}

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

describe('hydrateLikedFromSummaries', () => {
  beforeEach(() => {
    resetWishlist()
    // 미러뿐 아니라 queries 모듈의 진행 중 의도·해제 툼스톤·epoch까지 리셋한다(resetWishlist는
    // 스토어만 비운다). onWishlistLogout이 그 단일 진입점이라 실제 코드로 격리한다.
    onWishlistLogout(new QueryClient())
  })

  it('[AC-WISH-013] isLiked=true인 카드만 미러에 시드하고 false는 무시한다', () => {
    hydrateLikedFromSummaries([summary('p-real-4', true), summary('p-real-5', false)])
    expect(isWished('p-real-4')).toBe(true)
    expect(isWished('p-real-5')).toBe(false)
  })

  it('[AC-WISH-014] 방금 해제한 id는 stale isLiked=true여도 재-추가하지 않는다', () => {
    // 찜 상태였다가 방금 해제를 발사한 실 상품. toggleWishlist가 해제 툼스톤을 세우므로 미러는
    // 해제됨(false)이고, 늦게 도착한 stale 페이지 응답이 하트를 되살리면 안 된다.
    addWish('p-real-6')
    toggleWishlist('p-real-6')
    expect(isWished('p-real-6')).toBe(false)

    hydrateLikedFromSummaries([summary('p-real-6', true)])
    expect(isWished('p-real-6')).toBe(false)
  })

  it('[AC-WISH-015] 해제 요청이 끝난 뒤 도착한 stale isLiked=true도 하트를 되살리지 않는다', async () => {
    // 해제 요청이 완료돼 desiredState가 비워진 뒤에도 툼스톤은 남아 stale true를 막는다(codex/
    // 워크플로가 공통 지적한 "요청 완료 후 창"을 검증). DELETE는 기본 MSW 핸들러가 204로 응답.
    addWish('p-real-7')
    toggleWishlist('p-real-7')
    expect(isWished('p-real-7')).toBe(false)

    // reconcile의 DELETE가 resolve돼 desiredState[id]가 지워질 시간을 준다.
    await new Promise(resolve => setTimeout(resolve, 20))

    // 늦게 도착한 stale 페이지(isLiked=true) — 툼스톤 때문에 여전히 재-추가되지 않는다.
    hydrateLikedFromSummaries([summary('p-real-7', true)])
    expect(isWished('p-real-7')).toBe(false)

    // 서버가 해제를 확정(isLiked=false)하면 툼스톤이 풀려, 이후 정당한 재-찜은 반영된다.
    hydrateLikedFromSummaries([summary('p-real-7', false)])
    hydrateLikedFromSummaries([summary('p-real-7', true)])
    expect(isWished('p-real-7')).toBe(true)
  })

  it('[AC-WISH-016] 로그아웃을 가로지른(epoch 불일치) 응답은 미러를 재-시드하지 않는다', () => {
    // fetch 시작 시점 epoch를 캡처한 뒤 로그아웃이 나면, 그 응답으로 시드해도 무시돼야 한다 —
    // 이전 세션의 찜이 새 세션(비회원/다음 사용자) 미러로 새는 걸 막는다.
    const epoch = currentSessionEpoch()
    onWishlistLogout(new QueryClient()) // 세션 종료 → epoch 증가, 미러 clear
    hydrateLikedFromSummaries([summary('p-real-8', true)], epoch)
    expect(isWished('p-real-8')).toBe(false)
  })
})

describe('hydrateLikedFromDetail', () => {
  beforeEach(() => {
    resetWishlistState()
  })

  it('[AC-WISH-017] 상세 isLiked=true를 미러에 시드하되 세션당 1회만 한다', () => {
    hydrateLikedFromDetail('p-real-3', true)
    expect(isWished('p-real-3')).toBe(true)

    // 사용자가 해제한 뒤 상세를 다시 열면 같은 isLiked=true 응답이 캐시에서 오는데, 그게 방금 해제한
    // 하트를 되살리면 안 된다. (해제는 서버 호출 없는 removeWish로 — 시드 기록만 격리해서 본다.)
    removeWish('p-real-3')
    hydrateLikedFromDetail('p-real-3', true)
    expect(isWished('p-real-3')).toBe(false)
  })

  it('[AC-WISH-018] isLiked가 false거나 아직 없으면(undefined) 시드하지 않는다', () => {
    hydrateLikedFromDetail('p-real-4', false)
    hydrateLikedFromDetail('p-real-5', undefined)
    expect(isWished('p-real-4')).toBe(false)
    expect(isWished('p-real-5')).toBe(false)
  })

  it('[AC-WISH-019] 세션이 끝나면(resetWishlistState) 시드 기록도 비워져 다시 시드된다', () => {
    // 시드 기록이 세션을 넘어 남으면, 로그아웃 후 다른 계정이 같은 상품 상세를 열었을 때 서버가
    // isLiked=true를 줘도 하트가 빈 채로 뜬다. 기록을 리셋에 포함시켜 그 누수를 막는다.
    hydrateLikedFromDetail('p-real-6', true)
    removeWish('p-real-6')
    hydrateLikedFromDetail('p-real-6', true)
    expect(isWished('p-real-6')).toBe(false) // 같은 세션이라 재-시드 안 함

    resetWishlistState()
    hydrateLikedFromDetail('p-real-6', true)
    expect(isWished('p-real-6')).toBe(true) // 새 세션이라 다시 시드
  })
})
