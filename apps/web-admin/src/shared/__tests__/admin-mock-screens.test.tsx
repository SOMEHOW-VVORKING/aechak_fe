import { describe, expect, it } from 'vitest'

/**
 * 어드민에는 **예시 데이터 화면이 하나도 없다**는 것을 고정한다.
 *
 * 이 파일은 원래 예시 화면 목록(SCREENS)과 쓰기 흐름(WRITE_FLOWS)을 `it.each`로 돌며 띠와 쓰기
 * 차단을 봤다. 2026-11-05~07에 마지막 예시 화면들이 모두 빠졌다 — 셀러 관리는 `/admin/sellers`
 * 다섯으로(SCRUM-362), '상품 검수 관리'는 `/admin/products` 셋으로 이름을 바꿔 '상품 카탈로그
 * 관리'로(SCRUM-363), 대시보드는 실연동 경로의 `totalCount`를 모아 실 집계로 옮겼고, '채팅 CS
 * 모니터링'은 BE에 채팅 도메인이 없어 라우트째 걷었다(SCRUM-377). 실연동 화면 계약은 각 feature
 * 의 `__tests__`가 보고, 실연동 화면에 띠가 없는지는 `admin-nav.test.tsx`의 AC-ADMIN-NAV-010이 본다.
 *
 * 두 배열을 빈 채로 남기면 `it.each([])`는 0회 돌고 통과한다. 그건 녹색이 아니라 **가드가 사라진
 * 상태**다 — 예시 화면이 다시 생겨도 띠·쓰기 차단 단언을 하나도 받지 않는다. 그래서 "예시 화면이
 * 없다"를 직접 단언한다. 아래가 깨지면 예시 화면이 생긴 것이니, 그 화면을 목록에 넣어 띠와 쓰기
 * 차단 단언을 되살린다(git 이력의 이 파일 이전 판에 그 모양이 있다).
 */
const ROUTE_SOURCES = import.meta.glob<string>('../../routes/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const MOCK_DATA_FILES = Object.keys(import.meta.glob('../../features/**/*.mock.ts'))

describe('어드민 예시 데이터 화면', () => {
  it('[AC-ADMIN-MOCK-001] 라우트를 실제로 읽었다', () => {
    // glob이 빈 결과를 주면 아래 단언이 공허하게 통과한다 — 읽은 파일이 있는지 먼저 본다.
    expect(Object.keys(ROUTE_SOURCES)).toContain('../../routes/__root.tsx')
    expect(Object.keys(ROUTE_SOURCES).length).toBeGreaterThan(10)
  })

  it('[AC-ADMIN-MOCK-002] 예시 데이터 띠를 그리는 라우트가 없다', () => {
    const withNotice = Object.entries(ROUTE_SOURCES)
      .filter(([, source]) => /<MockDataNotice\b|MOCK_WRITE_TOAST/.test(source))
      .map(([path]) => path)

    expect(withNotice).toEqual([])
  })

  it('[AC-ADMIN-MOCK-003] feature에 예시 데이터 파일이 없다', () => {
    expect(MOCK_DATA_FILES).toEqual([])
  })
})
