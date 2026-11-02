import { afterEach, describe, expect, it } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { getIsLoggedIn, getSessionState, login, logout, resetAuth } from '../auth.store'

describe('auth.store', () => {
  afterEach(() => resetAuth())

  it('[AC-AUTH-STORE-001] 토큰이 없으면 아직 확인 전(unknown)이고 로그인 상태가 아니다', () => {
    resetAuth()

    // 새로고침·공유 링크 진입이 이 상태다. "로그인됨"을 기본값으로 두면 회원 전용 요청이 401로
    // 튕겨 게스트 카탈로그에 닿지 못한다.
    expect(getSessionState()).toBe('unknown')
    expect(getIsLoggedIn()).toBe(false)
  })

  it('[AC-AUTH-STORE-002] 토큰이 생기면 회원이 된다(토큰이 정본)', () => {
    resetAuth()

    setAccessToken('live-token')

    expect(getSessionState()).toBe('member')
    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-AUTH-STORE-006] 토큰이 비워지는 것만으로는 비회원으로 확정하지 않는다', () => {
    // client.ts의 401 인터셉터는 refresh가 5xx·네트워크로 실패해도 토큰을 버린다. 그걸 비회원으로
    // 못 박으면 refresh 쿠키가 멀쩡한 회원에게 회원 전용 화면이 "로그인이 필요해요"라고 거짓을
    // 말하고, 서버가 복구돼도 재확인을 건너뛴다. 확인 전으로 남겨 다음 네비게이션에 맡긴다.
    setAccessToken('live-token')

    setAccessToken(null)

    expect(getSessionState()).toBe('unknown')
    expect(getIsLoggedIn()).toBe(false)
  })

  it('[AC-AUTH-STORE-003] logout은 토큰까지 버린다 — 플래그만 내려가고 토큰이 남는 상태를 막는다', () => {
    setAccessToken('live-token')

    logout()

    expect(getAccessToken()).toBeNull()
    expect(getSessionState()).toBe('guest')
  })

  it('[AC-AUTH-STORE-004] login은 회원으로 올린다', () => {
    resetAuth()

    login()

    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-AUTH-STORE-005] resetAuth는 토큰을 버리고 확인 전 상태로 되돌린다', () => {
    setAccessToken('live-token')

    resetAuth()

    expect(getAccessToken()).toBeNull()
    expect(getSessionState()).toBe('unknown')
  })
})
