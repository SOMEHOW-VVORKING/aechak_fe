// 배송지 폼(b10-st-4) 목업 상수·순수 로직. 우편번호 검색은 Daum 우편번호 서비스 실연동으로
// 대체됐다(`daum-postcode.ts` 참고) — PG 연동은 여전히 범위 밖.

// 휴대폰 번호 입력 필터 — 숫자와 하이픈만 남긴다(비숫자 입력은 애초에 못 들어오게 걸러낸다).
export function sanitizePhone(raw: string): string {
  return raw.replace(/[^0-9-]/g, '')
}

// 유효한 휴대폰 번호인지 판정한다. 하이픈은 무시하고 자릿수로 검사 — 0으로 시작하는 10~11자리
// (예: 010-1234-5678 → 01012345678). 저장 시점과 입력 에러 표시가 이 함수를 함께 본다.
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return /^0\d{9,10}$/.test(digits)
}
