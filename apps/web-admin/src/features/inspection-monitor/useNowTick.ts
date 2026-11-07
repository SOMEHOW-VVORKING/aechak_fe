import { useEffect, useState } from 'react'

/**
 * 1초마다 현재 시각을 돌려주는 시계.
 *
 * 경과 시간을 **화면에서 센다**. 서버가 준 숫자를 그대로 두면 폴링 주기만큼 늦은 값이 보이고,
 * 3초 주기에서는 "12초 전에 요청" 자리가 3초씩 뛴다. 시각 두 끝(요청·종결)은 서버가 주고 뺄셈만
 * 여기서 한다 — 그래서 종결된 건의 경과는 이 시계가 돌아도 변하지 않는다.
 */
export function useNowTick(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
