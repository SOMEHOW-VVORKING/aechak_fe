import type { QueryClient } from '@tanstack/react-query'
import { errorResponse, likeProduct, unlikeProduct, type ProductSummaryResponse } from '@aechak/api'
import { findMockProduct } from './products'
import { addWish, clearWished, hydrateWished, isWished, removeWish } from './wishlist.store'

// 찜 목록 무한쿼리 키(찜 목록 화면과 공유). 토글은 이 쿼리를 invalidate하지 않는다 —
// 목록 표시는 pool ∩ id-set 필터가 담당하므로(features/wishlist), invalidate하면 다중 페이지
// 리페치로 깜빡임·스크롤 리셋·undo 미복귀가 생긴다.
export const LIKED_PRODUCTS_QUERY_KEY = ['wishlist', 'liked-products'] as const

function isUnauthorized(error: unknown): boolean {
  return errorResponse(error)?.status === 401
}

// 상품별 "원하는 최종 찜 상태"와 그 세대(generation), 진행 중 여부.
// generation은 값이 아니라 "탭 발생 순서"를 추적한다 — 실패/성공 중 그 사이 더 새로운 탭이
// 있었는지(값이 우연히 같아도) 세대 비교로 정확히 구분해 최신 의도를 잃지 않기 위함이다.
const desiredState = new Map<string, boolean>()
const generation = new Map<string, number>()
const running = new Set<string>()

// 로컬 해제 툼스톤 — 사용자가 이 세션에 직접 해제한 상품 id. reconcile의 DELETE가 끝나면
// desiredState[id]는 지워지지만 이 집합은 유지된다. 그래서 해제 요청보다 늦게 도착한 stale
// isLiked=true 페이지 응답이 방금 해제한 하트를 되살리는 걸 막는다(desiredState 가드는 요청이
// 진행 중인 창만 덮어 이 뒤 창을 놓쳤다 — codex/워크플로 교차 리뷰에서 확인). 서버가 isLiked=false로
// 확정하거나(hydrate에서 해제) 사용자가 다시 찜하면(toggle) 풀린다.
const locallyUnliked = new Set<string>()

// 상세 응답의 isLiked를 이미 미러에 시드한 상품 id. 목록 카드(hydrateLikedFromSummaries)와 달리
// 상세는 단건이라 "id별 세션당 1회"를 이 기록으로 보장한다 — 재마운트 시 캐시된 isLiked=true가
// 사용자가 그 사이 해제한 하트를 되살리는 걸 막는다. 예전엔 ProductDetailScreen의 모듈 전역이라
// 로그아웃·테스트에서 되돌릴 방법이 없었어서, 나머지 동기화 상태와 같은 모듈로 옮겨 리셋에 포함시켰다.
const seededDetailIds = new Set<string>()

// 세션 epoch — 로그아웃 시 증가시켜, 이전 세션에서 진행 중이던 요청의 늦은 롤백이 새 세션의
// 미러를 오염시키지 않게 한다.
let sessionEpoch = 0

/** 현재 세션 epoch. fetch 시작 시점에 캡처해 hydrate가 로그아웃을 가로지른 응답을 무시하게 한다. */
export function currentSessionEpoch(): number {
  return sessionEpoch
}

/**
 * 미러 + 이 모듈의 동기화 상태(진행 중 의도·세대·해제 툼스톤·epoch)를 한 번에 되돌린다.
 * `onWishlistLogout`의 쿼리 캐시 비의존 부분이며, QueryClient가 없는 자리(테스트 격리)에서 쓴다.
 *
 * 스토어의 `resetWishlist()`는 미러(`wished`)만 비우고 다른 모듈인 이 파일의 `locallyUnliked`
 * 툼스톤은 못 지운다 — 그 비대칭 때문에 앞 테스트에서 해제한 id가 다음 테스트의 `hydrateLikedFromSummaries`
 * 에서 계속 걸러져 시드보다 적은 카드가 렌더됐다(상대 카운트만 단언하던 테스트들이 조용히 축소 검증).
 * 그래서 test-setup의 전역 afterEach가 서버측 `resetLikedProducts()`와 나란히 이걸 부른다.
 *
 * 로그아웃에는 이걸 직접 쓰지 말고 `onWishlistLogout`을 쓸 것 — 쿼리 캐시를 지우지 않는다.
 */
