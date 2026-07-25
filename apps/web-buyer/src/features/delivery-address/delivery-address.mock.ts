// 배송지 폼(b10-st-4) 목업 상수·순수 로직. 우편번호 검색은 Daum 우편번호 서비스 실연동으로
// 대체됐다(`daum-postcode.ts` 참고) — PG 연동은 여전히 범위 밖.

// 휴대폰 번호 입력 필터 — 숫자와 하이픈만 남긴다(비숫자 입력은 애초에 못 들어오게 걸러낸다).
export function sanitizePhone(raw: string): string {
  return raw.replace(/[^0-9-]/g, '')
}

// 유효한 휴대폰 번호인지 판정한다. 하이픈은 무시하고 자릿수로 검사 — 휴대폰 접두
// (010·011·016·017·018·019) + 나머지 7~8자리. BE 계약(^01[016789]-?\d{3,4}-?\d{4}$)과
// 동일하게 맞춰 지역번호(02·070 등)가 통과했다가 저장 시 400 나는 걸 막는다.
// 저장 시점과 입력 에러 표시가 이 함수를 함께 본다.
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return /^01[016789]\d{7,8}$/.test(digits)
}
