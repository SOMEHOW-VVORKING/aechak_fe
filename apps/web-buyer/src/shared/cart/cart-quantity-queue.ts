// 라인별 수량 변경 직렬화 큐. PATCH는 대입 의미라 빠른 연타가 서로 추월하면 마지막 의도가
// 사라진다 — 라인당 요청 하나만 띄우고, 진행 중이면 마지막 희망 수량만 기억했다가 완료 후 1회 더 보낸다.

export interface QuantityQueue<R> {
  /** 희망 수량을 등록한다. 반환 Promise는 그 라인의 진행 중 묶음이 끝날 때 마지막 응답으로 끝난다. */
  enqueue(cartItemId: number, quantity: number): Promise<R>
  /** 테스트·디버그용 — 진행 중인 라인 수. */
  size(): number
}

export function createQuantityQueue<R>(
  send: (cartItemId: number, quantity: number) => Promise<R>,
): QuantityQueue<R> {
  const lines = new Map<number, { desired: number; inFlight: Promise<R> | null }>()

  async function drain(cartItemId: number, line: { desired: number }): Promise<R> {
    for (;;) {
      const sent = line.desired
      const result = await send(cartItemId, sent)
      if (line.desired === sent) return result
    }
  }

  return {
    enqueue(cartItemId, quantity) {
      let line = lines.get(cartItemId)
      if (!line) {
        line = { desired: quantity, inFlight: null }
        lines.set(cartItemId, line)
      }
      line.desired = quantity
      if (!line.inFlight) {
        line.inFlight = drain(cartItemId, line).finally(() => {
          lines.delete(cartItemId)
        })
      }
      return line.inFlight
    },
    size: () => lines.size,
  }
}
