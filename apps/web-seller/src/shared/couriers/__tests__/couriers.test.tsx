import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_COURIERS, SELLER_COURIERS_URL, seedCouriers, server } from '@/testing/msw/server'
import { courierNameOf, courierSelectOptions, matchesTrackingFormat, useCouriers } from '../couriers.queries'

// 택배사 마스터는 BE courier_masters가 정본이고 courierCode가 PK다. FE가 코드를 하드코딩하거나
// 대소문자를 바꾸면 배송정책 저장·송장 등록·회수 송장·교환 재발송이 전부 404 errorCode 50303이 된다 —
// 조용히 틀리는 종류라 소문자 잔존 여부까지 테스트로 못 박는다.

function renderCouriers() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useCouriers(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

describe('useCouriers', () => {
  beforeEach(() => {
    seedCouriers()
  })
  afterEach(() => {
    seedCouriers()
  })

  it('[AC-COURIER-001] 서버가 준 대문자 코드와 서버 정렬을 그대로 Select 옵션으로 쓴다', async () => {
    const { result } = renderCouriers()

    await waitFor(() => expect(result.current.data).toBeDefined())

    // 정렬은 서버(courierName 오름차순 → courierCode 오름차순)가 소유한다 — 여기서 다시 정렬하지 않는다.
    expect(courierSelectOptions(result.current.data)).toEqual([
      { value: 'CJ', label: 'CJ대한통운' },
      { value: 'LOGEN', label: '로젠택배' },
      { value: 'LOTTE', label: '롯데택배' },
      { value: 'POST', label: '우체국택배' },
      { value: 'HANJIN', label: '한진택배' },
    ])
    // 코드는 전부 서버 값 그대로다(대문자 변환이 아니라 무변환이어야 한다).
    for (const option of courierSelectOptions(result.current.data)) {
      expect(option.value).toBe(option.value.toUpperCase())
    }
  })

  it('[AC-COURIER-003] 조회가 실패하면 하드코딩 폴백 없이 빈 목록과 isError로 끝난다', async () => {
    server.use(
      http.get(SELLER_COURIERS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    const { result } = renderCouriers()

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(courierSelectOptions(result.current.data)).toEqual([])
  })
})

describe('courierNameOf', () => {
  it('[AC-COURIER-002] 서버 마스터에 없는 코드는 라벨을 지어내지 않고 코드를 그대로 보여준다', () => {
    expect(courierNameOf(DEFAULT_COURIERS, 'CJ')).toBe('CJ대한통운')
    // 소문자는 서버에 없는 코드다 — 조용히 CJ대한통운으로 접어 주면 저장이 404로 깨지는 것을 가린다.
    expect(courierNameOf(DEFAULT_COURIERS, 'CJ'.toLowerCase())).toBe('CJ'.toLowerCase())
    expect(courierNameOf(undefined, 'CJ')).toBe('CJ')
  })
})

describe('matchesTrackingFormat', () => {
  it('[AC-COURIER-005] 패턴이 없으면 통과시키고 있으면 형식을 보고, 깨진 정규식은 서버 판정에 맡긴다', () => {
    expect(matchesTrackingFormat(null, 'anything')).toBe(true)
    expect(matchesTrackingFormat('^\\d{13}$', '1234567890123')).toBe(true)
    expect(matchesTrackingFormat('^\\d{13}$', '12345')).toBe(false)
    // 서버가 주는 자유 문자열이라 깨진 정규식이 올 수 있다 — 그때 입력을 막아 버리면 송장 등록이 불가해진다.
    expect(matchesTrackingFormat('^[', '12345')).toBe(true)
  })
})

// ─── 회귀 감시: 소문자 코드·하드코딩 목록 잔존 ──────────────────────────────────

const APP_ROOT = join(__dirname, '../../../..')
const SCAN_DIRS = ['src', 'e2e']
const SELF = relative(APP_ROOT, __filename)

function sourceFiles(dir: string): string[] {
  const absolute = join(APP_ROOT, dir)
  let entries: string[]
  try {
    entries = readdirSync(absolute)
  } catch {
    return []
  }
  return entries.flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(join(APP_ROOT, path)).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })
}

describe('택배사 코드 회귀 감시', () => {
  it('[AC-COURIER-004] 소문자 택배사 코드와 하드코딩 택배사 목록이 코드베이스에 남아 있지 않다', () => {
    // `courierCode: 'cj'` / `defaultCourier = 'lotte'` 같은 대입만 본다 — 비교(`!==`)나 필드 접근은
    // 걸리지 않는다. 값이 서버 코드를 담는 자리이므로 대문자가 아니면 그 자체가 결함이다.
    const assignment = /\b(courierCode|courierName|defaultCourier(?:Code)?|courier)\s*[:=]\s*'([^']+)'/g
    const hardcoded = /\bCOURIER_OPTIONS\b/
    const lowercaseAssignments: string[] = []
    const hardcodedLists: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(dir)) {
        if (file === SELF) continue
        const source = readFileSync(join(APP_ROOT, file), 'utf8')
        if (hardcoded.test(source)) hardcodedLists.push(file)
        for (const match of source.matchAll(assignment)) {
          const field = match[1] ?? ''
          const value = match[2] ?? ''
          // 라벨(courierName)은 한글이라 대소문자 개념이 없다 — 코드 자리만 본다.
          if (field === 'courierName') continue
          if (value !== value.toUpperCase()) lowercaseAssignments.push(`${file}: ${field} = ${value}`)
        }
      }
    }

    expect(lowercaseAssignments).toEqual([])
    // 서버 마스터가 정본이다 — 하드코딩 목록은 trackingFormatPattern도 들고 있지 못한다.
    expect(hardcodedLists).toEqual([])
  })
})
