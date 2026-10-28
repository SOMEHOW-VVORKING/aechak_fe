import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken } from '@aechak/api'
import {
  SELLER_APPLICATIONS_URL,
  makeApplicationWire,
  seedSellerApplication,
  server,
} from '../../testing/msw/server'
import { routeTree } from '../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/**
 * 가드가 끝날 때까지 기다린다. router.state.status는 render() 직후 동기로 'pending'이 되고,
 * 리다이렉트 체인 중에도 'pending'을 유지하다 마지막에 한 번만 'idle'로 돌아온다(중간에
 * 깜빡이는 idle이 없음을 이 라우터 버전에서 실측했다) — 그래서 "가드와 그로 인한 이동이
 * 전부 끝났다"는 신호로 쓸 수 있다.
 */
const settled = (router: ReturnType<typeof renderAt>) =>
  waitFor(() => expect(router.state.status).toBe('idle'))

/**
 * 가드가 끝난 뒤의 최종 주소를 단언한다.
 *
 * pathname을 waitFor로 감싸면 안 된다 — 통과를 기대하는 케이스는 출발지와 기대지가 같아서
 * 가드가 돌기도 전에 첫 확인이 이미 참이 되고, 그 뒤 가드가 엉뚱한 곳으로 보내도 테스트는
 * 이미 통과해 버린다. 실제로 가드를 "승인된 셀러도 /store-settings로 쫓아내게" 바꿔도
 * AC-004가, "5xx에서도 리다이렉트하게" 바꿔도 AC-009가 그대로 통과했다. 그래서 가드가
 * 끝났음을 먼저 확인하고 주소는 그 뒤에 한 번만 본다. 각 테스트는 거기에 더해 그 화면만의
 * 표식을 확인한다 — 주소가 맞아도 화면이 안 그려지면 들여보낸 것이 아니다.
 */
const landedOn = async (router: ReturnType<typeof renderAt>, path: string) => {
  await settled(router)
  expect(router.state.location.pathname).toBe(path)
}

const landedOnLoginWith = async (router: ReturnType<typeof renderAt>, error: number) => {
  await settled(router)
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.search).toEqual({ error })
}

/** 로그인 화면의 표식 — 서버 웹 로그인이 열린 provider는 카카오뿐이다. */
const loginScreen = () => screen.findByRole('button', { name: '카카오로 로그인' })
/** 운영 화면(상품 관리)의 표식 — SideNav 항목과 겹치지 않는 이 화면만의 버튼이다. */
const productsScreen = () => screen.findByRole('button', { name: '상품 등록' })

/**
 * 계정 상태 거부 — UserStatusFilter가 컨트롤러 앞에서 쓰는 403이라 신청 조회 자체가 막힌다
 * (20006 온보딩 미완, 20005 정지/탈퇴). 이 EP의 403은 그 필터가 유일한 출처이고 컨트롤러 경로엔
 * 403이 없다(미신청은 404/10100) — 그래서 403은 '자격 미상'이 아니라 '자격 없음'이다.
 */
function denyWithAccountStatus(errorCode: number) {
  server.use(
    http.get(SELLER_APPLICATIONS_URL, () =>
      HttpResponse.json({ errorCode, message: '거부' }, { status: 403 }),
    ),
  )
}

/**
 * 셀러센터는 refresh 쿠키만으로 세션이 복원된다 — 그 쿠키는 도메인 없이 api 호스트에 묶여
 * 구매자·어드민에서 로그인한 계정도 여기 들어온다. 자격을 따로 보지 않으면 셀러가 아닌
 * 계정에게 운영 화면이 그대로 열린다. 이 스펙이 그 두 관문을 고정한다.
 */
describe('셀러센터 진입 가드', () => {
  it('[AC-SELLER-GUARD-001] 세션이 없으면 운영 화면 대신 로그인으로 보낸다', async () => {
    // MSW의 refresh는 401 고정이라 복원이 실패한다 = 비로그인 진입.
    setAccessToken(null)

    await landedOn(renderAt('/products'), '/login')
    expect(await loginScreen()).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-002] 신청 이력이 없는 계정은 입점 신청 화면으로 보낸다', async () => {
    seedSellerApplication(null) // GET 404/10100

    await landedOn(renderAt('/products'), '/store-settings')
    expect(await screen.findByText('스토어 개설 신청')).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-003] 심사 중인 계정도 아직 운영 화면에 들어갈 수 없다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'SUBMITTED' }))

    await landedOn(renderAt('/products'), '/store-settings')
    expect(await screen.findByText('심사 대기 중이에요')).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-004] 승인된 셀러는 운영 화면에 그대로 들어간다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))

    await landedOn(renderAt('/products'), '/products')
    expect(await productsScreen()).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-005] 입점 신청 화면은 미승인 계정의 목적지라 자격을 묻지 않는다', async () => {
    seedSellerApplication(null)

    await landedOn(renderAt('/store-settings'), '/store-settings')
    expect(await screen.findByText('스토어 개설 신청')).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-006] 로그인 화면은 세션 없이 들어오는 것이 정상이라 통과시킨다', async () => {
    setAccessToken(null)

    await landedOn(renderAt('/login'), '/login')
    expect(await loginScreen()).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-007] 온보딩 미완 계정(403 20006)은 운영 화면에 들이지 않는다', async () => {
    // 구매자 앱에서 온보딩을 끊은 계정도 refresh 쿠키는 가지고 있다(그 EP는 온보딩 허용 경로다) —
    // 세션은 복원되지만 셀러 API는 전부 403이라 운영 화면이 들어가도 빈 껍데기다.
    denyWithAccountStatus(20006)

    await landedOnLoginWith(renderAt('/products'), 20006)
    // errorCode가 화면까지 닿아 사유를 말하는지 — 20006은 구매자 앱 온보딩 안내로 특정된다.
    expect(
      await screen.findByText('구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-008] 정지/탈퇴 계정(403 20005)도 운영 화면에 들이지 않는다', async () => {
    denyWithAccountStatus(20005)

    await landedOnLoginWith(renderAt('/products'), 20005)
    expect(await screen.findByText('로그인에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-GUARD-009] 5xx는 자격을 모르는 것이라 막지 않는다(화면이 자기 오류를 그린다)', async () => {
    // 자격 미상에서 닫으면 서버 한 번 흔들릴 때 멀쩡한 셀러가 운영 화면에서 잠긴다 —
    // 막는 쪽은 서버(모든 EP가 자체 인가)이고 가드는 길안내다.
    server.use(
      http.get(SELLER_APPLICATIONS_URL, () =>
        HttpResponse.json({ message: '서버 오류' }, { status: 500 }),
      ),
    )

    await landedOn(renderAt('/products'), '/products')
    expect(await productsScreen()).toBeInTheDocument()
  })
})
