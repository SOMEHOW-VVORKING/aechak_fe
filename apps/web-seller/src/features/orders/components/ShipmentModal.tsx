import { useEffect, useState } from 'react'
import type { Order } from '@aechak/domain'
import { Alert, Input, Modal, Select } from '@aechak/design-system/web'
import {
  COURIER_LOAD_ERROR_MESSAGE,
  courierNameOf,
  courierSelectOptions,
  matchesTrackingFormat,
  useCouriers,
} from '@/shared/couriers'
import { useMarkShipped } from '../orders.queries'

interface ShipmentModalProps {
  order: Order | null
  onClose: () => void
}

export function ShipmentModal({ order, onClose }: ShipmentModalProps) {
  const [courierCode, setCourierCode] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  // 택배사 목록은 서버 마스터(GET /sellers/couriers)가 정본이다 — 하드코딩 5종은 코드가 소문자였고
  // 송장 형식(trackingFormatPattern)을 들고 있지 않았다.
  const couriers = useCouriers()
  const markShipped = useMarkShipped()

  useEffect(() => {
    if (order) {
      setCourierCode('')
      setTrackingNumber('')
    }
  }, [order])

  if (!order) return null

  const selected = (couriers.data ?? []).find(courier => courier.courierCode === courierCode) ?? null
  // 서버는 패턴 불일치를 400 errorCode 50304로 거절한다 — 패턴이 있는 택배사만 미리 걸러 준다.
  const formatMismatch =
    trackingNumber.trim() !== '' &&
    selected != null &&
    !matchesTrackingFormat(selected.trackingFormatPattern, trackingNumber.trim())
  const canSubmit = courierCode !== '' && trackingNumber.trim() !== '' && !formatMismatch

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
          // 목업 주문은 표시용 택배사명을 들고 있다. 실 송장 등록(POST .../shipment)이 붙으면
          // 보내는 값은 courierName이 아니라 courierCode다 — 서버가 코드로 정확 일치 조회한다.
          { orderId: order.id, courier: courierNameOf(couriers.data, courierCode), trackingNumber },
          { onSuccess: onClose },
        )
      }}
    >
      <div className="flex flex-col gap-3.5">
        <div className="rounded-md bg-surface-sunken px-3 py-2.5">
          <p className="text-caption text-text-tertiary">{order.id}</p>
          <p className="mt-0.5 text-body-sm text-text-primary">{order.productName}</p>
        </div>
        {couriers.isError && <Alert variant="error">{COURIER_LOAD_ERROR_MESSAGE}</Alert>}
        <Select
          label="택배사"
          placeholder={couriers.isPending ? '불러오는 중' : '선택'}
          options={courierSelectOptions(couriers.data)}
          value={courierCode}
          onChange={setCourierCode}
        />
        <Input
          label="운송장 번호"
          value={trackingNumber}
          onChange={e => setTrackingNumber(e.target.value)}
          placeholder="운송장 번호를 입력해 주세요"
          state={formatMismatch ? 'error' : 'default'}
          helperText={formatMismatch ? '선택한 택배사의 운송장 번호 형식과 맞지 않아요.' : undefined}
        />
        <Alert variant="info">
          운송장 번호를 입력하면 주문 상태가 <strong>배송중</strong>으로 바뀌고 구매자에게 알림이 가요.
        </Alert>
      </div>
    </Modal>
  )
}
