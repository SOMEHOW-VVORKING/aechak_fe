// 펫 나이 파생. 펫 관리(b10-st-3)와 SNS 프로필 머리말(b7-st-4)이 함께 쓰므로 shared에 둔다.

// 오늘 연도/월(세션 고정값. new Date() 미사용). 나이 파생에 쓴다.
export const CURRENT_YEAR = 2026
const CURRENT_MONTH = 7

// 생년(+생월) → 나이(만 나이 근사). 생년이 없으면 undefined('모름'). 생월이 있으면 올해 생일이
// 아직 안 지난 경우 한 살 어리게 계산한다.
export function petAge(
  birthYear: number | undefined,
  birthMonth?: number,
): number | undefined {
  if (birthYear == null) return undefined
  const notYetThisYear = birthMonth != null && CURRENT_MONTH < birthMonth ? 1 : 0
  return Math.max(0, CURRENT_YEAR - birthYear - notYetThisYear)
}
