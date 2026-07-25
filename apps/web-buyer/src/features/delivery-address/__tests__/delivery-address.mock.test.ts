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
})
