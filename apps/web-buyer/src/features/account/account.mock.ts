// 계정 화면(b10-st-2 프로필 / b10-st-9 본인 인증 / b10-st-5 탈퇴) 공용 상수·안내 문구.
// 실제 계정 데이터는 서버(shared/account)가 단일 소스이고, 닉네임 형식(30002)·휴대폰 번호 형식(90001)·
// 인증번호 형식(90001)도 서버가 판정한다 — 여기 상수는 입력 길이 제한(maxLength)과 카운터 표시에만 쓴다.

export const NICKNAME_MAX = 12
export const BIO_MAX = 150
export const OTP_LENGTH = 6

// ── 회원 탈퇴 안내(b10-st-5) ── 탈퇴 가능 여부는 서버(GET /users/me/withdrawal/check)가 판정한다.
export const WITHDRAW_RETENTION_YEARS = 5

// 재가입 제한(BE auth.rejoin.blocked-period=30d, 403/20012 REJOIN_BLOCKED). BE는 같은 소셜 계정
// (provider + providerId)으로 다시 로그인할 때만 막고, 탈퇴일 + 30일 자정부터 새 계정으로 가입을 연다.
export const WITHDRAW_REJOIN_BLOCK_DAYS = 30
export const WITHDRAW_REJOIN_NOTICE = `탈퇴 후 ${WITHDRAW_REJOIN_BLOCK_DAYS}일 동안은 같은 소셜 계정으로 다시 가입할 수 없어요.`

// 탈퇴 시 삭제/비활성화되는 정보(안내 카드). 앱과 서버에 실재하는 것만 적는다 — 쿠폰·채팅·댓글·
// 최근 본 상품은 화면도 API도 없어서, 처리 방침을 적으면 없는 기능을 가진 것처럼 읽힌다.
export const WITHDRAW_DELETED_INFO: { label: string; note: string }[] = [
  { label: '프로필 / 펫 정보', note: '비활성화' },
  { label: '적립금', note: '즉시 소멸' },
  { label: '찜 / 팔로우', note: '삭제' },
]

// 법령에 따라 보존되는 정보(안내 카드).
export const WITHDRAW_RETAINED_INFO: { label: string; note: string }[] = [
  { label: '리뷰 / 문의', note: '익명 처리' },
]
