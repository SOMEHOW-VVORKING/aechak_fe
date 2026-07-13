import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timeline, type TimelineStep } from '@aechak/design-system/web'

const steps: TimelineStep[] = [
  { label: '결제완료', sublabel: '6/13', status: 'done' },
  { label: '배송중', sublabel: '6/14', status: 'active' },
  { label: '배송완료', status: 'todo' },
]

describe('Timeline', () => {
  it('[AC-DS-TIMELINE-001] 모든 단계의 라벨과 서브라벨을 렌더링한다', () => {
    render(<Timeline steps={steps} />)
    expect(screen.getByText('결제완료')).toBeInTheDocument()
    expect(screen.getByText('배송중')).toBeInTheDocument()
    expect(screen.getByText('배송완료')).toBeInTheDocument()
    expect(screen.getByText('6/13')).toBeInTheDocument()
  })

  it('[AC-DS-TIMELINE-002] 단계 수만큼 리스트 항목을 만든다', () => {
    render(<Timeline steps={steps} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
