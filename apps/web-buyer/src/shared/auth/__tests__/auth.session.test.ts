import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { WEB_LOGOUT_URL, server } from '../../../testing/msw/server'
import { endServerSession } from '../auth.session'

describe('endServerSession — 웹 로그아웃 서버 배선', () => {
  afterEach(() => setAccessToken(null))

  it('[AC-LOGOUT-001] 서버 로그아웃을 호출하고 access 토큰을 파기한다', async () => {
    let called = 0
    server.use(
      http.post(WEB_LOGOUT_URL, () => {
        called += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setAccessToken('live-token')

    await endServerSession()

    expect(called).toBe(1)
    expect(getAccessToken()).toBeNull()
  })

  it('[AC-LOGOUT-002] 전송이 실패해도 access 토큰은 반드시 파기된다(로컬 로그아웃 우선)', async () => {
    server.use(http.post(WEB_LOGOUT_URL, () => HttpResponse.error()))
    setAccessToken('live-token')

    await expect(endServerSession()).resolves.toBeUndefined()
    expect(getAccessToken()).toBeNull()
  })
})
