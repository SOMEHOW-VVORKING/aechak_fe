import { describe, it, expect } from 'vitest'
import { createQuantityQueue } from '../cart-quantity-queue'

// 수동 해소 가능한 send 스텁 — 요청이 서버에 머무는 동안 들어온 연타를 재현한다.
function deferredSender() {
  const calls: Array<{ cartItemId: number; quantity: number }> = []
  const resolvers: Array<(value: string) => void> = []
  const rejecters: Array<(error: unknown) => void> = []
  const send = (cartItemId: number, quantity: number) =>
    new Promise<string>((resolve, reject) => {
      calls.push({ cartItemId, quantity })
      resolvers.push(resolve)
      rejecters.push(reject)
    })
  return {
    send,
    calls,
    resolveNext: async (value = 'ok') => {
      resolvers.shift()?.(value)
      rejecters.shift()
      await Promise.resolve()
      await Promise.resolve()
    },
    rejectNext: async (error: unknown) => {
      rejecters.shift()?.(error)
      resolvers.shift()
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

describe('cart-quantity-queue(라인별 수량 직렬화)', () => {
  it('[AC-CART-QUEUE-001] 진행 중에 들어온 연타는 마지막 희망 수량만 1회 더 보낸다', async () => {
    const s = deferredSender()
    const queue = createQuantityQueue(s.send)

    const first = queue.enqueue(1, 2)
    const second = queue.enqueue(1, 3)
    const third = queue.enqueue(1, 4)
    // 라인 하나에 요청 하나 — 2를 보내는 동안 3·4는 보내지 않는다.
    expect(s.calls).toEqual([{ cartItemId: 1, quantity: 2 }])

    await s.resolveNext()
    // 완료 후 마지막 값(4)만 한 번 더 보낸다(3은 건너뜀).
    expect(s.calls).toEqual([
      { cartItemId: 1, quantity: 2 },
      { cartItemId: 1, quantity: 4 },
    ])

    await s.resolveNext('final')
    await expect(Promise.all([first, second, third])).resolves.toEqual(['final', 'final', 'final'])
    expect(s.calls).toHaveLength(2)
    expect(queue.size()).toBe(0)
  })

  it('[AC-CART-QUEUE-002] 다른 라인은 서로 막지 않는다', async () => {
    const s = deferredSender()
    const queue = createQuantityQueue(s.send)
    void queue.enqueue(1, 2)
    void queue.enqueue(2, 5)
    expect(s.calls).toEqual([
      { cartItemId: 1, quantity: 2 },
      { cartItemId: 2, quantity: 5 },
    ])
    await s.resolveNext()
    await s.resolveNext()
    expect(queue.size()).toBe(0)
  })

  it('[AC-CART-QUEUE-003] 요청이 끝난 뒤 들어온 변경은 새 요청으로 나간다', async () => {
    const s = deferredSender()
    const queue = createQuantityQueue(s.send)
    const first = queue.enqueue(1, 2)
    await s.resolveNext()
    await first
    void queue.enqueue(1, 3)
    expect(s.calls.map(c => c.quantity)).toEqual([2, 3])
  })

  it('[AC-CART-QUEUE-004] 실패하면 묶음 전체가 거부되고 큐가 비워져 다음 변경이 막히지 않는다', async () => {
    const s = deferredSender()
    const queue = createQuantityQueue(s.send)
    const first = queue.enqueue(1, 2)
    const second = queue.enqueue(1, 3)
    const error = new Error('409')
    await s.rejectNext(error)
    await expect(first).rejects.toBe(error)
    await expect(second).rejects.toBe(error)
    expect(queue.size()).toBe(0)
    void queue.enqueue(1, 5)
    expect(s.calls.map(c => c.quantity)).toEqual([2, 5])
  })
})
