import { useEffect, useState } from 'react'
import type { Order } from '@aechak/domain'
import { Alert, Input, Modal, Select } from '@aechak/design-system/web'
import { useMarkShipped } from '../orders.queries'

const COURIER_OPTIONS = [
  { value: 'cj', label: 'CJ대한통운' },
  { value: 'hanjin', label: '한진택배' },
  { value: 'lotte', label: '롯데택배' },
  { value: 'post', label: '우체국택배' },
]

interface ShipmentModalProps {
  order: Order | null
  onClose: () => void
}

export function ShipmentModal({ order, onClose }: ShipmentModalProps) {
  const [courier, setCourier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const markShipped = useMarkShipped()

  useEffect(() => {
    if (order) {
      setCourier('')
      setTrackingNumber('')
    }
  }, [order])

  if (!order) return null

  const canSubmit = courier !== '' && trackingNumber.trim() !== ''

  return (
    <Modal
      open
      onClose={onClose}
      title="발송 처리"
      cancelLabel="취소"
      confirmLabel="발송 확정"
      loading={markShipped.isPending}
      onConfirm={() => {
        if (!canSubmit) return
        markShipped.mutate(
          { orderId: order.id, courier: COURIER_OPTIONS.find(c => c.value === courier)?.label ?? courier, trackingNumber },
          { onSuccess: onClose },
        )
      }}
    >
      <div className="flex flex-col gap-3.5">
        <div className="rounded-md bg-surface-sunken px-3 py-2.5">
          <p className="text-caption text-text-tertiary">{order.id}</p>
          <p className="mt-0.5 text-body-sm text-text-primary">{order.productName}</p>
        </div>
        <Select label="택배사" placeholder="선택" options={COURIER_OPTIONS} value={courier} onChange={setCourier} />
        <Input
          label="운송장 번호"
          value={trackingNumber}
          onChange={e => setTrackingNumber(e.target.value)}
          placeholder="운송장 번호를 입력해 주세요"
        />
        <Alert variant="info">
          운송장 번호를 입력하면 주문 상태가 <strong>배송중</strong>으로 바뀌고 구매자에게 알림이 가요.
        </Alert>
      </div>
    </Modal>
  )
}
