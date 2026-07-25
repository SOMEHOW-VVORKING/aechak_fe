// 배송지 폼(b10-st-4) 목업 상수·순수 로직. 우편번호 검색은 Daum 우편번호 서비스 실연동으로
// 대체됐다(`daum-postcode.ts` 참고) — PG 연동은 여전히 범위 밖.

import { toPhoneDigits } from '@/shared/delivery-address'

// 휴대폰 번호 입력 필터 — 숫자와 하이픈만 남긴다(비숫자 입력은 애초에 못 들어오게 걸러낸다).
export function sanitizePhone(raw: string): string {
  return raw.replace(/[^0-9-]/g, '')
}

// 유효한 휴대폰 번호인지 판정한다. 구분자는 표기라 걷어내고 숫자만 본다 — 010은 뒤 8자리
// 고정, 011·016~019(신규 발급 없음)는 7~8자리. BE도 같은 규칙으로 정규화 후 검증하므로
// (DeliveryAddressPatterns) 폼을 통과한 값이 저장에서 400 나는 일이 없다.
export function isValidPhone(phone: string): boolean {
  return /^(010\d{8}|01[16789]\d{7,8})$/.test(toPhoneDigits(phone))
}
