import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from '../ComingSoon'

describe('ComingSoon', () => {
  it('[AC-WB-COMINGSOON-001] 기본 "준비 중이에요" 안내를 렌더링한다', () => {
    render(<ComingSoon />)
    expect(screen.getByText('준비 중이에요')).toBeInTheDocument()
  })

  it('[AC-WB-COMINGSOON-002] title/description을 넘기면 그대로 노출한다', () => {
    render(<ComingSoon title="채팅 준비 중" description="곧 만나요" />)
    expect(screen.getByText('채팅 준비 중')).toBeInTheDocument()
    expect(screen.getByText('곧 만나요')).toBeInTheDocument()
  })
})
