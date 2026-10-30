/**
 * 개인정보 화면 마스킹.
 *
 * BE는 실명·연락처를 **복호 평문**으로 내리고 마스킹을 화면 책임으로 둔다 — 어드민 클레임 상세의
 * `OrderResponse`가 "수령인명·연락처는 복호 평문이다 — 마스킹은 화면이 한다"고 못박고 있고,
 * 셀러 주문(`SellerOrderSummaryResponse`)·심사 응답도 같은 말을 한다. 서버가 가려 주지 않으므로
 * 화면이 가리지 않으면 아무도 가리지 않는다.
 *
 * 지우지 않고 가운데만 가리는 이유는 운영자가 분쟁 상대를 **분간**해야 하기 때문이다 — 반품 송장의
 * 수령인·연락처 끝자리와 맞춰 보는 것이 판정 근거이고, 전체 평문이 필요한 일은 어드민 콘솔에 없다.
 *
 * 심사 화면(`features/seller-applications`)과 클레임 화면(`routes/claims.tsx`)이 함께 쓰므로
 * shared로 승격했다 — feature → feature 직접 import는 경계 위반이다(AGENTS).
 */

/**
 * 실명 마스킹 — 가운데를 가린다(1자는 전부, 2자는 끝 1자, 3자 이상은 가운데 전부).
 * 빈 값은 `null`로 돌려줘 호출자가 "값이 없음"과 "가려진 값"을 구별할 수 있게 한다.
 */
export function maskPersonName(value: string | null | undefined): string | null {
  const name = value?.trim() ?? ''
  if (name === '') return null
  if (name.length === 1) return '*'
  if (name.length === 2) return `${name.slice(0, 1)}*`
  return `${name.slice(0, 1)}${'*'.repeat(name.length - 2)}${name.slice(-1)}`
}

/**
 * 연락처 가운데 자리를 가린다 — 앞 3자리와 뒤 4자리만 남긴다.
 *
 * 숫자만 세어 가리므로 하이픈 유무·국가번호 표기에 상관없이 동작한다. 가릴 만큼 길지 않으면
 * (7자리 미만) 원문을 그대로 돌려준다 — 번호로 보기 어려운 값을 별표로 덮으면 운영자가
 * "잘못 들어간 값"임을 알아볼 수 없다.
 */
export function maskContactNumber(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? ''
  if (raw === '') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 6) return raw
  return `${digits.slice(0, 3)}-${'*'.repeat(digits.length - 7)}-${digits.slice(-4)}`
}
