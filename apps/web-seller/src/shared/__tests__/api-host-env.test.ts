import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiHostConfigError, bootstrapApiHosts, getApiBaseURL, resolveApiHosts } from '@aechak/api'
import { API_ORIGIN, SELLER_ORIGIN } from '@/testing/msw/server'

// packages/api의 호스트 환경변수 검증을 고정한다. 소비앱에 두는 이유는 호스트 분기 테스트와 같다 —
// packages/api에 vitest를 들이지 않는다(AGENTS 4절 관례).
//
// 배경(SCRUM-272): 세 앱 main.tsx가 `import.meta.env[...] ?? 'http://localhost:8080'`로 로컬
// 기본값으로 조용히 되돌아갔다. dev 빌드에 VITE_* 변수가 주입되지 않아 그 주소가 번들에 굳고,
// 배포된 셀러·어드민 앱이 브라우저에서 localhost:8081/8082를 호출해 전면 실패했다. 빌드·테스트는
// 전부 통과하고 배포 뒤에만 드러나는 종류라, 그 조건 자체를 테스트로 금지한다.

const spec = (name: string, value: string | undefined, devFallback: string) => ({ name, value, devFallback })

const sellerOptions = (isProd: boolean, api?: string, seller?: string) => ({
  app: 'web-seller',
  isProd,
  api: spec('VITE_API_BASE_URL', api, 'http://localhost:8080'),
  seller: spec('VITE_SELLER_API_BASE_URL', seller, 'http://localhost:8081'),
})

describe('resolveApiHosts — 개발 빌드', () => {
  it('[AC-APIENV-001] 변수가 없으면 로컬 기본값으로 통과한다(.env 없이 pnpm dev를 깨지 않는다)', () => {
    expect(resolveApiHosts(sellerOptions(false))).toEqual({
      apiOrigin: 'http://localhost:8080',
      sellerOrigin: 'http://localhost:8081',
    })
  })

  it('[AC-APIENV-002] 개발 빌드에서는 로컬 주소를 그대로 받는다', () => {
    expect(
      resolveApiHosts(sellerOptions(false, 'http://localhost:9000', 'http://127.0.0.1:9001')),
    ).toEqual({ apiOrigin: 'http://localhost:9000', sellerOrigin: 'http://127.0.0.1:9001' })
  })
})

