import { afterEach, describe, expect, it } from 'vitest'
import { getIsLoggedIn, login, logout, resetAuth } from '../auth.store'

describe('auth.store', () => {
  afterEach(() => resetAuth())

  it('[AC-AUTH-STORE-001] 기본값은 로그인 상태다', () => {
    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-AUTH-STORE-002] logout하면 비회원, login하면 다시 회원 상태가 된다', () => {
    logout()
    expect(getIsLoggedIn()).toBe(false)
    login()
    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-AUTH-STORE-003] resetAuth는 로그인 상태로 되돌린다', () => {
    logout()
    resetAuth()
    expect(getIsLoggedIn()).toBe(true)
  })
})
