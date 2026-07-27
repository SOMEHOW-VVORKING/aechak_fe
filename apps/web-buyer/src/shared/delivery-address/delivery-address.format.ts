// 연락처 표시 규칙. 서버는 숫자만 저장하므로(하이픈은 표기) 화면에서 조립해 보여준다.
// 주소록·주문서가 같이 쓰기 때문에 feature가 아니라 shared에 둔다.

/** 구분자(공백·하이픈·점·괄호)만 걷어낸다 — 서버 저장 형식(숫자만)과 같은 규칙. */
export function toPhoneDigits(phone: string): string {
  return phone.replace(/[\s().-]/g, '')
}

/**
 * 저장된 숫자열을 표시용으로 조립한다 — 11자리는 3-4-4, 10자리는 3-3-4.
 * 휴대폰 형식이 아니면 그대로 보여준다 — 자릿수만 보고 조립하면 지역번호(02-1234-5678)를
 * 021-234-5678로 왜곡한다.
 */
export function formatPhone(phone: string): string {
  const digits = toPhoneDigits(phone)
  if (!/^(010\d{8}|01[16789]\d{7,8})$/.test(digits)) return phone
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}
