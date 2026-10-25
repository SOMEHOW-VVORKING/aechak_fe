/**
 * 목업만 있는 화면의 운영 진입 차단 스위치 — 라우트 게이트와 **그 화면으로 보내는 진입점**이
 * 같은 값을 봐야 해서 shared로 올렸다.
 *
 * 둘이 갈리면 죽은 진입점이 생긴다: 대시보드 카드는 "목록이 열려요"라고 안내하는데 목적지
 * 라우트가 차단 상태여서 "준비 중" 안내만 나오는 식이다(AGENTS.md가 금지하는 장식/죽은 UI).
 * 스위치가 하나면 그런 상태를 만들 수 없다.
 *
 * BE가 생겨 화면을 실서버에 붙이면 그 화면의 상수를 true로 올린다 — 라우트의 게이트 분기를
 * 지우면 import가 미사용으로 남아 lint(`no-unused-vars`)가 올리는 것을 잊지 못하게 막는다.
 */

/** `GET /sellers/me/orders` 연동(SCRUM-291) 전까지 주문/배송 관리는 목업이다. */
export const SERVER_ORDERS_AVAILABLE = false

/** `GET /sellers/me/claims` 연동(SCRUM-295) 전까지 취소/반품/교환 관리는 목업이다. */
export const SERVER_CLAIMS_AVAILABLE = false
