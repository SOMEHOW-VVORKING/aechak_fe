import { useCallback, useRef } from 'react'
import { useBlocker } from '@tanstack/react-router'

/**
 * 되돌릴 수 없는 처리가 떠 있는 동안 **화면을 떠나는 것까지** 막는다.
 *
 * 확인 Modal의 닫기 가드(`closeDrawer`/`closeConfirm`)는 `Drawer`·`Modal`의 `onClose`만
 * 막는다 — ESC·취소·스크림은 거기서 끊기지만 **라우트 이탈은 그 가드를 지나가지 않는다**.
 * 나가는 순간 화면이 언마운트되고, 그러면 결과를 알릴 사람이 사라진다.
 *
 * react-query가 `mutate(vars, { onSuccess, onError })`로 받은 **호출별 콜백은 관찰자가
 * 언마운트되면 실행하지 않는다**(`query-core`의 `MutationObserver.#notify`가
 * `this.#mutateOptions && this.hasListeners()`로 가둔다). 요청 자체는 `MutationCache`에
 * 남아 끝까지 가므로 서버에서는 삭제·개입·답변이 **그대로 들어가고**, 토스트만 사라진다 —
 * 운영자는 되돌릴 수 없는 처리가 됐는지 안 됐는지 모르는 채 다른 화면에 있게 된다.
 * `useMutation` 쪽 `onSettled`(무효화)는 mutation이 들고 있어 그대로 돌지만, 그건 목록을
 * 맞춰 둘 뿐 "방금 그 처리가 어떻게 됐는지"를 말해 주지 않는다.
 *
 * 그래서 요청이 떠 있는 동안에는 라우터 이동(PUSH·REPLACE)과 브라우저 뒤로 가기를 막고
 * (`@tanstack/history`가 막은 POP을 `go(1)`로 되돌린다), 새로고침·탭 닫기에는
 * `beforeunload` 경고를 띄운다. 처리가 끝나면 가드가 저절로 풀린다.
 *
 * **세션 만료의 로그인 이동은 막지 않는다.** 401 뒤 refresh까지 실패하면 공유 클라이언트가
 * 요청을 reject하기 전에 전역 콜백을 부르고, 그 콜백(`features/auth`의
 * `setupAuthExpiredRedirect`)이 `/login`으로 보낸다 — 그 이동을 막으면 (ⅰ) 처리가 끝난 뒤
 * 아무도 다시 보내 주지 않고, (ⅱ) 막힌 이동의 약속이 매달려 있어 그 핸들러의 `redirecting`
 * 플래그가 영구히 켜진 채 남아 **다음 만료도 무시된다**. 인증이 끊긴 화면에 남는 것이
 * 결과를 못 보는 것보다 나쁘므로 이 목적지만 통과시킨다.
 *
 * 가드 함수는 ref를 읽는 **고정 참조**로 둔다 — `useBlocker`의 effect 의존성에 함수가
 * 들어 있어, 렌더마다 새 함수를 넘기면 블로커를 매 렌더 등록·해제한다.
 *
 * 남는 구멍 둘은 알고 둔다. ① 브라우저 **앞으로 가기**는 라이브러리가 막은 POP을 방향과
 * 무관하게 `go(1)`로 되돌려(`@tanstack/history`) 화면은 남지만 주소창이 어긋날 수 있다.
 * ② `isPending`은 `onSettled`의 무효화 재조회까지 포함하므로(mutation은 그 약속이 끝나야
 * success를 dispatch한다) 재조회가 늦으면 가드도 그만큼 늦게 풀린다 — 그 사이에도
 * 새로고침은 경고일 뿐 차단이 아니라 운영자가 빠져나갈 길은 남아 있다.
 */
export function usePendingWriteExitGuard(isPending: boolean): void {
  const pending = useRef(isPending)
  pending.current = isPending

  const shouldBlockFn = useCallback(
    ({ next }: { next: { pathname: string } }) =>
      pending.current && !next.pathname.startsWith('/login'),
    [],
  )
  const enableBeforeUnload = useCallback(() => pending.current, [])

  useBlocker({ shouldBlockFn, enableBeforeUnload })
}
