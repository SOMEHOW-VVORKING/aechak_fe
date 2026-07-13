import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from '@aechak/design-system/web'

describe('BottomSheet', () => {
  it('[AC-DS-BOTTOMSHEET-001] open이면 제목과 내용을 dialog로 렌더링한다', () => {
    render(
      <BottomSheet open onClose={() => {}} title="정렬 기준">
        <p>추천순</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '정렬 기준' })).toBeInTheDocument()
    expect(screen.getByText('추천순')).toBeInTheDocument()
  })

  it('[AC-DS-BOTTOMSHEET-002] 열린 적 없으면(open=false) 아무것도 렌더링하지 않는다', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="정렬 기준">
        <p>추천순</p>
      </BottomSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[AC-DS-BOTTOMSHEET-003] Escape 키를 누르면 onClose가 호출된다', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="정렬 기준">
        <p>추천순</p>
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