export function resetWishlistState(): void {
  sessionEpoch += 1
  desiredState.clear()
  generation.clear()
  running.clear()
  locallyUnliked.clear()
  seededDetailIds.clear()
  clearWished()
}

/**
 * 로그아웃 정리(단일 진입점). 진행 중 찜 동기화 의도를 폐기하고(epoch 증가), 미러를 비우고,
 * 찜 목록 쿼리 캐시를 제거한다 — 캐시가 남으면 재로그인/재진입 시 옛 pool과 빈 미러의 교집합이
 * 빈 목록으로 잘못 뜬다. main.tsx(세션 만료)와 설정 로그아웃 두 곳에서 호출한다.
 */
export function onWishlistLogout(queryClient: QueryClient): void {
  resetWishlistState()
  queryClient.removeQueries({ queryKey: LIKED_PRODUCTS_QUERY_KEY })
}

async function reconcile(id: string): Promise<void> {
  if (running.has(id)) return
  running.add(id)
  const epoch = sessionEpoch
  try {
    while (sessionEpoch === epoch) {
      const want = desiredState.get(id)
      if (want === undefined) break
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
  if (next) {
    addWish(id)
    locallyUnliked.delete(id) // 다시 찜 → 툼스톤 해제
  } else {
    removeWish(id)
    locallyUnliked.add(id) // 해제 → 서버가 false로 확정할 때까지 툼스톤 유지
  }

  if (findMockProduct(id)) return // 목업 상품: 클라이언트 토글만

  desiredState.set(id, next)
  generation.set(id, (generation.get(id) ?? 0) + 1)
  void reconcile(id)
}

/**
 * 카드 응답의 isLiked를 미러에 시드한다(마켓/검색/찜목록 fetch 시점 1회). union 머지라 제거는 하지
 * 않고(다른 페이지 id·낙관적 찜 보존), 로컬 해제 툼스톤(locallyUnliked)이 있는 id는 stale
 * isLiked=true여도 재-추가하지 않는다 — 해제 요청이 끝난 뒤 늦게 도착한 페이지 응답이 방금 해제한
 * 하트를 되살리는 걸 막는다. isLiked=false는 서버가 해제를 확정한 것이므로 해당 id의 툼스톤을 푼다
 * (이후의 true 응답은 정당한 재-찜으로 반영). `epoch`를 넘기면(각 fetcher가 요청 시작 전 캡처) 그
 * 사이 세션이 바뀐(로그아웃) 응답은 무시해 이전 세션의 찜이 새 세션 미러로 새지 않게 한다.
 */
export function hydrateLikedFromSummaries(
  summaries: readonly ProductSummaryResponse[],
  epoch?: number,
): void {
  if (epoch !== undefined && epoch !== sessionEpoch) return
  const ids: string[] = []
  for (const summary of summaries) {
    if (summary.isLiked) {
      if (!locallyUnliked.has(summary.productId)) ids.push(summary.productId)
    } else {
      locallyUnliked.delete(summary.productId)
    }
  }
  if (ids.length > 0) hydrateWished(ids)
}

/**
 * 상품 상세 응답의 `isLiked`를 미러에 시드한다(id별 세션당 1회, `seededDetailIds`). 상세 화면이
 * 재마운트될 때 캐시된 `isLiked=true`가 사용자가 그 사이 해제한 하트를 되살리는 걸 막는다 —
 * 이후 상태는 `toggleWishlist`(서버 동기화)가 소유한다.
 *
 * 위 `hydrateLikedFromSummaries`(목록 카드)와 정책이 다르다: 그쪽은 해제 툼스톤으로 거르고 서버가
 * `isLiked=false`로 확정하면 툼스톤이 풀려 이후의 정당한 재-찜을 반영하는데, 상세는 세션 내내 1회로
 * 못박는다. 두 정책을 하나로 합치는 건 동작 변경이라 별도 판단이 필요하다.
 */
export function hydrateLikedFromDetail(productId: string, isLiked: boolean | undefined): void {
  if (!isLiked || seededDetailIds.has(productId)) return
  seededDetailIds.add(productId)
  addWish(productId)
}
