import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

  // 닫힌 채 마운트돼 있던 시트를 여는 경우와 닫았다가 다시 여는 경우. jsdom은 onTransitionEnd를 쏘지 않아
  // 닫힌 뒤 언마운트는 transitionEnd를 직접 보낸다.
  function SheetWithOpener() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          시트 열기
        </button>
        <button type="button">뒤의 버튼</button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="정렬 기준">
          <button type="button">추천순</button>
          <button type="button">최신순</button>
        </BottomSheet>
      </>
    )
  }

  it('[AC-DS-BOTTOMSHEET-004] 닫힌 채 마운트된 시트를 열 때마다 포커스가 시트로 가고 Tab이 시트 안을 돌며 닫으면 연 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<SheetWithOpener />)
    const opener = screen.getByRole('button', { name: '시트 열기' })

    for (const round of [1, 2]) {
      await user.click(opener)
      const dialog = await screen.findByRole('dialog')
      expect(dialog.contains(document.activeElement), `${round}번째 열기`).toBe(true)
      // 열자마자 Shift+Tab을 눌러도 포커스가 시트 뒤의 버튼으로 넘어가지 않는다
      await user.tab({ shift: true })
      expect(screen.getByRole('button', { name: '최신순' })).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('button', { name: '추천순' })).toHaveFocus()
      await user.tab({ shift: true })
      expect(screen.getByRole('button', { name: '최신순' })).toHaveFocus()

      await user.keyboard('{Escape}')
      expect(opener).toHaveFocus()
      fireEvent.transitionEnd(dialog.querySelector('[tabindex="-1"]')!)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })
})