describe('resolveApiHosts — 운영 빌드', () => {
  it('[AC-APIENV-003] 변수가 비어 있으면 던지고 비어 있는 변수 이름을 모두 밝힌다', () => {
    // 하나를 고칠 때마다 다시 배포하지 않게 문제를 한 번에 모아 보고한다.
    let thrown: unknown
    try {
      resolveApiHosts(sellerOptions(true))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ApiHostConfigError)
    const problems = (thrown as ApiHostConfigError).problems
    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toContain('VITE_API_BASE_URL')
    expect(problems.join('\n')).toContain('VITE_SELLER_API_BASE_URL')
  })

  it('[AC-APIENV-004] 공백만 주입된 변수도 비어 있는 것으로 본다', () => {
    expect(() => resolveApiHosts(sellerOptions(true, '   ', 'https://seller-api-dev.aechak.co.kr'))).toThrow(
      ApiHostConfigError,
    )
  })

  it('[AC-APIENV-005] 운영 빌드에서 로컬 주소를 가리키면 던진다 — 이번 사고를 직접 잡는 항목', () => {
    // 배포된 앱이 사용자 PC의 8081을 호출해 ERR_CONNECTION_REFUSED가 됐던 바로 그 조건이다.
    for (const local of [
      'http://localhost:8081',
      'http://127.0.0.1:8081',
      'http://0.0.0.0:8081',
      'https://localhost',
      // DNS 루트 표기와 대문자, RFC 6761이 예약한 .localhost 하위 도메인도 같은 곳을 가리킨다 —
      // 집합 비교만 하면 `new URL(...).hostname`이 `localhost.`가 되어 그대로 통과한다.
      'http://localhost.:8081',
      'http://LOCALHOST:8081',
      'http://seller-api.localhost:8081',
    ]) {
      expect(() => resolveApiHosts(sellerOptions(true, 'https://api-dev.aechak.co.kr', local))).toThrow(
        ApiHostConfigError,
      )
    }
  })

  it('[AC-APIENV-011] origin이 아니면(경로·쿼리·해시·자격증명) 던진다 — 접두가 두 번 붙는 것을 막는다', () => {
    // schema.yaml의 servers가 `http://localhost:8080/api/v1`처럼 접두를 포함해 적혀 있어 사람이
    // 그대로 복사하기 쉽다. 그 값을 넣으면 client.ts가 접두를 또 붙여 /api/v1/api/v1로 나간다.
    for (const notOrigin of [
      'https://api-dev.aechak.co.kr/api/v1',
      'https://api-dev.aechak.co.kr/api/v1/',
      'https://api-dev.aechak.co.kr?token=x',
      'https://api-dev.aechak.co.kr#frag',
      'https://user:pw@api-dev.aechak.co.kr',
    ]) {
      expect(() =>
        resolveApiHosts(sellerOptions(true, notOrigin, 'https://seller-api-dev.aechak.co.kr')),
      ).toThrow(ApiHostConfigError)
    }
    // 끝의 슬래시 하나는 사람이 흔히 붙이는 형태라 허용한다(client.ts가 접두를 붙일 때 떼어낸다).
    expect(
      resolveApiHosts(
        sellerOptions(true, 'https://api-dev.aechak.co.kr/', 'https://seller-api-dev.aechak.co.kr'),
      ).apiOrigin,
    ).toBe('https://api-dev.aechak.co.kr/')
  })

  it('[AC-APIENV-006] 스킴이 없거나 http/https가 아니면 던진다', () => {
    // 스킴이 빠지면 axios가 상대경로로 해석해 배포 도메인 자신에게 요청을 보낸다.
    for (const bad of ['api-dev.aechak.co.kr', '//api-dev.aechak.co.kr', 'ftp://api-dev.aechak.co.kr']) {
      expect(() => resolveApiHosts(sellerOptions(true, bad, 'https://seller-api-dev.aechak.co.kr'))).toThrow(
        ApiHostConfigError,
      )
    }
  })

  it('[AC-APIENV-007] dev 실제 값은 통과하고 trim한 값을 돌려준다', () => {
    expect(
      resolveApiHosts(
        sellerOptions(true, ' https://api-dev.aechak.co.kr ', 'https://seller-api-dev.aechak.co.kr'),
      ),
    ).toEqual({
      apiOrigin: 'https://api-dev.aechak.co.kr',
      sellerOrigin: 'https://seller-api-dev.aechak.co.kr',
    })
  })

  it('[AC-APIENV-008] 앱이 쓰지 않는 호스트는 검증하지 않는다(구매자 앱은 api 하나뿐)', () => {
    expect(
      resolveApiHosts({
        app: 'web-buyer',
        isProd: true,
        api: spec('VITE_API_BASE_URL', 'https://api-dev.aechak.co.kr', 'http://localhost:8080'),
      }),
    ).toEqual({ apiOrigin: 'https://api-dev.aechak.co.kr' })
  })
})

describe('bootstrapApiHosts', () => {
  afterEach(() => {
    // 다른 테스트가 쓰는 공유 클라이언트 호스트를 원래대로 돌려 둔다(모듈 스코프 상태다).
    bootstrapApiHosts(sellerOptions(false, API_ORIGIN, SELLER_ORIGIN))
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('[AC-APIENV-009] 성공하면 공유 클라이언트의 baseURL에 접두까지 붙여 반영한다', () => {
    bootstrapApiHosts(sellerOptions(true, 'https://api-dev.aechak.co.kr', 'https://seller-api-dev.aechak.co.kr'))

    // 접두(/api/v1)는 origin과 분리된 서버 계약이라 코드가 붙인다 — env 값에 넣으면 두 번 붙는다.
    expect(getApiBaseURL()).toBe('https://api-dev.aechak.co.kr/api/v1')
  })

  it('[AC-APIENV-010] 실패하면 콘솔과 화면에 사유를 남기고 던져서 부팅을 멈춘다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => bootstrapApiHosts(sellerOptions(true, '', 'http://localhost:8081'))).toThrow(
      ApiHostConfigError,
    )

    // 콘솔만 남기면 백지 화면과 구별되지 않는다 — 운영자가 보는 자리에도 사유가 있어야 한다.
    expect(error).toHaveBeenCalledOnce()
    const alert = document.body.querySelector('[role=alert]')
    expect(alert?.textContent).toContain('VITE_API_BASE_URL')
    expect(alert?.textContent).toContain('VITE_SELLER_API_BASE_URL')
  })
})
