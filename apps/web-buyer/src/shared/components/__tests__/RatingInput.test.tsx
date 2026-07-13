import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RatingInput } from '@aechak/design-system/web'

describe('RatingInput', () => {
  it('[AC-DS-RATING-001] readonly면 별점 텍스트를 이미지 라벨로 노출한다(소수값 포함)', () => {
    render(<RatingInput value={4.8} readonly />)
    expect(screen.getByRole('img', { name: '5점 만점에 4.8점' })).toBeInTheDocument()
  })

  it('[AC-DS-RATING-002] onChange가 없으면 표시 전용이라 라디오 버튼이 없다', () => {
    render(<RatingInput value={3} />)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('[AC-DS-RATING-003] 입력 모드에서 별을 탭하면 정수 값으로 onChange가 호출된다', async () => {
    const onChange = vi.fn()
    render(<RatingInput value={0} onChange={onChange} />)
    const stars = screen.getAllByRole('radio')
    expect(stars).toHaveLength(5)
    await userEvent.click(stars[3]!)
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('[AC-DS-RATING-004] readonly 소수 평점은 마지막 별을 소수부만큼 부분 채운다(정수 반올림 안 함)', () => {
    // 채워진 오버레이(aria-hidden div)의 폭이 소수부에 따라 단조 증가해야 한다.
    // 4.1이 4.0과 같으면(과거 버그) 0.1만큼의 부분 별이 사라진 것.
    const filledWidth = (value: number): number => {
      const { container } = render(<RatingInput value={value} readonly size={28} />)
      const overlay = container.querySelector('div[aria-hidden="true"]') as HTMLElement
      return parseFloat(overlay.style.width)
    }
    const w40 = filledWidth(4)
    const w41 = filledWidth(4.1)
    const w48 = filledWidth(4.8)
    const w50 = filledWidth(5)
    expect(w41).toBeGreaterThan(w40)
    expect(w48).toBeGreaterThan(w41)
    expect(w50).toBeGreaterThan(w48)
  })
})
