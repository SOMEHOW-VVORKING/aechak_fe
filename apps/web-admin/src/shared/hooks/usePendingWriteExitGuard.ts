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
 * 그래서 요청이 떠 있는 동안에는 라우터 이동(PUSH·REPLACE)과 브라우저 뒤로/앞으로를 막고
 * (`@tanstack/history`가 popstate를 되돌려 놓는다), 새로고침·탭 닫기에는
 * `beforeunload` 경고를 띄운다. 처리가 끝나면 가드가 저절로 풀린다.
 *
 * 가드 함수는 ref를 읽는 **고정 참조**로 둔다 — `useBlocker`의 effect 의존성에 함수가
 * 들어 있어, 렌더마다 새 함수를 넘기면 블로커를 매 렌더 등록·해제한다.
 */
export function usePendingWriteExitGuard(isPending: boolean): void {
  const pending = useRef(isPending)
  pending.current = isPending

  const shouldBlockFn = useCallback(() => pending.current, [])
  const enableBeforeUnload = useCallback(() => pending.current, [])

  useBlocker({ shouldBlockFn, enableBeforeUnload })
}
