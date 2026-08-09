import type { QueryClient } from '@tanstack/react-query'
import { likeProduct, unlikeProduct } from '@aechak/api'
import { findMockProduct } from './products'
import { addWish, clearWished, isWished, removeWish } from './wishlist.store'

// 찜 목록 무한쿼리 키(찜 목록 화면과 공유). 토글은 이 쿼리를 invalidate하지 않는다 —
// 목록 표시는 pool ∩ id-set 필터가 담당하므로(features/wishlist), invalidate하면 다중 페이지
// 리페치로 깜빡임·스크롤 리셋·undo 미복귀가 생긴다.
export const LIKED_PRODUCTS_QUERY_KEY = ['wishlist', 'liked-products'] as const

function isUnauthorized(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 401
}

// 상품별 "원하는 최종 찜 상태"와 그 세대(generation), 진행 중 여부.
// generation은 값이 아니라 "탭 발생 순서"를 추적한다 — 실패/성공 중 그 사이 더 새로운 탭이
// 있었는지(값이 우연히 같아도) 세대 비교로 정확히 구분해 최신 의도를 잃지 않기 위함이다.
const desiredState = new Map<string, boolean>()
const generation = new Map<string, number>()
const running = new Set<string>()

// 세션 epoch — 로그아웃 시 증가시켜, 이전 세션에서 진행 중이던 요청의 늦은 롤백이 새 세션의
// 미러를 오염시키지 않게 한다.
let sessionEpoch = 0

/**
 * 로그아웃 정리(단일 진입점). 진행 중 찜 동기화 의도를 폐기하고(epoch 증가), 미러를 비우고,
 * 찜 목록 쿼리 캐시를 제거한다 — 캐시가 남으면 재로그인/재진입 시 옛 pool과 빈 미러의 교집합이
 * 빈 목록으로 잘못 뜬다. main.tsx(세션 만료)와 설정 로그아웃 두 곳에서 호출한다.
 */
export function onWishlistLogout(queryClient: QueryClient): void {
  sessionEpoch += 1
  desiredState.clear()
  generation.clear()
  running.clear()
  clearWished()
  queryClient.removeQueries({ queryKey: LIKED_PRODUCTS_QUERY_KEY })
}

async function reconcile(id: string): Promise<void> {
  if (running.has(id)) return
  running.add(id)
  const epoch = sessionEpoch
  try {
    while (desiredState.has(id) && sessionEpoch === epoch) {
      const want = desiredState.get(id) as boolean
      const gen = generation.get(id)
      try {
        if (want) await likeProduct(id)
        else await unlikeProduct(id)
      } catch (error) {
        // 세션이 바뀌었으면(로그아웃) 이 요청 결과는 버린다 — 미러를 건드리지 않는다.
        if (sessionEpoch !== epoch) return
        // 401: 전역 setOnAuthExpired가 로그인으로 튕기므로 이 id의 의도만 폐기하고 멈춘다.
        if (isUnauthorized(error)) {
          desiredState.delete(id)
          return
        }
        // 그 사이 더 새로운 탭이 왔으면 미러는 최신 탭을 반영 중이므로 건드리지 말고 최신 의도를 계속 조정.
        if (generation.get(id) !== gen) continue
        // 최신 의도가 실패 → 서버 실제 상태(=want의 반대)로 미러를 롤백하고 멈춘다.
        if (want) removeWish(id)
        else addWish(id)
        desiredState.delete(id)
        return
      }
      // 성공: 그 사이 새 탭이 없었으면 이 id는 완료. 있었으면 while이 최신 의도를 계속 조정한다.
      if (generation.get(id) === gen) desiredState.delete(id)
    }
  } finally {
    running.delete(id)
  }
}

/**
 * 찜 토글. 현재 상태를 뒤집어 낙관적으로 미러(스토어)에 반영하고 서버에 like/unlike를 발사한다.
 * 목업 상품(홈 등 아직 실 API 미연동, id가 mock 카탈로그에 존재)은 서버 기록이 없어 클라이언트
 * 토글만 한다 — 안 그러면 POST /products/p-.../like가 404. 실 API로 옮겨가면 자동으로 서버 경로.
 * 로그인 게이트(requireAuth('wish', ...))를 통과한 뒤 호출되는 걸 전제한다.
 */
export function toggleWishlist(id: string): void {
  const next = !isWished(id)
  if (next) addWish(id)
  else removeWish(id)

  if (findMockProduct(id)) return // 목업 상품: 클라이언트 토글만

  desiredState.set(id, next)
  generation.set(id, (generation.get(id) ?? 0) + 1)
  void reconcile(id)
}
