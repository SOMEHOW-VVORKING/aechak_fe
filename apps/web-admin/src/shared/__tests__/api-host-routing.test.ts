import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_PATH_PREFIX, axiosInstance, setAccessToken } from '@aechak/api'
import { ADMIN_ORIGIN, API_ORIGIN, server } from '@/testing/msw/server'

// packages/api client.ts의 호스트 분기를 어드민 쪽에서 고정한다. web-seller의 같은 이름 테스트가
// seller/api 분기를 지키고, 이 파일이 **admin 분기와 어드민만의 credentials 차단**을 지킨다.
//
// 배경(SCRUM-272): 분기 설계는 맞는데 배포 값이 틀려서 dev 어드민이 브라우저에서
// `http://localhost:8082/api/v1/admin/seller-applications`를 호출해 전면 실패했다. 값 검증은
// api-host-env 테스트가 맡고, 이 파일은 **값이 제대로 들어왔을 때 어느 요청이 어느 호스트로
// 나가는가**를 못 박는다 — 두 호스트에 같은 경로를 심어 두고 응답의 표식으로 가른다.

const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
const adminBase = `${ADMIN_ORIGIN}${API_PATH_PREFIX}`

/** 두 호스트에 같은 경로를 심어 두고, 응답의 표식으로 어느 호스트가 받았는지 가른다. */
function routeProbe(path: string): void {
  server.use(
    http.get(`${apiBase}${path}`, () => HttpResponse.json({ host: 'api' })),
    http.get(`${adminBase}${path}`, () => HttpResponse.json({ host: 'admin' })),
  )
}

async function hostOf(path: string): Promise<string> {
  const response = await axiosInstance.get<{ host: string }>(path)
  return response.data.host
}

/** 요청이 실제로 들고 나간 설정 — axios가 응답에 그 config를 그대로 붙여 준다. */
async function configOf(path: string) {
  const response = await axiosInstance.get<{ host: string }>(path)
  return { host: response.data.host, withCredentials: response.config.withCredentials }
}

describe('공유 API 클라이언트 호스트 분기 — 어드민', () => {
  beforeEach(() => {
    setAccessToken(null)
  })

  it('[AC-ADMHOST-001] 어드민 업무 경로는 admin 모듈 호스트로 나간다', async () => {
    for (const path of ['/admin/admins', '/admin/admins/7', '/admin/seller-applications']) {
      routeProbe(path)
      await expect(hostOf(path)).resolves.toBe('admin')
    }
  })

  it('[AC-ADMHOST-002] 접두가 같아 보이는 다른 경로는 admin으로 새지 않는다', async () => {
    // `/administrators`는 `/admin`으로 시작하지만 다른 경로다 — 접두 판정이 문자열 startsWith만
    // 보면 이 요청이 엉뚱한 모듈로 나간다(경계는 `=== p` 또는 `p + '/'`여야 한다).
    routeProbe('/administrators')
    await expect(hostOf('/administrators')).resolves.toBe('api')
  })

  it('[AC-ADMHOST-003] 인증 경로는 admin 호스트가 설정돼 있어도 api 모듈로 나간다', async () => {
    // 어드민 모듈에는 `/auth/*`가 아예 없다. dev 배포에서는 이 요청이 셀러/어드민 호스트로 새서
    // 401이 됐다 — 설정 값이 맞을 때 분기가 올바른지를 여기서 못 박는다.
    for (const path of ['/auth/web/refresh', '/auth/web/logout', '/auth/callback/kakao']) {
      routeProbe(path)
      await expect(hostOf(path)).resolves.toBe('api')
    }
  })

  it('[AC-ADMHOST-004] 어드민 요청만 withCredentials가 꺼지고 인증 요청은 켜진 채 나간다', async () => {
    // boot/admin의 CORS 설정에 allowCredentials가 없다(bearer 전용). credentials 모드로 보내면
    // 서버가 Access-Control-Allow-Credentials를 주지 않아 브라우저가 **정상 응답까지 버린다.**
    // 반대로 refresh는 httpOnly 쿠키가 필요하므로 credentials가 켜져 있어야 한다.
    routeProbe('/admin/admins')
    routeProbe('/auth/callback/kakao')

    expect(await configOf('/admin/admins')).toEqual({ host: 'admin', withCredentials: false })
    expect(await configOf('/auth/callback/kakao')).toEqual({ host: 'api', withCredentials: true })
  })

  it('[AC-ADMHOST-005] 어드민 요청의 401은 api 호스트 refresh로 복구되고 새 토큰으로 재시도된다', async () => {
    // refresh 쿠키는 api 모듈이 `Path=/api/v1/auth`로 심는다 — admin 호스트로 나가면 그 경로가
    // 없어 404다. 그리고 재시도는 같은 config를 재사용하므로 헤더를 새 토큰으로 갈아끼워야 한다
    // (안 그러면 refresh가 성공해도 만료 토큰으로 재시도해 계속 401).
    let refreshedOn = ''
    server.use(
      http.post(`${apiBase}/auth/web/refresh`, () => {
        refreshedOn = 'api'
        return HttpResponse.json({
          data: { accessToken: 'fresh', tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      http.post(`${adminBase}/auth/web/refresh`, () => {
        refreshedOn = 'admin'
        return HttpResponse.json({
          data: { accessToken: 'wrong-host', tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      http.get(`${adminBase}/admin/admins`, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json({ data: { retried: true } })
          : HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    )

    const response = await axiosInstance.get<{ data: { retried: boolean } }>('/admin/admins')

    expect(refreshedOn).toBe('api')
    expect(response.data.data.retried).toBe(true)
  })

  it('[AC-ADMHOST-006] 403 errorCode 20011은 refresh를 거치지 않고 그대로 올라온다', async () => {
    // 권한 없음은 세션 문제가 아니다 — refresh로 풀리지 않으므로 인터셉터가 손대면 안 된다
    // (화면이 "관리자 권한이 없는 계정"으로 안내할 수 있어야 한다).
    let refreshCount = 0
    server.use(
      http.post(`${apiBase}/auth/web/refresh`, () => {
        refreshCount += 1
        return HttpResponse.json({
          data: { accessToken: 'fresh', tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      http.get(`${adminBase}/admin/admins`, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )

    await expect(axiosInstance.get('/admin/admins')).rejects.toThrow()
    expect(refreshCount).toBe(0)
  })
})
