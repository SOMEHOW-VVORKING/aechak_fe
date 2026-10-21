import { afterEach, describe, expect, it, vi } from 'vitest'
import { peekPendingAction, resumeReturnPath, savePendingAction, takePendingAction } from '../pending-action'

const COCO = '01JABCDEF0123456789ABCDEFG'

afterEach(() => {
  vi.useRealTimers()
})

describe('pending-action(A26 대기 행동 보관)', () => {
  it('[AC-SNS01-011] 같은 대상이면 한 번만 꺼내고 다른 대상이면 남겨 둔다', () => {
    savePendingAction({ kind: 'follow', publicId: COCO, returnTo: `/sns/users/${COCO}` })

    expect(takePendingAction('01JOTHER00000000000000000')).toBeNull()
    expect(takePendingAction(COCO)?.kind).toBe('follow')
    expect(takePendingAction(COCO)).toBeNull()
  })

  it('[AC-SNS01-011] 10분이 지나면 버린다', () => {
    vi.useFakeTimers()
    savePendingAction({ kind: 'follow', publicId: COCO, returnTo: `/sns/users/${COCO}` })
    vi.advanceTimersByTime(10 * 60 * 1000)

    expect(peekPendingAction()).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 같은 출처 경로가 아니면 저장하지 않고 깨진 값은 지운다', () => {
    savePendingAction({ kind: 'follow', publicId: COCO, returnTo: '//evil.example/x' })
    expect(sessionStorage.length).toBe(0)

    sessionStorage.setItem('aechak.pendingAction', '{broken')
    expect(peekPendingAction()).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-029] 행동이 없는 open은 돌아올 경로만 주고 바로 지운다', () => {
    savePendingAction({ kind: 'open', publicId: COCO, returnTo: `/sns/users/${COCO}/follows?tab=followers` })

    expect(resumeReturnPath()).toBe(`/sns/users/${COCO}/follows?tab=followers`)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] sessionStorage 접근이 막혀도 던지지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(peekPendingAction()).toBeNull()
    spy.mockRestore()
  })
})
