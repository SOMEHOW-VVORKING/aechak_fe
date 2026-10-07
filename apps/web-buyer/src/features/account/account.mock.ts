// 계정 화면(b10-st-2 프로필 / b10-st-9 본인 인증 / b10-st-5 탈퇴) 공용 상수·파생 로직.
// 실제 계정 데이터는 서버(shared/account)가 단일 소스이고, 여기서는 검증 규칙과 안내 문구만 둔다.

export const NICKNAME_MAX = 12

// 서버(온보딩·프로필 수정 공통) 닉네임 규칙: NFC 정규화 후 완성형 한글·영문·숫자 2~12자.
// 공백·이모지·자모는 불가. 중복은 서버가 PUT 시점에 최종 판정(30001)하므로 여기선 형식만 검사한다.
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,12}$/

export const BIO_MAX = 150

// 본인 인증(b10-st-9) 클라이언트 사전 검증 — 서버(@Pattern)와 동일한 규칙. 형식이 통과할 때만
// 발송 요청을 쏜다(위반은 서버도 400 errorCode 90001로 거절). 인증번호 대조는 전적으로 서버 소관.
export const OTP_LENGTH = 6
const PHONE_NUMBER_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/

export function isValidPhoneNumber(phone: string): boolean {
  return PHONE_NUMBER_PATTERN.test(phone.trim())
}

// 닉네임 형식 검증(실서버 정규식). 성공 시 목업의 "사용할 수 있는 닉네임이에요" 메시지를 돌려준다.
export function validateNickname(nickname: string): { ok: boolean; message: string } {
  const normalized = nickname.trim().normalize('NFC')
  if (normalized.length === 0) return { ok: false, message: '닉네임을 입력해 주세요.' }
  if (!NICKNAME_PATTERN.test(normalized))
    return { ok: false, message: '닉네임은 완성형 한글·영문·숫자 2~12자로 입력해 주세요.' }
  return { ok: true, message: '사용할 수 있는 닉네임이에요.' }
}

// ── 회원 탈퇴 안내(b10-st-5) ── 탈퇴 가능 여부는 서버(GET /users/me/withdrawal/check)가 판정한다.
export const WITHDRAW_RETENTION_YEARS = 5

// 재가입 제한(BE auth.rejoin.blocked-period=30d, 403/20012 REJOIN_BLOCKED). BE는 같은 소셜 계정
// (provider + providerId)으로 다시 로그인할 때만 막고, 탈퇴일 + 30일 자정부터 새 계정으로 가입을 연다.
export const WITHDRAW_REJOIN_BLOCK_DAYS = 30
export const WITHDRAW_REJOIN_NOTICE = `탈퇴 후 ${WITHDRAW_REJOIN_BLOCK_DAYS}일 동안은 같은 소셜 계정으로 다시 가입할 수 없어요.`

// 탈퇴 시 삭제/비활성화되는 정보(안내 카드).
export const WITHDRAW_DELETED_INFO: { label: string; note: string }[] = [
  { label: '프로필 / 펫 정보', note: '비활성화' },
  { label: '적립금 / 쿠폰', note: '즉시 소멸' },
  { label: '찜 / 팔로우', note: '삭제' },
]

// 법령에 따라 보존되는 정보(안내 카드).
export const WITHDRAW_RETAINED_INFO: { label: string; note: string }[] = [
  { label: '채팅 / 댓글 / 리뷰 / 문의', note: '익명 처리' },
]
