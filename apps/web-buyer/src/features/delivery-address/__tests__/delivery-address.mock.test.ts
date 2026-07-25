import { describe, it, expect } from 'vitest'
import { isValidPhone, sanitizePhone } from '../delivery-address.mock'

describe('address.mock 휴대폰 검증', () => {
  it('[AC-ADDR-001] sanitizePhone은 숫자와 하이픈만 남긴다', () => {
    expect(sanitizePhone('010-abc가나!!')).toBe('010-')
    expect(sanitizePhone('010 1234 5678')).toBe('01012345678')
    expect(sanitizePhone('010-1234-5678')).toBe('010-1234-5678')
  })

  it('[AC-ADDR-002] isValidPhone은 휴대폰 접두(01x)만 통과시킨다 — BE 계약과 동일', () => {
    expect(isValidPhone('010-1234-5678')).toBe(true) // 11자리 휴대폰
    expect(isValidPhone('016-123-4567')).toBe(true) // 10자리 휴대폰(016)
    expect(isValidPhone('02-1234-5678')).toBe(false) // 지역번호는 휴대폰 아님 → 저장 시 BE 400
    expect(isValidPhone('010-12')).toBe(false) // 자릿수 부족
    expect(isValidPhone('12345678901')).toBe(false) // 0으로 시작 안 함
    expect(isValidPhone('')).toBe(false)
  })

  it('[AC-ADDR-003] 하이픈은 표기라 위치와 무관하게 같은 번호로 본다', () => {
    // BE도 하이픈·공백만 걷어내고 숫자로 검증하므로, 폼을 통과한 값은 저장에서 400 나지 않는다.
    expect(isValidPhone('01012345678')).toBe(true) // 하이픈 없음
    expect(isValidPhone('010-12345678')).toBe(true) // 앞에만
    expect(isValidPhone('0101234-5678')).toBe(true) // 뒤에만
    expect(isValidPhone('010 1234 5678')).toBe(true) // 공백 구분
    expect(isValidPhone('010.1234.5678')).toBe(true) // 점 구분
    expect(isValidPhone('(010)1234-5678')).toBe(true) // 괄호
  })

  it('[AC-ADDR-004] 010은 뒤 8자리 고정이라 10자리는 거절한다', () => {
    // 011 등 레거시는 10자리도 실재하지만 010은 항상 11자리다.
    expect(isValidPhone('010-123-4567')).toBe(false)
    expect(isValidPhone('011-123-4567')).toBe(true)
  })
})
