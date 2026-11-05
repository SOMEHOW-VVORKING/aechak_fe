import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from '@aechak/design-system/web'

describe('Drawer', () => {
  // 닫힌 채 마운트돼 있던 Drawer를 여는 경우와 닫았다가 다시 여는 경우. jsdom은 onTransitionEnd를 쏘지 않아
  // 닫힌 뒤 언마운트는 transitionEnd를 직접 보낸다.
  function DrawerWithOpener() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          필터 열기
        </button>
        <button type="button">뒤의 버튼</button>
        <Drawer open={open} onClose={() => setOpen(false)} title="필터">
          <button type="button">초기화</button>
          <button type="button">적용</button>
        </Drawer>
      </>
    )
  }

  it('[AC-DS-DRAWER-001] 닫힌 채 마운트된 Drawer를 열 때마다 포커스가 Drawer로 가고 Tab이 Drawer 안을 돌며 닫으면 연 버튼으로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<DrawerWithOpener />)
    const opener = screen.getByRole('button', { name: '필터 열기' })

    for (const round of [1, 2]) {
      await user.click(opener)
      const dialog = await screen.findByRole('dialog')
      expect(dialog.contains(document.activeElement), `${round}번째 열기`).toBe(true)
      // 열자마자 Shift+Tab을 눌러도 포커스가 Drawer 뒤의 버튼으로 넘어가지 않는다
      await user.tab({ shift: true })
      expect(screen.getByRole('button', { name: '적용' })).toHaveFocus()
      // 첫 항목은 헤더의 닫기 버튼이다
      await user.tab()
      expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
      await user.tab({ shift: true })
      expect(screen.getByRole('button', { name: '적용' })).toHaveFocus()

      await user.keyboard('{Escape}')
      expect(opener).toHaveFocus()
      fireEvent.transitionEnd(dialog.querySelector('[tabindex="-1"]')!)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })
})
