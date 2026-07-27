import { describe, it, expect } from 'vitest'
import { formatPhone, toPhoneDigits } from '../delivery-address.format'

// 서버는 연락처를 숫자만 저장한다(하이픈은 표기). 화면이 조립을 맡으므로 자릿수별 규칙을 못 박는다.
describe('delivery-address 연락처 표시 포맷', () => {
  it('[AC-ADDR-FMT-001] toPhoneDigits는 구분자만 걷어낸다', () => {
    expect(toPhoneDigits('010-1234-5678')).toBe('01012345678')
    expect(toPhoneDigits('010 1234 5678')).toBe('01012345678')
    expect(toPhoneDigits('01012345678')).toBe('01012345678')
    expect(toPhoneDigits('(010)1234.5678')).toBe('01012345678')
  })

  it('[AC-ADDR-FMT-002] 11자리는 3-4-4, 10자리는 3-3-4로 조립한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
    expect(formatPhone('0161234567')).toBe('016-123-4567')
  })

  it('[AC-ADDR-FMT-003] 이미 하이픈이 있어도 규격대로 다시 조립한다', () => {
    expect(formatPhone('010-12345678')).toBe('010-1234-5678')
    expect(formatPhone('0101234-5678')).toBe('010-1234-5678')
  })

  it('[AC-ADDR-FMT-004] 휴대폰이 아니면 손대지 않는다', () => {
    // 자릿수만 보고 조립하면 지역번호를 왜곡한다(02-1234-5678 → 021-234-5678).
    expect(formatPhone('02-1234-5678')).toBe('02-1234-5678')
    expect(formatPhone('0101234567')).toBe('0101234567') // 존재하지 않는 10자리 010
    expect(formatPhone('0212345678')).toBe('0212345678')
    expect(formatPhone('12345')).toBe('12345')
    expect(formatPhone('')).toBe('')
  })
})
