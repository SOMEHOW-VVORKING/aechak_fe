import { describe, expect, it } from 'vitest'
import { maskContactNumber, maskPersonName } from '@/shared/mask'

// 서버가 평문으로 내리는 실명·연락처를 화면이 가리는 규칙. 심사 화면의 대표자명과 클레임 상세의
// 수령인·연락처가 같은 함수를 쓰므로 규칙은 여기 한 자리에 고정한다.

describe('maskPersonName', () => {
  it('가운데를 가리고 앞뒤 한 자씩만 남긴다', () => {
    expect(maskPersonName('김보리')).toBe('김*리')
    expect(maskPersonName('남궁민수')).toBe('남**수')
  })

  it('두 자 이름은 끝 한 자만, 한 자 이름은 전부 가린다', () => {
    expect(maskPersonName('김수')).toBe('김*')
    expect(maskPersonName('김')).toBe('*')
  })

  it('값이 없으면 null이다 — "가려진 값"과 "없는 값"이 갈려야 한다', () => {
    expect(maskPersonName(null)).toBeNull()
    expect(maskPersonName(undefined)).toBeNull()
    expect(maskPersonName('   ')).toBeNull()
  })
})

describe('maskContactNumber', () => {
  it('앞 3자리와 뒤 4자리만 남기고 하이픈 유무에 상관없이 같은 결과를 낸다', () => {
    expect(maskContactNumber('010-1234-5678')).toBe('010-****-5678')
    expect(maskContactNumber('01012345678')).toBe('010-****-5678')
    expect(maskContactNumber('0212345678')).toBe('021-***-5678')
  })

  it('가릴 자리가 없으면 원문을 돌려준다 — 조립하면 가린 것도 없이 번호만 망가진다', () => {
    expect(maskContactNumber('123456')).toBe('123456')
    // 앞 3 + 뒤 4가 이미 전부인 경계. 그대로 조립하면 '123--4567'이 된다.
    expect(maskContactNumber('1234567')).toBe('1234567')
    expect(maskContactNumber('123-4567')).toBe('123-4567')
    // 한 자리만 가릴 수 있는 자리부터 가린다.
    expect(maskContactNumber('12345678')).toBe('123-*-5678')
  })

  it('숫자가 없는 값은 별표로 덮지 않는다 — 잘못 들어간 값으로 보여야 한다', () => {
    expect(maskContactNumber('연락처 없음')).toBe('연락처 없음')
  })

  it('값이 없으면 null이다', () => {
    expect(maskContactNumber(null)).toBeNull()
    expect(maskContactNumber('')).toBeNull()
  })
})
