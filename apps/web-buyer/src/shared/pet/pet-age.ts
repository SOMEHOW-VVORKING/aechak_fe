// 펫 나이 파생. 펫 관리(b10-st-3)와 SNS 프로필 머리말(b7-st-4)이 함께 쓰므로 shared에 둔다.
// SNS 프로필은 서버의 실제 생년월로 다른 사용자 펫 나이를 보여주므로 오늘 날짜로 계산한다.
// SNS 게시물 펫 태그는 게시 당시 나이라 게시물 작성 시각을 기준 날짜로 넘긴다(SNS-02 A5).

// 생년(+생월) → 나이(만 나이 근사). 생년이 없으면 undefined('모름'). 생월이 있으면 기준 해의 생일이
// 아직 안 지난 경우 한 살 어리게 계산한다.
export function petAge(
  birthYear: number | undefined,
  birthMonth?: number,
  at: Date = new Date(),
): number | undefined {
  if (birthYear == null) return undefined
  const notYetThisYear = birthMonth != null && at.getMonth() + 1 < birthMonth ? 1 : 0
  return Math.max(0, at.getFullYear() - birthYear - notYetThisYear)
}
