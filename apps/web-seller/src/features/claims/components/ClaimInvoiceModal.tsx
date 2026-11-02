import { useState } from 'react'
import { Alert, Input, Modal, Select } from '@aechak/design-system/web'
import {
  COURIER_LOAD_ERROR_MESSAGE,
  courierSelectOptions,
  matchesTrackingFormat,
  useCouriers,
} from '@/shared/couriers'
import { CLAIM_TYPE_LABEL, claimReasonText, type SellerClaimSummary } from '../claims.contract'
import { ClaimSummaryBox } from './ClaimSummaryBox'

export type ClaimInvoiceMode = 'collection' | 'reship'

interface ClaimInvoiceModalProps {
  claim: SellerClaimSummary
  mode: ClaimInvoiceMode
  loading: boolean
  onClose: () => void
  onConfirm: (invoice: { courierCode: string; trackingNumber: string }) => void
}

const COPY = {
  collection: {
    title: '회수 송장을 등록할까요?',
    description:
      '회수 송장을 등록하면 회수 중으로 보여요. 물건이 돌아온 뒤 회수 완료를 눌러야 환불이 진행돼요.',
    confirmLabel: '회수 송장 등록',
    note: '회수 송장은 한 번만 등록할 수 있어요.',
  },
  reship: {
    title: '재발송 송장을 등록할까요?',
    description: '재발송 송장을 등록하면 교환이 끝나요. 등록 뒤에는 되돌릴 수 없어요.',
    confirmLabel: '재발송 송장 등록',
    note: '재발송 송장 등록이 교환의 마지막 처리예요.',
  },
} as const

/**
 * 회수 송장·교환 재발송 송장 등록. 두 경로의 요청 모양(courierCode·trackingNumber)과 실패 계약이
 * 같아 한 Modal이 문구만 바꿔 쓴다.
 *
 * 택배사 목록은 서버 마스터(GET /sellers/couriers)가 정본이다 — 코드를 소문자로 바꾸거나 목록을
 * 하드코딩하면 404 errorCode 50303이 된다. 하드코딩 폴백을 부활시키지 않고 못 고르는 이유를 알린다.
 */
export function ClaimInvoiceModal({ claim, mode, loading, onClose, onConfirm }: ClaimInvoiceModalProps) {
  const [courierCode, setCourierCode] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [blocked, setBlocked] = useState(false)
  const couriers = useCouriers()
  const copy = COPY[mode]

  const options = courierSelectOptions(couriers.data)
  // 조회는 됐는데 고를 택배사가 없는 경우 — placeholder만 있는 Select를 필수값으로 요구하면 셀러가
  // 고를 수 없는 것을 고르라는 말이 된다. 이유를 밝히고 입력·제출을 함께 닫는다.
  const hasNoCourier = !couriers.isPending && !couriers.isError && options.length === 0
  const selected = (couriers.data ?? []).find(courier => courier.courierCode === courierCode) ?? null
  const trimmedTracking = trackingNumber.trim()
  // **서버가 형식을 봐 주지 않는다.** `CourierMaster.validateTrackingNumber`를 부르는 곳은 최초
  // 발송(SellerOrderService)뿐이고 회수·재발송(ClaimCollectionService)은 공백·길이만 본다 — 틀린
  // 번호를 보내면 그대로 등록돼 구매자가 추적할 수 없는 송장이 남는다. 그래서 이 선검증이 유일한
  // 방어선이다(없어도 되는 편의가 아니다). 패턴이 없는 택배사는 통과시킨다.
  const formatMismatch =
    trimmedTracking !== '' &&
    selected != null &&
    !matchesTrackingFormat(selected.trackingFormatPattern, trimmedTracking)
  const canSubmit = courierCode !== '' && trimmedTracking !== '' && !formatMismatch

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      cancelLabel="취소"
      confirmLabel={copy.confirmLabel}
      loading={loading}
      onConfirm={() => {
        if (!canSubmit) {
          setBlocked(true)
          return
        }
        onConfirm({ courierCode, trackingNumber: trimmedTracking })
      }}
    >
      <div className="flex flex-col gap-3.5">
        <ClaimSummaryBox
          rows={[
            { label: '주문번호', value: claim.orderPublicId, mono: true },
            { label: '유형', value: CLAIM_TYPE_LABEL[claim.claimType] },
            { label: '구매자 사유', value: claimReasonText(claim) },
          ]}
        />
        {couriers.isError && <Alert variant="error">{COURIER_LOAD_ERROR_MESSAGE}</Alert>}
        {hasNoCourier && (
          <Alert variant="warning">
            등록할 수 있는 택배사가 없어요. 택배사가 등록된 뒤에 다시 시도해 주세요.
          </Alert>
        )}
        <Select
          label="택배사"
          placeholder={couriers.isPending ? '불러오는 중' : '선택'}
          options={options}
          value={courierCode}
          onChange={value => {
            setCourierCode(value)
            setBlocked(false)
          }}
          disabled={loading || hasNoCourier}
          error={blocked && courierCode === '' ? '택배사를 선택해 주세요.' : undefined}
        />
        <Input
          label="송장번호"
          value={trackingNumber}
          onChange={event => {
            setTrackingNumber(event.target.value)
            setBlocked(false)
          }}
          placeholder="송장번호를 입력해 주세요"
          maxLength={50}
          disabled={loading || hasNoCourier}
          state={formatMismatch || (blocked && trimmedTracking === '') ? 'error' : 'default'}
          helperText={
            formatMismatch
              ? '선택한 택배사의 송장번호 형식과 맞지 않아요.'
              : blocked && trimmedTracking === ''
                ? '송장번호를 입력해 주세요.'
                : undefined
          }
        />
        <Alert variant="info">{copy.note}</Alert>
      </div>
    </Modal>
  )
}
