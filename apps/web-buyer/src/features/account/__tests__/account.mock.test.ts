import { describe, expect, it } from 'vitest'
import { WITHDRAW_DELETED_INFO, WITHDRAW_RETAINED_INFO } from '../account.mock'

describe('account.mock — 탈퇴 안내 카드', () => {
  const labels = [...WITHDRAW_DELETED_INFO, ...WITHDRAW_RETAINED_INFO].map(info => info.label)

  it('[AC-WITHDRAW-009] 앱에 없는 기능의 처리 방침을 적지 않는다', () => {
    // 쿠폰·채팅·댓글은 화면도 API도 없다(BE 도메인 자체가 없다). 탈퇴 시 어떻게 된다고 적으면
    // 그 기능이 있고 데이터가 쌓인다고 읽힌다.
    for (const absent of ['쿠폰', '채팅', '댓글'])
      expect(labels.join('\n'), `언급: ${absent}`).not.toContain(absent)
  })

  it('[AC-WITHDRAW-010] 실연동된 적립금·팔로우·리뷰·문의는 안내에 남아 있다', () => {
    // 적립금은 BE 적립 정책과 잔액 조회가, 팔로우는 SNS 경로가 실제로 있다 — 함께 걷어내면
    // 반대로 지워지는 데이터를 안내하지 않는 것이 된다.
    for (const present of ['적립금', '팔로우', '찜', '리뷰', '문의'])
      expect(labels.join('\n'), `누락: ${present}`).toContain(present)
  })
})
