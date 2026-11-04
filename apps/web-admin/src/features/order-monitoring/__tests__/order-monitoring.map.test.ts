import { describe, expect, it } from 'vitest'
import { toKstDateParam } from '../order-monitoring.map'

/**
 * 주문 날짜 파라미터(`orderedFrom`/`orderedTo`)는 **KST 벽시계 날짜**여야 한다.
 *
 * 서버 JVM이 `TZ=Asia/Seoul`이고 받은 `LocalDate`를 `[날짜 00:00, 다음날 00:00)`로 펴서
 * `order.created_at`과 비교한다. 그래서 날짜를 UTC나 브라우저 지역 시각으로 만들면 **자정
 * 경계에서 하루가 어긋난다** — 대시보드의 `오늘 거래액`이 어제 매출을 오늘로 그린다.
 *
 * 순수 함수에 시각을 주입해 고정한다(시스템 시계를 흉내내지 않는다 — 그러면 테스트가 실행 날짜에
 * 따라 통과·실패를 바꾼다).
 */
describe('toKstDateParam', () => {
  it('[AC-ADMIN-ORDER-030] LocalDate 꼴(YYYY-MM-DD)로만 만든다 — date-time을 보내면 바인딩 400이다', () => {
    expect(toKstDateParam(new Date('2026-11-03T04:00:00Z'))).toBe('2026-11-03')
  })

  it.each([
    // KST 자정 직전 → 아직 11-03
    ['2026-11-03T14:59:59Z', '2026-11-03'],
    // KST 자정(UTC 15:00) → 11-04로 넘어간다. UTC 날짜를 쓰면 여기서 11-03이 나온다.
    ['2026-11-03T15:00:00Z', '2026-11-04'],
    // KST 오전(= UTC로는 아직 어제) → UTC 날짜를 쓰면 하루 전을 가리킨다.
    ['2026-11-03T23:30:00Z', '2026-11-04'],
    // 연·월 경계도 같은 규칙으로 넘어간다.
    ['2026-12-31T15:00:00Z', '2027-01-01'],
  ])('[AC-ADMIN-ORDER-031] %s는 KST 기준 %s이다', (utc, expected) => {
    expect(toKstDateParam(new Date(utc))).toBe(expected)
  })

  it('[AC-ADMIN-ORDER-032] 브라우저 표준시가 아니라 KST가 기준이다', () => {
    // 같은 순간을 UTC 날짜·KST 날짜가 다르게 읽는 지점. 운영자 브라우저가 어느 표준시든 서버가
    // 세는 하루와 같은 날짜를 가리켜야 하므로, 이 값은 실행 환경의 TZ와 무관하게 고정이다.
    const instant = new Date('2026-11-03T16:10:00Z')
    expect(instant.toISOString().slice(0, 10)).toBe('2026-11-03')
    expect(toKstDateParam(instant)).toBe('2026-11-04')
  })
})
