import { afterEach, describe, it, expect } from 'vitest'
import { HttpResponse, http } from 'msw'
import { axiosInstance, setOnOnboardingRequired } from '@aechak/api'
import { server } from '@/testing/msw/server'

const base = axiosInstance.defaults.baseURL ?? ''

describe('전역 온보딩 인터셉터(403/20006)', () => {
  afterEach(() => {
    setOnOnboardingRequired(null)
  })

  it('[AC-ONBOARD-013] 비화이트리스트 호출이 403/20006이면 핸들러를 부르고 promise는 그대로 reject된다', async () => {
    let called = 0
    setOnOnboardingRequired(() => {
      called += 1
    })
    // PENDING이 ACTIVE 전용 경로(예: 적립금)를 부른 상황을 재현한다.
    server.use(
      http.get(`${base}/users/me/points`, () =>
        HttpResponse.json({ errorCode: 20006, message: '온보딩이 필요합니다.' }, { status: 403 }),
      ),
    )

    await expect(axiosInstance.get('/users/me/points')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(called).toBe(1)
  })

  it('[AC-ONBOARD-013] 20006이 아닌 403은 핸들러를 부르지 않는다', async () => {
    let called = 0
    setOnOnboardingRequired(() => {
      called += 1
    })
    server.use(
      http.get(`${base}/users/me/points`, () =>
        HttpResponse.json({ errorCode: 20005, message: '차단된 계정입니다.' }, { status: 403 }),
      ),
    )

    await expect(axiosInstance.get('/users/me/points')).rejects.toBeDefined()
    expect(called).toBe(0)
  })
})
