// 펫 나이 파생. 펫 관리(b10-st-3)와 SNS 프로필 머리말(b7-st-4)이 함께 쓰므로 shared에 둔다.
// SNS 프로필은 서버의 실제 생년월로 다른 사용자 펫 나이를 보여주므로 오늘 날짜로 계산한다.

// 생년(+생월) → 나이(만 나이 근사). 생년이 없으면 undefined('모름'). 생월이 있으면 올해 생일이
// 아직 안 지난 경우 한 살 어리게 계산한다.
export function petAge(
  birthYear: number | undefined,
  birthMonth?: number,
): number | undefined {
  if (birthYear == null) return undefined
  const today = new Date()
  const notYetThisYear = birthMonth != null && today.getMonth() + 1 < birthMonth ? 1 : 0
  return Math.max(0, today.getFullYear() - birthYear - notYetThisYear)
}
