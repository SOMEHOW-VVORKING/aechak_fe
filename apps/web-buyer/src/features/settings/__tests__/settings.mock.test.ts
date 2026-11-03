import { describe, expect, it } from 'vitest'
import {
  DATA_DELETION_IMMEDIATE,
  DATA_RETENTION_ROWS,
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  GUIDELINE_REVISION,
  filterFaq,
  type FaqItem,
} from '../settings.mock'

describe('settings.mock — FAQ 필터', () => {
  it('[AC-SETTINGS-001] 카테고리 all + 빈 검색어는 전체 항목을 반환한다', () => {
    expect(filterFaq(FAQ_ITEMS, 'all', '')).toHaveLength(FAQ_ITEMS.length)
    expect(filterFaq(FAQ_ITEMS, 'all', '   ')).toHaveLength(FAQ_ITEMS.length)
  })

  it('[AC-SETTINGS-002] 카테고리를 고르면 해당 카테고리 항목만 남는다', () => {
    const order = filterFaq(FAQ_ITEMS, 'order', '')
    expect(order.length).toBeGreaterThan(0)
    expect(order.every(item => item.category === 'order')).toBe(true)
  })

  it('[AC-SETTINGS-003] 검색어는 질문/답변에 부분 일치하고 대소문자를 무시한다', () => {
    // 대소문자는 FAQ 본문에 영문이 남아 있어야만 검증되는데, 그 전제는 문구를 고칠 때마다
    // 깨진다(실제로 로그인 FAQ 에서 'Apple' 을 걷으면서 한 번 깨졌다). 순수 함수이니
    // 목 데이터에 기대지 않고 항목을 직접 만들어 본다.
    const items: FaqItem[] = [
      { id: 'q', category: 'account', question: 'Kakao 로그인', answer: '본문' },
      { id: 'a', category: 'order', question: '질문', answer: 'KAKAO 결제' },
    ]
    expect(filterFaq(items, 'all', 'kakao')).toEqual(items)
    expect(filterFaq(items, 'all', 'KaKaO')).toEqual(items)
    // 부분 일치 — 질문에만 있는 것, 답변에만 있는 것이 각각 걸린다.
    expect(filterFaq(items, 'all', '로그인').map(i => i.id)).toEqual(['q'])
    expect(filterFaq(items, 'all', '결제').map(i => i.id)).toEqual(['a'])
  })

  it('[AC-SETTINGS-004] 카테고리와 검색어는 AND로 함께 걸린다', () => {
    // '탈퇴'는 account 카테고리 답변에만 등장 → order 카테고리에서는 0건.
    expect(filterFaq(FAQ_ITEMS, 'account', '탈퇴').length).toBeGreaterThan(0)
    expect(filterFaq(FAQ_ITEMS, 'order', '탈퇴')).toHaveLength(0)
  })

  it('[AC-SETTINGS-005] 일치하는 항목이 없으면 빈 배열을 반환한다', () => {
    expect(filterFaq(FAQ_ITEMS, 'all', '존재하지않는키워드_zzz')).toHaveLength(0)
  })

  it('[AC-SETTINGS-006] 카테고리 옵션은 전체를 첫 항목으로 가진다', () => {
    expect(FAQ_CATEGORIES[0]?.value).toBe('all')
  })
})

describe('settings.mock — 가이드라인 개정 표기', () => {
  it('[AC-SETTINGS-007] 개정 표기에 SNS/리뷰/채팅 공통 부제를 노출하지 않는다', () => {
    expect(GUIDELINE_REVISION).toBe('최종 개정 2026.04.20')
    expect(GUIDELINE_REVISION).not.toContain('SNS')
  })
})

describe('settings.mock — 로그인 안내', () => {
  it('[AC-SETTINGS-008] 로그인 FAQ 는 열려 있는 provider 만 말한다', () => {
    const faq = FAQ_ITEMS.find(item => item.id === 'faq-password')
    expect(faq).toBeDefined()
    // 서버 웹 로그인은 카카오만 열려 있고(onboarding.queries 의 WEB_LOGIN_PROVIDERS), 로그인
    // 화면도 구글·애플 버튼을 '(준비 중)'으로 잠가 둔다. FAQ 가 셋을 지원한다고 적으면 로그인이
    // 안 되는 사용자가 안내대로 구글·애플을 시도하고도 진행할 수 없다.
    expect(faq?.answer).toContain('카카오')
    expect(faq?.answer).not.toContain('구글')
    expect(faq?.answer).not.toContain('Apple')
  })
})

describe('settings.mock — 계정 및 데이터 삭제 안내', () => {
  // 쿠폰·채팅·댓글·최근 본 상품은 화면도 API도 없다(BE 도메인 자체가 없거나 경로가 없다).
  // 처리 방침을 적으면 그 기능이 있고 데이터가 쌓인다고 읽힌다.
  const ABSENT = ['쿠폰', '채팅', '댓글', '최근 본']

  it('[AC-SETTINGS-009] 삭제 안내는 앱에 없는 기능의 처리 방침을 적지 않는다', () => {
    const copy = [...DATA_DELETION_IMMEDIATE, ...DATA_RETENTION_ROWS.map(row => row.label)].join(
      '\n',
    )
    for (const absent of ABSENT) expect(copy, `언급: ${absent}`).not.toContain(absent)
  })

  it('[AC-SETTINGS-010] 실연동된 적립금·팔로우·리뷰는 안내에 남아 있다', () => {
    // 적립금은 BE 적립 정책과 잔액 조회가, 팔로우는 SNS 경로가 실제로 있다 — 함께 걷어내면 반대로
    // 지워지는 데이터를 안내하지 않는 것이 된다.
    const copy = [...DATA_DELETION_IMMEDIATE, ...DATA_RETENTION_ROWS.map(row => row.label)].join(
      '\n',
    )
    for (const present of ['적립금', '팔로우', '찜', '리뷰', '문의', '거래/결제'])
      expect(copy, `누락: ${present}`).toContain(present)
  })
})
