import { describe, expect, it } from 'vitest'
import { truncateText } from '../truncate'

describe('truncateText', () => {
  it('[AC-WB-TRUNCATE-001] maxChars 이하이면 원문을 그대로 반환한다(…를 붙이지 않음)', () => {
    expect(truncateText('노즈워크 담요 장난감', 20)).toBe('노즈워크 담요 장난감')
  })

  it('[AC-WB-TRUNCATE-002] 정확히 maxChars 길이(경계값)면 원문 그대로다', () => {
    expect(truncateText('안녕하세요', 5)).toBe('안녕하세요')
  })

  it('[AC-WB-TRUNCATE-003] maxChars를 초과하면 앞 maxChars자만 남기고 말끝에 …를 붙인다', () => {
    // 경계값: 6자 텍스트를 5로 자르면 앞 5자 + …
    expect(truncateText('안녕하세요요', 5)).toBe('안녕하세요…')
  })

  it('[AC-WB-TRUNCATE-004] 긴 상품명을 자르고 …로 넘침을 막는다', () => {
    expect(truncateText('고양이 자동 급식기 스마트 5L 앱 연동 타이머', 10)).toBe('고양이 자동 급식기…')
  })

  it('[AC-WB-TRUNCATE-005] 잘린 끝이 공백이면 끝 공백을 다듬어 " …"가 되지 않게 한다', () => {
    // "고양이 자동 " (6자)에서 끝 공백 제거 → "고양이 자동…"
    expect(truncateText('고양이 자동 급식기', 6)).toBe('고양이 자동…')
  })

  it('[AC-WB-TRUNCATE-006] 빈 문자열은 그대로 반환한다', () => {
    expect(truncateText('', 5)).toBe('')
  })

  it('[AC-WB-TRUNCATE-007] maxChars 0 이하이면 초과 텍스트를 …만 남긴다', () => {
    expect(truncateText('상품', 0)).toBe('…')
    expect(truncateText('상품', -3)).toBe('…')
  })

  it('[AC-WB-TRUNCATE-008] 이모지(서로게이트 페어)를 중간에서 쪼개지 않는다', () => {
    // 코드 포인트 단위로 세므로 "🐶🐱🐰"(3 코드포인트)를 2로 자르면 "🐶🐱…"
    expect(truncateText('🐶🐱🐰', 2)).toBe('🐶🐱…')
  })
})
