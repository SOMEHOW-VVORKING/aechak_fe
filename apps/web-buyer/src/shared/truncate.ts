// 글자수 기반 말줄임 공용 유틸. CSS `truncate`/`line-clamp`가 레이아웃 폭 기준 말줄임을
// 담당하는 정석이지만, 랭킹 행처럼 "글자수로 하드 캡"이 자연스러운 목록에서 쓰라고 캡틴이
// 요청한 재사용 유틸. 상점명/상품명 등 어떤 목록에서든 재사용 가능하도록 named export.
//
// 예)
//   truncateText('노즈워크 담요 장난감', 20) === '노즈워크 담요 장난감'  // 이하 → 원문 그대로
//   truncateText('고양이 자동 급식기 스마트 5L 앱 연동 타이머', 10) === '고양이 자동 급식기…'
//
// - `maxChars` 이하이면 원문을 그대로 반환한다(불필요한 `…`를 붙이지 않음).
// - 초과하면 앞에서 `maxChars`자만 남기고 말끝에 `…`(U+2026)를 붙인다.
// - 잘린 끝이 공백이면 " …"처럼 어색하지 않도록 끝 공백을 다듬는다(공백 경계 처리).
// - 코드 포인트 단위로 세어(스프레드) 이모지/서로게이트 페어가 중간에서 쪼개지지 않는다.
export function truncateText(text: string, maxChars: number): string {
  const limit = Math.max(0, Math.floor(maxChars))
  const chars = [...text]
  if (chars.length <= limit) return text
  const clipped = chars.slice(0, limit).join('').replace(/\s+$/, '')
  return clipped + '…'
}
