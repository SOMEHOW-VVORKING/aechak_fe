import { act } from '@testing-library/react'

// jsdom 26에는 IntersectionObserver가 없다. SNS 목록의 끝 감시 요소(design 6절 6번)를 테스트가 화면 안팎으로 옮길 수 있게
// 흉내 낸다. 브라우저처럼 observe 직후 지금 상태를 한 번 알리고, 상태가 바뀌면 모든 관찰자에게 다시 알린다.
// 기본은 화면 밖이라 테스트가 setListEndInView(true)로 내리기 전에는 다음 페이지를 부르지 않는다.

let inView = false
const observers = new Set<StubIntersectionObserver>()

class StubIntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]
  private readonly targets = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.add(this)
  }

  observe(target: Element) {
    this.targets.add(target)
    this.notify([target])
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    observers.delete(this)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  notify(targets = [...this.targets]) {
    if (targets.length === 0) return
    const entries = targets.map(
      target => ({ target, isIntersecting: inView, intersectionRatio: inView ? 1 : 0 }) as IntersectionObserverEntry,
    )
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

export function stubIntersectionObserver(): void {
  window.IntersectionObserver = StubIntersectionObserver as unknown as typeof IntersectionObserver
}

/** 목록 끝 감시 요소가 화면 안(true)이나 밖(false)에 있게 한다 */
export function setListEndInView(next: boolean): void {
  inView = next
  act(() => observers.forEach(observer => observer.notify()))
}

export function resetIntersection(): void {
  inView = false
  observers.clear()
}
