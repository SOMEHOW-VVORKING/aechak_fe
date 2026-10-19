import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_PATH_PREFIX, axiosInstance, setAccessToken } from '@aechak/api'
import { API_ORIGIN, SELLER_ORIGIN, server } from '@/testing/msw/server'

// packages/api의 client.ts가 요청 경로로 호스트를 가르는 규칙을 고정한다. 셀러센터가 api
// 모듈(인증·presigned)과 seller 모듈(입점·상품)을 동시에 부르는 유일한 앱이라 이 테스트를
// 여기에 둔다(DS 테스트를 소비앱에 두는 관례와 같은 결 — packages/api에 vitest를 들이지 않는다).
//
// 이 파일이 덮는 것은 seller/api 두 호스트 분기와 401 refresh 재시도뿐이다. `/admin` 분기와
// `withCredentials === false`는 web-admin이 지킨다 — 경로 분기는
// `seller-applications.contract.test.ts`의 `[AC-ADM-API-012]`(api 호스트에 같은 경로를 심어도
// 가지 않는다)가, 쿠키 미동봉은 web-admin E2E의 CORS 헤더에서 `Access-Control-Allow-Credentials`를
// 일부러 빼 둔 것이 실 브라우저 레벨에서 감시한다. 여기서 어드민 origin을 import하지는 않는다.

const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
const sellerBase = `${SELLER_ORIGIN}${API_PATH_PREFIX}`

