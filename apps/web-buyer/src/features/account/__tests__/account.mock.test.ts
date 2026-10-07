import { describe, it, expect } from 'vitest'
import {
  NICKNAME_MAX,
  isValidPhoneNumber,
  validateNickname,
} from '../account.mock'

describe('account.mock — 닉네임/휴대폰 번호 검증', () => {
  it('[AC-ACCOUNT-001] 빈 닉네임은 검증 실패한다', () => {
    expect(validateNickname('   ').ok).toBe(false)
  })

  it('[AC-ACCOUNT-002] 최대 길이를 넘는 닉네임은 실패한다', () => {
    expect(validateNickname('가'.repeat(NICKNAME_MAX + 1)).ok).toBe(false)
  })

  it('[AC-ACCOUNT-003] 유효한 닉네임은 통과한다', () => {
    const result = validateNickname('코코집사')
    expect(result.ok).toBe(true)
    expect(result.message).toContain('사용할 수 있는')
  })

  it('[AC-ACCOUNT-009] 2자 미만 닉네임은 실패한다(실서버 정규식 2~12자)', () => {
    expect(validateNickname('코').ok).toBe(false)
    expect(validateNickname('a').ok).toBe(false)
  })

  it('[AC-ACCOUNT-010] 공백·이모지·자모가 섞이면 실패한다', () => {
    expect(validateNickname('코코 집사').ok).toBe(false) // 내부 공백
    expect(validateNickname('코코🐾').ok).toBe(false) // 이모지
    expect(validateNickname('ㄱㄴ').ok).toBe(false) // 완성형 아닌 자모
  })

  it('[AC-ACCOUNT-011] 영문·숫자 조합 2~12자는 통과한다', () => {
    expect(validateNickname('coco123').ok).toBe(true)
  })

  it('[AC-ACCOUNT-004] 휴대폰 번호는 서버 규칙(01x, 하이픈 유무 허용)으로 사전 검증한다', () => {
    expect(isValidPhoneNumber('010-1234-5678')).toBe(true)
    expect(isValidPhoneNumber('01012345678')).toBe(true)
    expect(isValidPhoneNumber('011-123-4567')).toBe(true) // 중간 3자리 허용
    expect(isValidPhoneNumber(' 010-1234-5678 ')).toBe(true) // 앞뒤 공백은 다듬는다
    expect(isValidPhoneNumber('02-1234-5678')).toBe(false) // 지역번호
    expect(isValidPhoneNumber('010-1234-567')).toBe(false) // 끝 4자리 미달
    expect(isValidPhoneNumber('')).toBe(false)
  })
})
