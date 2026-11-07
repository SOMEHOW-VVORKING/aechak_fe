import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import {
  resetLikedProducts,
  resetSearchFixtures,
  seedCart,
  seedOrderGroups,
  seedPaymentState,
  seedNotices,
  seedProductInquiries,
  seedSns,
  server,
} from './testing/msw/server'
import { resetWishlistState } from './shared/catalog'
import { resetAuth } from './shared/auth'
import { resetIntersection, stubIntersectionObserver } from './testing/intersection'

// jsdom은 window.scrollTo를 구현하지 않아 TanStack Router의 스크롤 복원이 "Not implemented"를
// 던진다 — 무해하지만 노이즈이고, 예외가 전환 중 리렌더를 유발해 테스트 노드를 detach시키므로
// 무해한 no-op으로 스텁한다(라우트 렌더 테스트 공통).
window.scrollTo = () => {}

// jsdom에는 blob URL API가 없다. 사진 미리보기(펫/리뷰/프로필)가 브라우저와 같은 코드로 돌게 스텁한다
// — 프로덕션 번들은 CSR 전용이라 화면 코드가 `typeof URL.createObjectURL` 가드를 둘 이유가 없다.
URL.createObjectURL ??= () => 'blob:test'
URL.revokeObjectURL ??= () => {}

// jsdom 26에는 IntersectionObserver가 없다. SNS 목록 끝 감시 요소는 테스트가 setListEndInView로 화면에 들인다.
stubIntersectionObserver()

// 모든 테스트에서 실네트워크를 전면 금지한다(기존 테스트는 HTTP 무호출 확인됨).
// 핸들러 없는 요청이 발생하면 그 자체를 실패로 본다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetSearchFixtures()
  // 찜은 서버측(MSW likedProductRows)과 클라이언트측(미러 + 해제 툼스톤)이 짝이라 함께 되돌린다.
  // 한쪽만 지우면 앞 테스트에서 해제한 id가 다음 테스트에서 계속 걸러져 시드보다 적게 렌더된다.
  resetLikedProducts()
  resetWishlistState()
  // 구매 퍼널 상태형 핸들러(장바구니·주문그룹·결제)는 테스트 간 이어지면 안 된다.
  seedCart()
  seedOrderGroups()
  seedPaymentState()
  seedSns()
  // 상품 문의도 등록·철회가 메모리 행을 바꾸는 상태형이라 테스트 사이에 이어지면 안 된다.
  seedProductInquiries()
  // 공지 더블은 받은 쿼리와 실패 시드를 메모리에 들고 있어 테스트 사이에 이어지면 안 된다.
  seedNotices()
  // A26 대기 행동(sessionStorage)도 테스트 사이에 이어지지 않게 지운다.
  sessionStorage.clear()
  resetIntersection()
  // access 토큰은 client.ts 모듈 메모리라 테스트 사이에 이어진다. SNS MSW는 Authorization 헤더로 보는 사람을 정한다.
  // resetAuth가 토큰을 버리고 세션 상태를 확인 전(unknown)으로 되돌린다 — 새 문서 로드와 같은 출발점이라
  // 회원 세션이 필요한 테스트는 스스로 토큰을 세우게 된다(setAccessToken(null)만으로는 "비회원 확정"이 남는다).
  resetAuth()
})
afterAll(() => server.close())
