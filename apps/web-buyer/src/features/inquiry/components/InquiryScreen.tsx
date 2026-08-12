import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  CreditCard,
  HelpCircle,
  Store,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { SubmitInquiryRequestInquiryType } from '@aechak/api'
import { BottomFixedAction, BottomSheet, Input, MobileScreen, Textarea } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { AppToast } from '@/shared/components/AppToast'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  INQUIRY_TYPE_OPTIONS,
  MAX_INQUIRY_CONTENT_LENGTH,
  isValidEmail,
  isValidInquiry,
} from '../inquiry.mock'
import { inquiryErrorMessage, useSubmitInquiry } from '../inquiry.queries'

// 유형별 아이콘은 UI 관심사라 순수 로직(inquiry.mock)에서 분리해 여기서 value로 매핑한다.
const TYPE_ICONS: Record<SubmitInquiryRequestInquiryType, LucideIcon> = {
  ACCOUNT: UserRound,
  ORDER_PAYMENT: CreditCard,
  DELIVERY_CLAIM: Truck,
  SELLER_PRODUCT: Store,
  SERVICE_ETC: HelpCircle,
}

// 접수 성공 토스트를 잠깐 보여준 뒤 설정 홈으로 이동하기까지의 지연(ms).
const SUCCESS_RETURN_DELAY = 1600

// 토스트 onClose는 할 일이 없다(이동은 아래 effect가 담당). 매 렌더 새 함수를 넘겨 DS Toast의
// 타이머가 리셋되지 않게 모듈 레벨 stable no-op을 쓴다.
const noop = () => {}

// 고객센터 문의(b6-st-3). 목업은 select-trigger + BottomSheet(유형)라 DS Select 대신 시트를 쓴다.
// 유형/이메일/내용을 채워 제출하면 POST /inquiries로 접수하고, 성공 시 목업(3-D)대로 success
// Toast를 잠깐 띄운 뒤 설정 홈으로 replace 이동한다(뒤로가기가 제출된 폼을 재진입하지 않게).
// 401은 axios 인터셉터+전역 리다이렉트가 처리하므로 화면은 비401 오류만 인라인으로 안내한다.
export function InquiryScreen() {
  const navigate = useNavigate()
  const submit = useSubmitInquiry()
  const [inquiryType, setInquiryType] = useState<SubmitInquiryRequestInquiryType | ''>('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [content, setContent] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const goBack = useSafeBack({ to: '/settings' })

  const selectedOption = INQUIRY_TYPE_OPTIONS.find(o => o.value === inquiryType)
  // 형식 오류는 필드를 한 번 벗어난 뒤에만 — 입력 중 매 글자마다 오류가 뜨지 않게 한다.
  const emailError = emailTouched && email.trim().length > 0 && !isValidEmail(email)
  const draft = { type: inquiryType, email, content }
  const canSubmit = isValidInquiry(draft)

  // 접수 성공 시 토스트를 잠깐 보여준 뒤 설정 홈으로 replace 이동한다. 토스트 onClose 타이머가 아니라
  // submitted에만 의존하는 effect 타이머로 이동해, 성공 창 동안 입력 등으로 리렌더가 생겨도 이동이
  // 지연되지 않는다(StrictMode 이중 마운트는 cleanup으로 한 번만 예약).
  useEffect(() => {
    if (!submitted) return
    const timer = setTimeout(() => navigate({ to: '/settings', replace: true }), SUCCESS_RETURN_DELAY)
    return () => clearTimeout(timer)
  }, [submitted, navigate])

  // 사용자가 무언가 고치면 이전 제출 오류 안내를 지운다.
  const clearError = () => {
    if (errorMessage) setErrorMessage(null)
  }

  const handleSubmit = () => {
    if (!isValidInquiry(draft)) return
    setErrorMessage(null)
    submit.mutate(
      { inquiryType: draft.type, replyEmail: draft.email, content: draft.content },
      {
        onSuccess: () => setSubmitted(true),
        onError: error => setErrorMessage(inquiryErrorMessage(error)),
      },
    )
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="고객센터 문의" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '문의 제출',
            onClick: handleSubmit,
            disabled: !canSubmit || submitted,
            loading: submit.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-[18px] p-4">
        {/* 문의 유형 (select-trigger → 시트) */}
        <div className="flex flex-col gap-2">
          <span id="inquiry-type-label" className="text-label font-medium text-text-primary">
            문의 유형
          </span>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="flex h-10 items-center justify-between gap-2 rounded-input border border-border bg-surface-raised px-4 text-body outline-none transition-colors focus-visible:shadow-focus-ring"
          >
            <span className={selectedOption ? 'text-text-primary' : 'text-text-placeholder'}>
              {selectedOption ? selectedOption.label : '문의 유형을 선택해주세요'}
            </span>
            <ChevronDown className="size-[18px] flex-none text-icon-muted" />
          </button>
        </div>

        {/* 답변 받을 이메일 */}
        <div className="flex flex-col gap-2">
          <label htmlFor="inquiry-email" className="text-label font-medium text-text-primary">
            답변 받을 이메일
          </label>
          <Input
            id="inquiry-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              clearError()
            }}
            onBlur={() => setEmailTouched(true)}
            placeholder="답변 받을 이메일 주소를 입력해주세요"
            state={emailError ? 'error' : 'default'}
            aria-invalid={emailError || undefined}
            aria-describedby="inquiry-email-helper"
            helperText={
              emailError
                ? '이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'
                : '입력하신 주소로만 답변을 보내드려요.'
            }
          />
        </div>

        {/* 문의 내용 */}
        <div className="flex flex-col gap-2">
          <label htmlFor="inquiry-content" className="text-label font-medium text-text-primary">
            문의 내용
          </label>
          <Textarea
            id="inquiry-content"
            value={content}
            onChange={value => {
              setContent(value)
              clearError()
            }}
            rows={6}
            maxLength={MAX_INQUIRY_CONTENT_LENGTH}
            placeholder="상품 구매 전후 문의는 상품 상세의 1:1 채팅을 이용하면 더 빠르게 답변받을 수 있어요."
            helperText="서비스 오류/계정/결제 등 서비스 자체 문의를 남겨주세요."
          />
        </div>

        {/* 제출 오류(비401)는 인라인으로 안내 — 성공만 토스트, 오류는 화면에 머문다. */}
        {errorMessage && (
          <p role="alert" className="text-body-sm text-error-fg">
            {errorMessage}
          </p>
        )}
      </div>

      {/* 문의 유형 선택 시트 (3-B) */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="문의 유형">
        <div className="flex flex-col">
          {INQUIRY_TYPE_OPTIONS.map((opt, i) => {
            const Icon = TYPE_ICONS[opt.value]
            const active = opt.value === inquiryType
            return (
              <div key={opt.value}>
                {i > 0 && <div className="h-px bg-border-subtle" />}
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => {
                    setInquiryType(opt.value)
                    clearError()
                    setSheetOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-3.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <Icon className="size-5 flex-none text-icon" />
                  <span className="text-body text-text-primary">{opt.label}</span>
                  {active && <Check className="ml-auto size-[18px] flex-none text-brand" />}
                </button>
              </div>
            )
          })}
        </div>
      </BottomSheet>

      {/* 접수 완료 토스트 (3-D) — duration을 복귀 지연보다 길게 둬 이동 전에 사라지지 않게 한다. */}
      <AppToast
        open={submitted}
        onClose={noop}
        message="문의가 접수됐어요"
        variant="success"
        aboveActionBar
        duration={SUCCESS_RETURN_DELAY + 1500}
      />
    </MobileScreen>
  )
}
