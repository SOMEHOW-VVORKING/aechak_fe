// 마이페이지 허브(b10-st-1) 메뉴 구성. 아이콘/네비게이션은 화면(MyPageHubScreen)이 key로 매핑한다
// (mock은 JSX 없이 순수 데이터만 유지). 컷 메뉴(쿠폰/최근 본 상품/취소·반품·교환/고객센터)는
// 이번 범위 밖이라 목록에서 제외했다 — 죽은 링크를 만들지 않는다.

export interface MyPageMenuItem {
  key: string
  label: string
}

export interface MyPageMenuGroup {
  items: MyPageMenuItem[]
}

export const MYPAGE_MENU_GROUPS: MyPageMenuGroup[] = [
  {
    items: [
      { key: 'orders', label: '주문 내역' },
      { key: 'wishlist', label: '찜 목록' },
      { key: 'reviews', label: '상품 리뷰' },
      { key: 'addresses', label: '배송지 주소록' },
    ],
  },
  {
    // SNS 진입(R3-02). 기존 프로필 카드는 지금처럼 프로필 수정을 연다.
    items: [
      { key: 'sns-profile', label: '내 SNS 프로필' },
      { key: 'sns-relations', label: '차단/뮤트 관리' },
    ],
  },
  {
    items: [
      { key: 'pets', label: '펫 프로필 관리' },
      { key: 'verify', label: '본인 인증' },
      { key: 'settings', label: '설정' },
    ],
  },
  {
    items: [{ key: 'withdraw', label: '회원 탈퇴' }],
  },
]
