import { describe, expect, it } from 'vitest'
import { WEB_LOGIN_PROVIDERS, socialLoginRedirectUrl } from '../onboarding.queries'

describe('socialLoginRedirectUrl', () => {
  it('서버 redirect 엔드포인트로 향하고 return 주소를 인코딩해 싣는다', () => {
    const url = socialLoginRedirectUrl('kakao', 'http://localhost:5175/login/complete')

    expect(url).toBe(
      'http://localhost:8080/api/v1/auth/login/kakao/redirect?return=http%3A%2F%2Flocalhost%3A5175%2Flogin%2Fcomplete',
    )
  })
})

describe('WEB_LOGIN_PROVIDERS', () => {
  it('웹 로그인은 카카오만 열려 있다 — 구글·애플은 서버 미지원(버튼 비활성 근거)', () => {
    expect(WEB_LOGIN_PROVIDERS.has('kakao')).toBe(true)
    expect(WEB_LOGIN_PROVIDERS.has('google')).toBe(false)
    expect(WEB_LOGIN_PROVIDERS.has('apple')).toBe(false)
  })
})
