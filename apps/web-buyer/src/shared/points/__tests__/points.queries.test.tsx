import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { POINTS_URL, seedPointBalance, server } from '../../../testing/msw/server'
import { pointsErrorMessage, usePointBalance } from '../points.queries'

// 잔액은 서버가 소유하는 단일 정수라 매퍼가 얇다 — 조회 성공/실패 시 훅이 내려주는 값과
// 에러 문구 매핑을 단위로 검증한다. 네트워크는 MSW로 실제 HTTP까지 태운다(모듈 모킹 X).

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

// axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체.
const err = (status: number, data?: { errorCode?: number; message?: string }) => ({
  isAxiosError: true,
  response: { status, data },
})

describe('usePointBalance', () => {
  beforeEach(() => {
    seedPointBalance(0)
  })

  it('[AC-POINT-QUERY-001] 서버 잔액을 그대로 내려준다(0도 정상값)', async () => {
    seedPointBalance(12345)
    const { result } = renderHook(() => usePointBalance(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.balance).toBe(12345)
    expect(result.current.isError).toBe(false)
  })

  it('[AC-POINT-QUERY-002] 조회가 실패하면 balance는 undefined, isError는 true다', async () => {
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    const { result } = renderHook(() => usePointBalance(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    // 폴백은 소비 측 몫이라 훅 자체는 undefined를 노출한다.
    expect(result.current.balance).toBeUndefined()
  })
})

describe('pointsErrorMessage', () => {
  it('[AC-POINT-ERR-001] HTTP status를 사용자 문구로 매핑한다', () => {
    expect(pointsErrorMessage(err(403))).toBe('적립금을 확인할 권한이 없어요')
    expect(pointsErrorMessage(err(404))).toBe('적립금 정보를 찾을 수 없어요')
    // 서버 message(-습니다체)는 그대로 쓰지 않는다.
    expect(pointsErrorMessage(err(403, { message: '접근 불가합니다.' }))).toBe('적립금을 확인할 권한이 없어요')
    // 403 중 온보딩 미완료(20006)는 errorCode로 구분해 온보딩 안내로 분기한다.
    expect(pointsErrorMessage(err(403, { errorCode: 20006 }))).toBe(
      '온보딩을 먼저 완료해야 적립금을 확인할 수 있어요',
    )
    // status 미상(네트워크 오류 등)은 기본 문구로 폴백한다.
    expect(pointsErrorMessage(new Error('network'))).toBe(
      '적립금을 불러오지 못했어요. 잠시 후 다시 시도해주세요',
    )
  })
})
