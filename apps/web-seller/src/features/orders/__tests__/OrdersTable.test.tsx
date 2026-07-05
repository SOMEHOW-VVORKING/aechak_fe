import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OrdersTable } from '../components/OrdersTable'
import { MOCK_ORDERS } from '../orders.mock'

// AC-ORDERS-001: 주문 조회가 실패하면 오류 메시지와 다시 시도 버튼을 보여준다
describe('OrdersTable', () => {
  it('[AC-ORDERS-001] shows a retry affordance when isError is true', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<OrdersTable orders={[]} isLoading={false} isError onRetry={onRetry} onShip={vi.fn()} />)

    expect(screen.getByText('주문을 불러오지 못했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /다시 시도/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('[AC-ORDERS-002] renders order rows with a shipment action for new orders', () => {
    render(<OrdersTable orders={MOCK_ORDERS} isLoading={false} isError={false} onRetry={vi.fn()} onShip={vi.fn()} />)

    expect(screen.getByText('20260616-0091')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /발송 처리/i }).length).toBeGreaterThan(0)
  })
})
