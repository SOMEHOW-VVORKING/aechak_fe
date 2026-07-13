import { beforeEach, describe, it, expect } from 'vitest'
import { getAccount, maskPhone, resetAccount, updateProfile, verifyPhone } from '../account.store'

describe('account.store', () => {
  beforeEach(() => resetAccount())

  it('[AC-ACCOUNT-STORE-001] 시드 계정은 미인증 상태로 시작한다', () => {
    expect(getAccount().verification).toBe('unverified')
    expect(getAccount().verifiedPhoneMasked).toBeUndefined()
  })

  it('[AC-ACCOUNT-STORE-002] updateProfile은 닉네임/자기소개를 저장한다', () => {
    updateProfile({ nickname: '멍멍집사', bio: '바뀐 소개' })
    expect(getAccount().nickname).toBe('멍멍집사')
    expect(getAccount().bio).toBe('바뀐 소개')
  })

  it('[AC-ACCOUNT-STORE-003] verifyPhone은 인증완료로 전이하고 마스킹 번호/인증일을 찍는다', () => {
    verifyPhone('010-9876-5432')
    const account = getAccount()
    expect(account.verification).toBe('verified')
    expect(account.verifiedPhoneMasked).toBe('010-9876-****')
    expect(account.verifiedAt).toBeTruthy()
  })

  it('[AC-ACCOUNT-STORE-004] maskPhone은 뒤 4자리를 가린다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-1234-****')
  })
})
