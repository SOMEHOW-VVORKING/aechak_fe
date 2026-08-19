import { beforeEach, describe, it, expect } from 'vitest'
import { getAccount, resetAccount, updateProfile } from '../account.store'

// 본인 인증(verifyPhone/maskPhone)은 실서버 연동으로 스토어에서 제거됐다 — 인증 여부의
// 진실 원본은 GET /users/me·confirm 응답이고, 스토어는 리뷰 화면용 닉네임/프로필 목업만 남는다.
describe('account.store', () => {
  beforeEach(() => resetAccount())

  it('[AC-ACCOUNT-STORE-001] 시드 계정은 미인증 상태로 시작한다', () => {
    expect(getAccount().verification).toBe('unverified')
  })

  it('[AC-ACCOUNT-STORE-002] updateProfile은 닉네임/자기소개를 저장한다', () => {
    updateProfile({ nickname: '멍멍집사', bio: '바뀐 소개' })
    expect(getAccount().nickname).toBe('멍멍집사')
    expect(getAccount().bio).toBe('바뀐 소개')
  })
})
