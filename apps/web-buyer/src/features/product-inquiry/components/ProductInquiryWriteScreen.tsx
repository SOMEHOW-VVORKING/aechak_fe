import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import type { ProductInquiryCategory } from '@aechak/api'
import {
  BottomFixedAction,
  Checkbox,
  Input,
  MobileScreen,
  Textarea,
  type ToastVariant,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { RadioList } from '@/shared/components/RadioList'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  INQUIRY_CATEGORY_OPTIONS,
  INQUIRY_CONTENT_MAX,
  INQUIRY_TITLE_MAX,
} from '../productInquiry.labels'
import { productInquiryErrorMessage, useAskProductInquiry } from '../productInquiry.queries'

/**
 * 상품 문의 등록(SCRUM-340). 유형 라디오 + 제목 + 본문 + 비밀글 체크 → POST.
 *
 * 등록 뒤에는 상품 상세로 돌아간다. 상세 목록 캐시는 mutation이 비워 두므로 돌아가면 방금 쓴
 * 문의가 포함된 목록을 다시 받는다.
 */
export function ProductInquiryWriteScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const ask = useAskProductInquiry()

  const [category, setCategory] = useState<ProductInquiryCategory | ''>('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [secret, setSecret] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: ToastVariant }>({
    open: false,
    message: '',
    variant: 'error',
  })

  const goBack = useSafeBack({ to: '/products/$productId', params: { productId } })

  // 서버와 같은 기준으로 본다: trim 뒤 비어 있으면 못 보낸다(서버는 120101·120103을 던진다).
  const canSubmit = category !== '' && title.trim() !== '' && content.trim() !== ''

  const handleSubmit = () => {
    if (category === '' || !canSubmit) return
    ask.mutate(
      { productId, body: { category, title: title.trim(), content: content.trim(), secret } },
      {
        // 실패를 침묵하지 않는다 — 길이·자기 상품 같은 사유는 서버만 아는 것이라 errorCode로 안내한다.
        onError: error =>
          setToast({ open: true, message: productInquiryErrorMessage(error), variant: 'error' }),
        onSuccess: () => navigate({ to: '/products/$productId', params: { productId } }),
      },
    )
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="상품 문의하기" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '문의 등록',
            onClick: handleSubmit,
            disabled: !canSubmit,
            loading: ask.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-subheading font-semibold text-text-primary">
            판매자에게 물어보세요
          </p>
          <p className="text-body-sm text-text-secondary">
            판매자가 확인하고 영업일 2일 안에 답변해요.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-text-primary">문의 유형</span>
          <RadioList
            name="product-inquiry-category"
            options={INQUIRY_CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
          />
        </div>

        <Input
          label="제목"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={INQUIRY_TITLE_MAX}
          placeholder="문의 제목을 입력해주세요"
        />

        <Textarea
          label="문의 내용"
          value={content}
          onChange={setContent}
          maxLength={INQUIRY_CONTENT_MAX}
          rows={6}
          placeholder="문의하실 내용을 적어주세요"
        />

        {/* 비밀글 — 서버가 목록에서 남의 비밀글 본문을 가린다. 여기서 약속하는 범위를 그대로 적는다. */}
        <div className="flex flex-col gap-1.5 rounded-card bg-surface-sunken p-3.5">
          <Checkbox checked={secret} onChange={setSecret} label="비밀글로 등록하기" />
          <p className="flex items-start gap-1 text-caption text-text-tertiary">
            <Lock className="mt-0.5 size-3 flex-none" aria-hidden="true" />
            켜면 나와 판매자만 내용을 볼 수 있어요. 다른 구매자에게는 가려져요.
          </p>
        </div>
      </div>

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant={toast.variant}
        aboveActionBar
      />
    </MobileScreen>
  )
}