/** 두 호스트에 같은 경로를 심어 두고, 응답의 표식으로 어느 호스트가 받았는지 가른다. */
function routeProbe(path: string): void {
  server.use(
    http.get(`${apiBase}${path}`, () => HttpResponse.json({ host: 'api' })),
    http.get(`${sellerBase}${path}`, () => HttpResponse.json({ host: 'seller' })),
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

describe('공유 API 클라이언트 호스트 분기', () => {
  beforeEach(() => {
    setAccessToken(null)
  })

  it('[AC-APIHOST-001] 셀러 상품 경로는 seller 모듈 호스트로 나간다', async () => {
    routeProbe('/sellers/me/products')
    await expect(hostOf('/sellers/me/products')).resolves.toBe('seller')
  })

  it('[AC-APIHOST-002] 입점 신청 경로는 seller 모듈 호스트로 나간다', async () => {
    routeProbe('/seller-applications')
    await expect(hostOf('/seller-applications')).resolves.toBe('seller')
  })

  it('[AC-APIHOST-003] 접두가 같아 보이는 다른 경로는 seller로 새지 않는다', async () => {
    // `/seller-applications-foo`는 `/seller-applications`로 시작하지만 다른 경로다 —
    // 접두 판정이 문자열 startsWith만 보면 이 요청이 엉뚱한 모듈로 나간다.
    routeProbe('/seller-applications-foo')
    await expect(hostOf('/seller-applications-foo')).resolves.toBe('api')
  })

  it('[AC-APIHOST-004] presigned 발급과 카테고리는 api 모듈 호스트로 나간다', async () => {
    // 업로드 발급 컨트롤러는 boot/api에만 있고 seller 모듈의 컴포넌트 스캔 목록에 없다.
    routeProbe('/files/presigned-url')
    routeProbe('/categories')
    await expect(hostOf('/files/presigned-url')).resolves.toBe('api')
    await expect(hostOf('/categories')).resolves.toBe('api')
  })

  it('[AC-APIHOST-010] 택배사 마스터는 me가 없어도 /sellers 접두라 seller 모듈로 나간다', async () => {
    // BE가 이 컨트롤러를 `/sellers/couriers`에 둔 이유가 바로 이 분기다(공용 마스터인데도
    // 경로를 /sellers로 시작시켰다) — 접두 규칙이 깨지면 이 요청만 조용히 api로 샌다.
    routeProbe('/sellers/couriers')
    await expect(hostOf('/sellers/couriers')).resolves.toBe('seller')
  })

  it('[AC-APIHOST-011] 인증 경로는 seller 호스트가 설정돼 있어도 api 모듈로 나간다', async () => {
    // dev 배포에서 실제로 틀린 지점이다 — VITE_API_BASE_URL에 셀러 API 호스트가 들어가
    // `/auth/web/refresh`와 `/categories`가 셀러 호스트로 나가 401이 됐다. 값 검증은
    // api-host-env 테스트가 맡고, 여기서는 값이 맞을 때 분기가 올바른지를 못 박는다.
    for (const path of ['/auth/web/refresh', '/auth/web/logout', '/auth/callback/kakao']) {
      routeProbe(path)
      await expect(hostOf(path)).resolves.toBe('api')
    }
  })

  it('[AC-APIHOST-012] 셀러·api 호스트 요청은 둘 다 credentials를 켠 채 나간다', async () => {
    // credentials를 끄는 것은 `/admin` 경로뿐이다(어드민 CORS에 allowCredentials가 없다).
    // 셀러 쪽에 그 분기가 번지면 refresh 쿠키가 동봉되지 않아 세션 복원이 조용히 깨진다.
    routeProbe('/sellers/me/products')
    routeProbe('/categories')
    expect(await configOf('/sellers/me/products')).toEqual({ host: 'seller', withCredentials: true })
    expect(await configOf('/categories')).toEqual({ host: 'api', withCredentials: true })
  })

  it('[AC-APIHOST-005] 호출부가 다른 호스트를 직접 지정하면 그 선택을 덮지 않는다', async () => {
    const otherBase = `http://localhost:9999${API_PATH_PREFIX}`
    server.use(
      http.get(`${otherBase}/sellers/me/products`, () => HttpResponse.json({ host: 'other' })),
    )
    const response = await axiosInstance.get<{ host: string }>('/sellers/me/products', {
      baseURL: otherBase,
    })
    expect(response.data.host).toBe('other')
  })

  it('[AC-APIHOST-009] forceApiHost는 기능 경로도 api 모듈로 되돌린다', async () => {
    // 경로만으로는 "호출부가 api를 콕 집었다"를 표현할 수 없어서 둔 표식이다 — refresh가 쓴다.
    routeProbe('/sellers/me/products')
    const response = await axiosInstance.get<{ host: string }>('/sellers/me/products', {
      forceApiHost: true,
    })
    expect(response.data.host).toBe('api')
  })

  it('[AC-APIHOST-006] 배열 쿼리는 반복 파라미터로 직렬화된다', async () => {
    // 서버는 `?saleStatus=A&saleStatus=B`를 기대한다. axios 기본값(`saleStatus[]=A`)으로 나가면
    // BE 바인딩이 "지원하지 않는 값"으로 400을 준다.
    let seen = ''
    server.use(
      http.get(`${sellerBase}/sellers/me/products`, ({ request }) => {
        seen = new URL(request.url).search
        return HttpResponse.json({ data: {} })
      }),
    )
    await axiosInstance.get('/sellers/me/products', {
      params: { saleStatus: ['ON_SALE', 'SUSPENDED'], page: 0 },
    })
    expect(seen).toContain('saleStatus=ON_SALE&saleStatus=SUSPENDED')
    expect(seen).not.toContain('saleStatus%5B%5D')
  })
})

describe('401 refresh 재시도', () => {
  beforeEach(() => {
    setAccessToken(null)
  })

  it('[AC-APIHOST-007] refresh는 기능 호스트가 아니라 api 호스트로 나간다', async () => {
    // refresh 쿠키는 api 모듈이 Path=/api/v1/auth로 심는다 — seller 호스트로 나가면 404다.
    let refreshedOn = ''
    server.use(
      http.post(`${apiBase}/auth/web/refresh`, () => {
        refreshedOn = 'api'
        return HttpResponse.json({
          data: { accessToken: 'fresh', tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      http.post(`${sellerBase}/auth/web/refresh`, () => {
        refreshedOn = 'seller'
        return HttpResponse.json({
          data: { accessToken: 'wrong-host', tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      // 첫 호출은 401, refresh 뒤 재시도는 성공시켜 재시도 경로까지 지나가게 한다.
      http.get(`${sellerBase}/sellers/me/products`, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json({ data: { retried: true } })
          : HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    )
    const response = await axiosInstance.get<{ data: { retried: boolean } }>(
      '/sellers/me/products',
    )
    expect(refreshedOn).toBe('api')
    expect(response.data.data.retried).toBe(true)
  })

  it('[AC-APIHOST-008] 재시도도 401이면 refresh를 한 번만 하고 포기한다', async () => {
    // axios는 request()마다 mergeConfig로 새 config 객체를 만들기 때문에 WeakSet 표식만으로는
    // 재시도 횟수가 제한되지 않는다(재시도의 401이 WeakSet에 없는 객체로 돌아온다). 그래서
    // mergeConfig가 그대로 옮겨 주는 불리언 표식을 함께 쓴다 — 이 테스트가 그 보호를 고정한다.
    let refreshCount = 0
    server.use(
      http.post(`${apiBase}/auth/web/refresh`, () => {
        refreshCount += 1
        return HttpResponse.json({
          data: { accessToken: `token-${refreshCount}`, tokenType: 'Bearer', expiresIn: 1800 },
        })
      }),
      // 토큰이 아무리 새로워도 계속 401 — 권한 문제를 401로 주는 서버가 있으면 이 모양이 된다.
      http.get(`${sellerBase}/sellers/me/products`, () =>
        HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    )
    await expect(axiosInstance.get('/sellers/me/products')).rejects.toThrow()
    expect(refreshCount).toBe(1)
  })
})
