// 설정 그룹(b11-st-1~7)의 정적 콘텐츠·mock 데이터 + FAQ 필터 순수 로직.
// 알림/동의 토글 상태는 각 화면의 로컬 state로 다루므로(목업도 화면 단위) 여기서는
// "기본값"과 표시 콘텐츠만 제공한다.

export const APP_VERSION = 'v2.4.1'

// ── FAQ(b11-st-5) ───────────────────────────────────────────────────────────

export type FaqCategory = 'all' | 'order' | 'delivery' | 'account'

export const FAQ_CATEGORIES: { value: FaqCategory; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'order', label: '주문/결제' },
  { value: 'delivery', label: '배송' },
  { value: 'account', label: '계정' },
]

export interface FaqItem {
  id: string
  category: Exclude<FaqCategory, 'all'>
  question: string
  answer: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-cancel',
    category: 'order',
    question: '주문을 취소하고 환불받고 싶어요.',
    answer:
      '상품 준비 전이라면 주문 내역에서 바로 취소할 수 있어요. 배송이 시작된 뒤에는 취소가 어려워요. 환불은 결제 수단에 따라 영업일 기준 3~5일 내 처리돼요.',
  },
  {
    id: 'faq-payment-method',
    category: 'order',
    question: '어떤 결제 수단을 쓸 수 있나요?',
    answer:
      '카카오페이, 토스페이, 신용/체크카드로 결제할 수 있어요. 적립금은 결제 시 함께 사용할 수 있어요.',
  },
  {
    id: 'faq-delivery-late',
    category: 'delivery',
    question: '배송이 너무 늦어요. 어떻게 확인하나요?',
    answer:
      '주문 상세의 배송 추적에서 현재 배송 단계와 운송장 번호를 확인할 수 있어요.',
  },
  {
    id: 'faq-password',
    category: 'account',
    question: '로그인이 안 돼요.',
    answer:
      '애착은 소셜 로그인(카카오/구글/Apple)만 지원해요. 처음 가입할 때 사용한 소셜 계정으로 다시 로그인해 주세요.',
  },
  {
    id: 'faq-withdraw',
    category: 'account',
    question: '회원 탈퇴하면 데이터는 어떻게 되나요?',
    answer:
      '프로필/찜/펫 정보는 즉시 삭제되고, 거래/결제 기록은 법령에 따라 일정 기간 보관돼요. 자세한 내용은 계정 및 데이터 삭제 안내에서 확인할 수 있어요.',
  },
]

// FAQ 필터 — 카테고리 + 검색어(질문/답변 부분 일치, 대소문자 무시). 두 조건 모두 AND.
export function filterFaq(items: FaqItem[], category: FaqCategory, query: string): FaqItem[] {
  const q = query.trim().toLowerCase()
  return items.filter(item => {
    if (category !== 'all' && item.category !== category) return false
    if (q === '') return true
    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
  })
}

// ── 동의 관리(b11-st-3) ──────────────────────────────────────────────────────

export interface RequiredConsent {
  id: string
  label: string
  agreedAt: string
  // 해당 동의의 문서 라우트. 문서 화면이 있는 항목만 연결하고, 없는 항목은 이동 불가 행으로 둔다
  // (없는데 다른 문서로 보내면 잘못된 문서를 여는 오내비게이션이 된다).
  route?: '/settings/privacy'
}

// 필수 동의 항목 — 철회 불가. 문서 화면이 있는 항목(개인정보 처리방침)만 해당 문서로 연결한다.
export const REQUIRED_CONSENTS: RequiredConsent[] = [
  { id: 'terms', label: '이용약관', agreedAt: '2026.03.10' },
  { id: 'privacy', label: '개인정보 처리방침', agreedAt: '2026.03.10', route: '/settings/privacy' },
  { id: 'location', label: '위치기반 서비스 약관', agreedAt: '2026.03.10' },
]

// 선택 동의(마케팅 수신) 기본 상태 — 화면에서 토글로 철회 가능.
export const MARKETING_CONSENT_DEFAULT = { agreed: true, agreedAt: '2026.06.16' }

// ── 개인정보 처리방침(b11-st-4) ──────────────────────────────────────────────

export const PRIVACY_REVISION = '최종 개정일 2026.05.01 / 시행일 2026.05.15'

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. 수집하는 항목',
    body: '회원 가입/서비스 이용 과정에서 휴대폰 번호, 이메일, 닉네임, 펫 정보, 주문/결제/배송 정보, 기기/접속 로그를 수집해요.',
  },
  {
    title: '2. 이용 목적',
    body: '본인 확인과 계정 관리, 주문/결제/배송 처리, 고객 문의 응대, 부정 이용 방지, 법령상 의무 이행을 위해 이용해요.',
  },
  {
    title: '3. 보유 및 이용 기간',
    body: '회원 탈퇴 시 지체 없이 파기해요. 다만 전자상거래법 등 관계 법령에 따라 거래/결제/정산 기록은 5년간 보존해요.',
  },
  {
    title: '4. 제3자 제공/위탁',
    body: '결제대행/배송/고객상담 등 서비스 제공에 필요한 범위에서만 위탁하며, 위탁 항목과 수탁사는 전문에서 확인할 수 있어요.',
  },
]

// ── 커뮤니티 가이드라인(b11-st-6) ────────────────────────────────────────────

export const GUIDELINE_REVISION = '최종 개정 2026.04.20'

export const GUIDELINE_GOOD: string[] = [
  '반려동물과 보호자에게 도움이 되는 경험/정보를 나눠요.',
  '서로 다른 양육 방식을 존중하고 예의를 지켜요.',
  '출처가 분명한 정보를 공유해요.',
]

export const GUIDELINE_BAD: string[] = [
  '욕설/혐오/차별/괴롭힘, 타인 비방.',
  '동물 학대를 조장하거나 묘사하는 콘텐츠.',
  '허위/과장 광고, 스팸, 외부 거래 유도.',
  '불법 거래/개인정보 노출.',
]

// ── 계정 및 데이터 삭제 안내(b11-st-7) ───────────────────────────────────────

export const DATA_DELETION_IMMEDIATE: string[] = [
  '프로필/펫 정보는 비활성화 후 파기돼요.',
  '적립금/보유 쿠폰은 즉시 소멸되며 복구되지 않아요.',
  '찜/팔로우/최근 본 상품은 삭제돼요.',
]

export const DATA_RETENTION_ROWS: { label: string; period: string; variant: 'neutral' | 'muted' }[] = [
  { label: '거래/결제/정산 기록', period: '5년', variant: 'neutral' },
  { label: '전자금융/소비자 분쟁 기록', period: '5년', variant: 'neutral' },
  { label: '채팅/댓글/리뷰/문의 내역', period: '익명 보관', variant: 'muted' },
]
