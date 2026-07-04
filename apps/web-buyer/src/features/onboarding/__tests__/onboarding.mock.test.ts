import { describe, it, expect } from 'vitest'
import { mockCheckNicknameAvailable } from '../onboarding.mock'

// AC-ONBOARD-001: 닉네임 중복확인은 이미 사용 중인 닉네임에 false를 반환한다
describe('mockCheckNicknameAvailable', () => {
  it('[AC-ONBOARD-001] resolves false for a taken nickname', async () => {
    await expect(mockCheckNicknameAvailable('애착')).resolves.toBe(false)
  })

  it('[AC-ONBOARD-001] resolves true for an untaken nickname', async () => {
    await expect(mockCheckNicknameAvailable('새로운닉네임')).resolves.toBe(true)
  })
})
