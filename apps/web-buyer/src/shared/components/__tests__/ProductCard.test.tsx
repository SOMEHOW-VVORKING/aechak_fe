import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductCard } from '@aechak/design-system/web'

const IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>'

describe('ProductCard', () => {
  it('[AC-DS-PRODUCTCARD-001] 가격을 ko-KR 천단위 + "원"으로 렌더링한다', () => {
    render(<ProductCard image={IMG} name="자동 급식기" price={64000} />)
    expect(screen.getByText('64,000원')).toBeInTheDocument()
  })

  it('[AC-DS-PRODUCTCARD-002] originalPrice가 있으면 할인율을 자동 계산해 표시한다', () => {
    render(<ProductCard image={IMG} name="세일 상품" price={64000} originalPrice={80000} />)
    // (1 - 64000/80000) * 100 = 20% — 세일 뱃지(썸네일)와 가격 행 양쪽에 표시됨
    expect(screen.getAllByText('20%')).toHaveLength(2)
    expect(screen.getByText('80,000원')).toBeInTheDocument()
  })

  it('[AC-DS-PRODUCTCARD-003] 반올림 할인율이 0%면 뱃지/원가 취소선을 표시하지 않는다', () => {
    // 1 - 64000/64100 ≈ 0.16% → round → 0 → 표시 안 함
    render(<ProductCard image={IMG} name="거의 정가" price={64000} originalPrice={64100} />)
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('64,100원')).not.toBeInTheDocument()
  })

  it('[AC-DS-PRODUCTCARD-004] isSold면 품절 표시가 보이고 상세 이동 버튼이 없다', () => {
    const onClick = vi.fn()
    render(<ProductCard image={IMG} name="품절 상품" price={29000} isSold onClick={onClick} />)
    expect(screen.getByText('품절')).toBeInTheDocument()
    // 품절 카드는 이동 불가 — stretched 이동 버튼을 렌더링하지 않음
    expect(screen.queryByRole('button', { name: /상세 보기/ })).not.toBeInTheDocument()
  })

  it('[AC-DS-PRODUCTCARD-005] 비품절 카드는 상세 이동 버튼을 클릭하면 onClick이 호출된다', async () => {
    const onClick = vi.fn()
    render(<ProductCard image={IMG} name="자동 급식기" price={64000} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: '자동 급식기 상세 보기' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('[AC-DS-PRODUCTCARD-006] 찜 하트를 마우스로 클릭하면 찜만 토글되고 카드 이동은 일어나지 않는다', async () => {
    const onWishToggle = vi.fn()
    const onClick = vi.fn()
    render(
      <ProductCard
        image={IMG}
        name="찜 상품"
        price={32000}
        onClick={onClick}
        onWishToggle={onWishToggle}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '찜하기' }))
    expect(onWishToggle).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('[AC-DS-PRODUCTCARD-007] 찜 하트를 키보드(Enter)로 눌러도 카드 이동은 일어나지 않는다', async () => {
    const onWishToggle = vi.fn()
    const onClick = vi.fn()
    render(
      <ProductCard
        image={IMG}
        name="찜 상품"
        price={32000}
        onClick={onClick}
        onWishToggle={onWishToggle}
      />,
    )
    screen.getByRole('button', { name: '찜하기' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onWishToggle).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('[AC-DS-PRODUCTCARD-008] wished=true면 찜 해제 라벨과 aria-pressed를 노출한다', () => {
    render(
      <ProductCard image={IMG} name="찜된 상품" price={32000} wished onWishToggle={() => {}} />,
    )
    expect(screen.getByRole('button', { name: '찜 해제' })).toHaveAttribute('aria-pressed', 'true')
  })
})
