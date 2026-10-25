import { useState } from 'react'
import { Alert, Input, Modal, Select } from '@aechak/design-system/web'
import {
  COURIER_LOAD_ERROR_MESSAGE,
  courierSelectOptions,
  matchesTrackingFormat,
  useCouriers,
} from '@/shared/couriers'
import { formatOrderedAt, type SellerOrderSummary, type ShipmentRegisterRequest } from '../orders.contract'

interface ShipmentModalProps {
  /** null이면 닫힘. 주문이 바뀌면 라우트가 `key`로 다시 마운트해 입력값을 버린다. */
  order: SellerOrderSummary | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: ShipmentRegisterRequest) => void
}

export function ShipmentModal({ order, loading, onClose, onSubmit }: ShipmentModalProps) {
  const [courierCode, setCourierCode] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  // 빈 칸을 둔 채 발송 확정을 누른 적이 있는지. DS Modal은 확인 버튼을 `loading`으로만 잠그고
  // confirmDisabled가 없어, 못 보내는 상태에서도 버튼이 눌린다 — 그때 조용히 return하면 버튼이
  // 죽은 것처럼 보인다. 그래서 누른 뒤에는 비어 있는 칸을 짚어 준다(처음부터 빨갛게 하지는 않는다).
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // 택배사 목록은 서버 마스터(GET /sellers/couriers)가 정본이다 — 하드코딩하지 않는다.
  const couriers = useCouriers()

  if (!order) return null

  const selected = (couriers.data ?? []).find(courier => courier.courierCode === courierCode) ?? null
  // 서버는 패턴 불일치를 400 errorCode 50304로 거절한다 — 패턴이 있는 택배사만 미리 걸러 준다.
  const formatMismatch =
    trackingNumber.trim() !== '' &&
    selected != null &&
    !matchesTrackingFormat(selected.trackingFormatPattern, trackingNumber.trim())
  const canSubmit = courierCode !== '' && trackingNumber.trim() !== '' && !formatMismatch
  // 마스터가 비어 돌아오는 경우(활성 택배사 0건)는 성공 응답이라 isError가 아니다 — 고를 것이 없는
  // 이유를 적지 않으면 빈 Select만 남는다.
  const noCouriers = !couriers.isPending && !couriers.isError && (couriers.data?.length ?? 0) === 0
  const trackingError = formatMismatch
    ? '선택한 택배사의 운송장 번호 형식과 맞지 않아요.'
    : submitAttempted && trackingNumber.trim() === ''
      ? '운송장 번호를 입력해 주세요.'
      : undefined

  return (
    <Modal
      open
      onClose={onClose}
      title="발송 처리"
      cancelLabel="취소"
      confirmLabel="발송 확정"
      loading={loading}
      onConfirm={() => {
        if (!canSubmit) {
          setSubmitAttempted(true)
          return
        }
        // 보내는 값은 courierName이 아니라 courierCode다 — 서버가 코드로 정확 일치 조회한다
        // (소문자로 바꾸면 404 errorCode 50303). 송장번호는 서버도 trim하지만 미리 다듬어 보낸다.
        onSubmit({ courierCode, trackingNumber: trackingNumber.trim() })
      }}
    >
      <div className="flex flex-col gap-3.5">
        <div className="rounded-md bg-surface-sunken px-3 py-2.5">
          <p className="text-caption text-text-tertiary">{formatOrderedAt(order.orderedAt)}</p>
          <p className="mt-0.5 text-body-sm text-text-primary">
            {order.orderId} / {order.recipientName} ({order.itemCount}개)
          </p>
        </div>
        {couriers.isError && <Alert variant="error">{COURIER_LOAD_ERROR_MESSAGE}</Alert>}
        {noCouriers && (
          <Alert variant="error">
            고를 수 있는 택배사가 없어요. 고객센터에 문의해 주세요.
          </Alert>
        )}
        <Select
          label="택배사"
          placeholder={couriers.isPending ? '불러오는 중' : '선택'}
          options={courierSelectOptions(couriers.data)}
          value={courierCode}
          onChange={setCourierCode}
          error={submitAttempted && courierCode === '' ? '택배사를 선택해 주세요.' : undefined}
        />
        <Input
          label="운송장 번호"
          value={trackingNumber}
          onChange={e => setTrackingNumber(e.target.value)}
          placeholder="운송장 번호를 입력해 주세요"
          maxLength={50}
          state={trackingError ? 'error' : 'default'}
          helperText={trackingError}
        />
        {/* 서버에 송장 정정 경로가 없다(재등록은 409 errorCode 50302) — 한 번뿐이라는 사실을 알린다. */}
        <Alert variant="info">
          발송을 확정하면 주문 상태가 <strong>배송중</strong>으로 바뀌어요. 등록한 송장은 셀러센터에서 바꿀 수
          없으니 번호를 다시 확인해 주세요.
        </Alert>
      </div>
    </Modal>
  )
}
