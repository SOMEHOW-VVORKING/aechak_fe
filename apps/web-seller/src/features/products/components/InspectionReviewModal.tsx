import { useEffect, useState } from 'react'
import type { Product } from '@aechak/domain'
import { Button, Modal, Select, StatusPill, Textarea } from '@aechak/design-system/web'
import { useRequestReinspection, useSubmitAppeal, INSPECTION_STATUS_LABEL } from '../products.queries'

const APPEAL_REASON_OPTIONS = [
  { value: 'miscategorized', label: '정상 상품인데 잘못 분류됨' },
  { value: 'false_positive', label: 'AI 자동 검수 오탐' },
  { value: 'other', label: '기타' },
]

type Step = 'detail' | 'reinspect' | 'appeal'

interface InspectionReviewModalProps {
  product: Product | null
  onClose: () => void
}

export function InspectionReviewModal({ product, onClose }: InspectionReviewModalProps) {
  const [step, setStep] = useState<Step>('detail')
  const [note, setNote] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [detail, setDetail] = useState('')

  const requestReinspection = useRequestReinspection()
  const submitAppeal = useSubmitAppeal()

  useEffect(() => {
    if (product) {
      setStep('detail')
      setNote('')
      setReasonCode('')
      setDetail('')
    }
  }, [product])

  if (!product) return null

  if (step === 'reinspect') {
    return (
      <Modal
        open
        onClose={() => setStep('detail')}
        title="AI 재검수 요청"
        cancelLabel="취소"
        confirmLabel="재검수 요청"
        loading={requestReinspection.isPending}
        onConfirm={() => {
          requestReinspection.mutate(
            { productId: product.id, note },
            { onSuccess: onClose },
          )
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-sm font-medium text-text-primary">{product.name}</p>
          <Textarea
            label="보완 설명"
            value={note}
            onChange={setNote}
            placeholder="지적된 내용을 어떻게 보완했는지 설명해 주세요."
          />
        </div>
      </Modal>
    )
  }

  if (step === 'appeal') {
    return (
      <Modal
        open
        onClose={() => setStep('detail')}
        title="AI 이의 신청"
        cancelLabel="취소"
        confirmLabel="이의 신청 제출"
        loading={submitAppeal.isPending}
        onConfirm={() => {
          submitAppeal.mutate(
            { productId: product.id, reasonCode, detail },
            { onSuccess: onClose },
          )
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-sm font-medium text-text-primary">{product.name}</p>
          <Select
            label="이의 신청 사유"
            placeholder="사유 선택"
            options={APPEAL_REASON_OPTIONS}
            value={reasonCode}
            onChange={setReasonCode}
          />
          <Textarea
            label="상세 설명"
            value={detail}
            onChange={setDetail}
            placeholder="이의 신청 사유를 상세히 설명해 주세요."
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="검수 상세" cancelLabel="닫기">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm font-medium text-text-primary">
          {product.name} <span className="text-text-tertiary">/ No. {product.code}</span>
        </p>
        <div className="flex items-center justify-between">
          <span className="text-label text-text-secondary">현재 검수 상태</span>
          <StatusPill variant={product.inspectionStatus === 'rejected' ? 'error' : 'neutral'}>
            {INSPECTION_STATUS_LABEL[product.inspectionStatus]}
          </StatusPill>
        </div>
        {product.rejectionReason && (
          <div className="flex flex-col gap-1">
            <span className="text-label text-text-secondary">반려 사유</span>
            <p className="text-body-sm leading-relaxed text-text-secondary">{product.rejectionReason}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setStep('reinspect')}>
            재검수 요청
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setStep('appeal')}>
            이의 신청
          </Button>
        </div>
      </div>
    </Modal>
  )
}
