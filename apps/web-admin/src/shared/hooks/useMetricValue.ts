import { useQuery } from '@tanstack/react-query'

/**
 * 지표 칸 하나가 그리는 **서버 숫자 하나**를 받아 온다(건수·금액 공용).
 *
 * 규칙이 둘이고, 둘 다 어기면 운영자가 거짓을 읽는다.
 *
 * 1. **조회 실패·권한 없음은 `null`이다 — 0이 아니다.** 어드민 권한이 없으면 LIVE 경로가 전부
 *    403인데 대시보드가 `0건`을 그리면 운영자는 "할 일이 없다"로 읽는다. 호출부는 `null`을
 *    `'—'`로 그린다. react-query는 재조회가 403·5xx로 실패해도 캐시된 `data`를 그대로 들고
 *    있어 그 값을 돌려주면 권한이 끊긴 뒤에도 옛 숫자가 남는다
 *    (`usePendingApplicationCount`·`useAdminOrderMonitorMetrics`와 같은 판단).
 * 2. **건수는 응답의 `totalCount`로만 센다.** 목록 길이로 세면 첫 페이지만 세고, `size=1`로
 *    받는 조회에서는 어떤 모수든 `1`이 된다. 서버가 `totalCount`를 주지 않는 자리(커서 페이지)는
 *    `null`이 올라와 그 칸이 비는 것이 맞다 — 그려 낼 수 있는 숫자가 없다.
 *
 * `fetchCount`가 `number | null`을 돌려주게 둔 이유가 2번이다. 응답에서 숫자를 꺼내는 책임은
 * 와이어 모양을 아는 feature에 남기고, 이 훅은 그 값을 그릴 수 있는지만 판정한다.
 */
export function useMetricValue(
  queryKey: readonly unknown[],
  fetchValue: (signal: AbortSignal) => Promise<number | null>,
): number | null {
  const query = useQuery<number | null>({
    queryKey,
    queryFn: ({ signal }) => fetchValue(signal),
  })
  if (query.isError) return null
  return query.data ?? null
}
