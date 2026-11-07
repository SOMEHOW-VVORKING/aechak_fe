import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Check, Sparkles } from 'lucide-react'
import {
  Button,
  DataTable,
  DatePicker,
  FormSection,
  Input,
  PageHeader,
  PhotoUpload,
  Select,
  Textarea,
  Toggle,
  type Column,
} from '@aechak/design-system/web'
import { FieldError } from '@/shared/components/Field'
import {
  AUTOFILL_FIELD_LABEL,
  AUTOFILL_STATE_OK,
  applyAutofillDraft,
  autofillFieldNotices,
  autofillMode,
  discountRate,
  fieldDomId,
  MAX_ADDITIONAL_IMAGES,
  MAX_DETAIL_IMAGES,
  productErrorMessage,
  toAutofillRequest,
  validateProductForm,
  type AutofillFilledField,
  type AutofillMode,
  type CategoryNode,
  type ImageSlot,
  type ProductFormValues,
  type SellerOptionCombination,
} from '../products.contract'
import { useProductDraftAutofill, useProductOptions } from '../products.queries'
import {
  isWithinProductImageSizeLimit,
  OVERSIZED_PRODUCT_IMAGE_MESSAGE,
  uploadProductImage,
} from '../products.upload'
import { FieldAnchor, fieldA11y, fieldHelperId, tooltipId } from './FieldAnchor'
import { OptionBuilder } from './OptionBuilder'

interface ProductEditorProps {
  mode: 'create' | 'edit'
  /** 수정 화면에서만 — 옵션/재고를 읽기 전용으로 보여줄 상품. */
  productId?: string
  /** 한 번만 시드한다 — 라우트는 데이터가 준비된 뒤에만 마운트한다. */
  initial: ProductFormValues
  categories: CategoryNode[]
  /** 배송 정책은 셀러 단위(CRQ-SLR-04)라 다른 feature가 그린다 — feature 간 import 대신 슬롯. */
  shippingSummary: ReactNode
  submitting: boolean
  draftSaving?: boolean
  /** 검증 통과 + 이미지 업로드가 끝난 값. 요청 본문(등록/수정)은 라우트가 만든다. */
  onSubmit: (values: ProductFormValues) => void
  /** 등록(이어쓰기 포함)에서만 준다(목업 전용 임시저장). */
  onSaveDraft?: (values: ProductFormValues) => void
}

type ImageFieldKey = 'thumbnail' | 'additionalImages' | 'detailImages'

const IMAGE_FIELDS: { key: ImageFieldKey; label: string; max: number }[] = [
  { key: 'thumbnail', label: '대표 썸네일', max: 1 },
  { key: 'additionalImages', label: '추가 썸네일', max: MAX_ADDITIONAL_IMAGES },
  { key: 'detailImages', label: '상품 상세 이미지', max: MAX_DETAIL_IMAGES },
]

const SECTIONS = ['기본 정보', '카테고리', '가격/할인', '이미지/상세', '옵션/재고', '배송 정책']

function sectionOf(key: string): number {
  if (key === 'productName') return 1
  if (key === 'categoryId') return 2
  if (key === 'regularPrice' || key.startsWith('discount')) return 3
  if (key === 'thumbnail') return 4
  return 5
}

const sectionDomId = (step: number) => `product-section-${step}`
const AI_FILLED_TEXT = 'AI가 채웠어요. 내용을 확인하고 고쳐 주세요.'
const AI_REFINED_TEXT = 'AI가 다시 썼어요. 내용을 확인하고 고쳐 주세요.'
const AUTOFILL_HELP: Record<AutofillMode, string> = {
  FILL: '상품명으로 카테고리/상세 설명/옵션 초안을 받아요. 이미 쓴 칸은 그대로 둬요.',
  REFINE: '써 둔 본문을 AI가 다시 써요. 적용한 뒤 되돌릴 수 있어요.',
}

/**
 * 다시 쓴 본문과 새로 채운 빈 칸을 가려 적는다 — 셀러가 확인할 자리가 다르다.
 *
 * REFINE인데 본문이 그대로인 경우를 따로 적는다. "본문 다듬기"를 누른 셀러에게 채운 칸만 열거하면
 * 본문이 왜 그대로인지 알 길이 없다(AI가 다시 쓰지 못하면 원문을 그대로 돌려준다).
 */
function autofillSummary(filled: AutofillFilledField[], mode: AutofillMode): string {
  const rewritten = mode === 'REFINE' && filled.includes('description')
  const added = filled.filter(f => !(rewritten && f === 'description'))
  const labels = added.map(f => AUTOFILL_FIELD_LABEL[f]).join('/')
  if (rewritten) {
    return added.length > 0
      ? `AI가 본문을 다시 쓰고 ${labels}에 초안을 채웠어요. 확인하고 고쳐 주세요.`
      : 'AI가 본문을 다시 썼어요. 확인하고 고쳐 주세요.'
  }
  if (mode === 'REFINE') {
    return added.length > 0
      ? `본문은 그대로 두고 ${labels}에 초안을 채웠어요. 확인하고 고쳐 주세요.`
      : '본문을 다시 쓰지 못해 그대로 두었어요.'
  }
  if (added.length > 0) return `AI가 ${labels}에 초안을 채웠어요. 확인하고 고쳐 주세요.`
  return '채울 빈 칸이 없어 그대로 두었어요.'
}

const digitsOnly = (value: string) => value.replace(/\D/g, '')
const toOptions = (nodes: CategoryNode[] | undefined) =>
  (nodes ?? []).map(n => ({ value: String(n.categoryId), label: n.name }))

export function ProductEditor({
  mode,
  productId,
  initial,
  categories,
  shippingSummary,
  submitting,
  draftSaving = false,
  onSubmit,
  onSaveDraft,
}: ProductEditorProps) {
  const [values, setValues] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [tooltipKey, setTooltipKey] = useState<string | null>(null)
  const [imageErrors, setImageErrors] = useState<Partial<Record<ImageFieldKey, string>>>({})
  const [uploading, setUploading] = useState(false)

  // AI 초안(등록에서만). 채운 자리에 표시를 붙이고, 셀러가 그 칸을 고치면 표시를 뗀다.
  const autofill = useProductDraftAutofill()
  const [aiFilled, setAiFilled] = useState<ReadonlySet<AutofillFilledField>>(new Set())
  const [autofillNotice, setAutofillNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // AI가 비워 둔 칸의 사유(fieldStatus)와, 본문을 다시 쓰기 전 원문. 원문은 "되돌리기" 한 번만 쓴다.
  const [fieldNotices, setFieldNotices] = useState<Partial<Record<AutofillFilledField, string>>>({})
  const [refinedFrom, setRefinedFrom] = useState<string | null>(null)
  // 응답이 올 때의 폼을 본다 -- 폼을 잠그지 않으므로 기다리는 사이 셀러가 쓴 값이 있다. FILL은 그
  // 값을 덮지 않고, REFINE은 덮는다(다시 쓰라고 부른 칸이다) -- 그래서 되돌릴 원문도 응답이 올 때
  // 값으로 잡는다. 클릭 시점 값을 들고 있으면 되돌리기가 기다리는 사이 쓴 글까지 날린다.
  const valuesRef = useRef(values)
  useEffect(() => {
    valuesRef.current = values
  }, [values])

  // 이 화면이 만든 미리보기 objectURL만 모은다(프리필 슬롯은 서버 URL이라 제외). 언마운트 때 전부 해제.
  const objectUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const liveErrors = validateProductForm(values, mode === 'create')
  // 첫 제출 전에는 빈 폼을 빨갛게 칠하지 않는다. 이후엔 입력마다 다시 계산한다.
  const errors = submitted ? liveErrors : {}
  const invalidSections = new Set(Object.keys(liveErrors).map(sectionOf))

  const tipFor = (key: string) => (tooltipKey === key ? errors[key] : undefined)
  const a11y = (key: string) => fieldA11y(key, errors, tooltipKey)
  const errorState = (key: string) => (errors[key] ? 'error' : 'default')

  function update(patch: Partial<ProductFormValues>) {
    setValues(prev => ({ ...prev, ...patch }))
    setTooltipKey(null)
    // 셀러가 본문을 직접 고치면 되돌릴 자리가 사라진다 — 되돌리면 그 수정까지 날아간다.
    if ('description' in patch) setRefinedFrom(null)
    const touched: AutofillFilledField[] = []
    if ('description' in patch) touched.push('description')
    if ('categoryIds' in patch) touched.push('category')
    if ('optionGroups' in patch || 'optionEnabled' in patch) touched.push('options')
    if (touched.length === 0) return
    if (aiFilled.size > 0) setAiFilled(prev => new Set([...prev].filter(f => !touched.includes(f))))
    setFieldNotices(prev => {
      if (touched.every(f => prev[f] === undefined)) return prev
      const next = { ...prev }
      touched.forEach(f => delete next[f])
      return next
    })
  }

  function handleAutofill() {
    setAutofillNotice(null)
    setFieldNotices({})
    // 요청을 만들 때의 값으로 모드를 정한다 — 응답이 오는 사이 셀러가 본문을 지워도 적용 범위가
    // 바뀌지 않는다(바뀌면 "다듬기"를 눌렀는데 빈 칸만 채우고 끝난다).
    const mode = autofillMode(valuesRef.current)
    autofill.mutate(toAutofillRequest(valuesRef.current), {
      onSuccess: result => {
        const notice = result.sellerNotice?.trim()
        // 실제로 덮이는 값이 되돌릴 자리다 -- 기다리는 사이 셀러가 더 쓴 본문도 REFINE이 덮는다.
        const before = valuesRef.current.description
        // 비운 사유는 실패한 호출에도 실린다 — 전 필드가 EMPTY_CALL_FAILED인 응답이 그렇다.
        setFieldNotices(autofillFieldNotices(result.fieldStatus, mode))
        // 실패도 200 + state로 온다 — OK가 아니면 폼을 그대로 두고 직접 작성으로 안내한다.
        if (result.state !== AUTOFILL_STATE_OK) {
          setAutofillNotice({
            ok: false,
            text: ['지금은 AI 초안을 받을 수 없어요. 직접 작성해 주세요.', notice].filter(Boolean).join(' '),
          })
          return
        }
        const { filled } = applyAutofillDraft(valuesRef.current, result, categories, mode)
        setValues(prev => applyAutofillDraft(prev, result, categories, mode).values)
        setAiFilled(prev => new Set([...prev, ...filled]))
        // 셀러 문장을 덮었을 때만 되돌리기를 내준다. 복원은 메모리 원문으로 하고 서버를 부르지 않는다.
        // 덮지 않은 호출은 직전 버퍼를 그대로 둔다 -- 복원할 원문이 아직 그 자리이기 때문이다.
        if (mode === 'REFINE' && filled.includes('description')) setRefinedFrom(before)
        setAutofillNotice({ ok: true, text: [autofillSummary(filled, mode), notice].filter(Boolean).join(' ') })
      },
      // 쿨다운(429/40402)과 그 밖의 거절은 productErrorMessage가 문구를 맡는다.
      onError: error => setAutofillNotice({ ok: false, text: productErrorMessage(error) }),
    })
  }

  /** 다시 쓴 본문을 원문으로 돌린다. `update`가 되돌리기 자리와 AI 표시를 함께 거둔다. */
  function handleUndoRefine() {
    if (refinedFrom == null) return
    update({ description: refinedFrom })
    setAutofillNotice({ ok: true, text: '본문을 원래대로 되돌렸어요.' })
  }

  const autofillHint = (field: AutofillFilledField): { filled: boolean; text: string } | null => {
    if (aiFilled.has(field)) {
      return { filled: true, text: field === 'description' && refinedFrom != null ? AI_REFINED_TEXT : AI_FILLED_TEXT }
    }
    const text = fieldNotices[field]
    return text ? { filled: false, text } : null
  }

  // 버튼 문구·요청 mode·적용 범위가 같은 판정을 본다(products.contract의 `autofillMode`).
  const draftMode = autofillMode(values)

  const [largeId, middleId, leafId] = values.categoryIds
  const largeNode = categories.find(n => n.categoryId === largeId)
  const middleNode = largeNode?.children.find(n => n.categoryId === middleId)
  // 오류/말풍선 연결은 이미 고른 단계가 아니라 처음 비어 있는 단계의 Select에 단다(포커스도 거기로 간다).
  const emptyCategoryLevel = values.categoryIds.findIndex(id => id == null)
  const categoryA11y = (level: number) =>
    level !== emptyCategoryLevel
      ? {}
      : {
          error: errors['categoryId'],
          // Select는 error가 있으면 스스로 오류 문구를 잇는다 — 말풍선이 떠 있을 때만 덮어쓴다.
          ...(tipFor('categoryId') ? { 'aria-describedby': tooltipId('categoryId') } : {}),
        }

  const regular = Number(values.regularPrice)
  const discount = Number(values.discountPrice)
  // 0 나눗셈과 음수 할인율만 막는다 — 가격 범위는 저장 때 BE가 40001로 알려 준다.
  const showRate = values.discountPrice !== '' && regular > 0 && discount <= regular

  function handleAddImages(field: ImageFieldKey, max: number, files: File[]) {
    // 형식은 BE presign이 100000으로 거절한다(uploadPending이 그 슬롯에 붙여 안내). 크기만 FE UX
    // 정책이라 미리 거르고, 판정과 문구는 업로드 모듈이 소유한다(발급 단계의 서버 계약과 한자리).
    const accepted = files.filter(isWithinProductImageSizeLimit)
    // 상한을 넘는 만큼은 여기서 잘라 BE(40003)까지 가지 않는다 — 잘라냈다는 안내도 그래서 FE 몫이다
    // (PhotoUpload는 max에 닿으면 추가 버튼만 숨겨 다중 선택 초과를 못 막는다).
    const room = max - values[field].length
    const message =
      accepted.length < files.length
        ? OVERSIZED_PRODUCT_IMAGE_MESSAGE
        : accepted.length > room
          ? `최대 ${max}장까지 올릴 수 있어요`
          : undefined
    setImageErrors(prev => ({ ...prev, [field]: message }))
    const slots: ImageSlot[] = accepted.slice(0, room).map(file => {
      const previewUrl = URL.createObjectURL(file)
      objectUrls.current.add(previewUrl)
      return { id: crypto.randomUUID(), previewUrl, imageKey: null, file }
    })
    if (slots.length > 0) update({ [field]: [...values[field], ...slots] })
  }

  function handleRemoveImage(field: ImageFieldKey, index: number) {
    const slot = values[field][index]
    if (slot?.file) {
      URL.revokeObjectURL(slot.previewUrl)
      objectUrls.current.delete(slot.previewUrl)
    }
    setImageErrors(prev => ({ ...prev, [field]: undefined }))
    update({ [field]: values[field].filter((_, i) => i !== index) })
  }

  // presigned URL이 10분짜리라 저장 직전에 올린다(store-settings.upload 관례). 받은 키는 슬롯에
  // 다시 써 두어 재시도 때 같은 파일을 또 올리지 않는다.
  async function uploadPending(v: ProductFormValues): Promise<ProductFormValues | null> {
    const pending = IMAGE_FIELDS.flatMap(({ key }) =>
      v[key].filter(slot => slot.file && !slot.imageKey).map(slot => ({ field: key, slot })),
    )
    if (pending.length === 0) return v
    setUploading(true)
    try {
      // 일부만 실패해도 성공한 키는 슬롯에 남겨 재시도 때 다시 올리지 않는다.
      const results = await Promise.allSettled(pending.map(({ slot }) => uploadProductImage(slot.file!)))
      const keyById = new Map<string, string>()
      // 거절된 슬롯(형식 100000 등)은 그 필드 아래에 사유를 붙이고 폼에서 뺀다 — 미리보기만 남겨 두면
      // 어느 장이 문제인지 모른 채 저장이 계속 막힌다.
      const failedIds = new Set<string>()
      const failedMessages: Partial<Record<ImageFieldKey, string>> = {}
      results.forEach((result, i) => {
        const { field, slot } = pending[i]!
        if (result.status === 'fulfilled') {
          keyById.set(slot.id, result.value)
          return
        }
        failedIds.add(slot.id)
        failedMessages[field] ??= productErrorMessage(result.reason)
        URL.revokeObjectURL(slot.previewUrl)
        objectUrls.current.delete(slot.previewUrl)
      })
      const withKeys = (slots: ImageSlot[]) =>
        slots
          .filter(slot => !failedIds.has(slot.id))
          .map(slot => (keyById.has(slot.id) ? { ...slot, imageKey: keyById.get(slot.id)! } : slot))
      setValues(prev => ({
        ...prev,
        thumbnail: withKeys(prev.thumbnail),
        additionalImages: withKeys(prev.additionalImages),
        detailImages: withKeys(prev.detailImages),
      }))
      if (failedIds.size > 0) {
        setImageErrors(prev => ({ ...prev, ...failedMessages }))
        return null
      }
      return {
        ...v,
        thumbnail: withKeys(v.thumbnail),
        additionalImages: withKeys(v.additionalImages),
        detailImages: withKeys(v.detailImages),
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    const first = Object.keys(liveErrors)[0]
    // 오류 표시/말풍선/aria-describedby를 포커스 전에 커밋해야 스크린리더가 포커스 시점에 안내를 읽는다.
    flushSync(() => {
      setSubmitted(true)
      setTooltipKey(first ?? null)
    })
    if (first) {
      // CRQ-PRD-02: 첫 누락 필드로 스크롤 + 포커스 + 안내 말풍선.
      const anchor = document.getElementById(fieldDomId(first))
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const controls = Array.from(
        anchor?.querySelectorAll<HTMLElement>('input:not([type=file]), select, textarea, button') ?? [],
      )
      // 카테고리처럼 한 앵커에 입력이 여럿이면 오류가 걸린 쪽으로 보낸다.
      const target = controls.find(el => el.getAttribute('aria-invalid') === 'true') ?? controls[0]
      target?.focus({ preventScroll: true })
      return
    }
    const next = await uploadPending(values)
    if (next) onSubmit(next)
  }

  async function handleSaveDraft() {
    if (!onSaveDraft) return
    const next = await uploadPending(values)
    if (next) onSaveDraft(next)
  }

  const busy = uploading || submitting || draftSaving

  return (
    <div className="px-6 pb-6">
      <div className="sticky top-0 z-20 bg-surface-base pt-6">
        <PageHeader
          title={mode === 'create' ? '상품 등록' : '상품 수정'}
          actions={
            <>
              {onSaveDraft && (
                <Button variant="secondary" size="sm" loading={draftSaving} disabled={busy} onClick={handleSaveDraft}>
                  임시저장
                </Button>
              )}
              <Button size="sm" loading={uploading || submitting} disabled={busy} onClick={handleSubmit}>
                {mode === 'create' ? '등록하기' : '수정 완료'}
              </Button>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-[176px_1fr] gap-6">
        <nav aria-label="등록 단계" className="sticky top-24 flex flex-col gap-1 self-start">
          {SECTIONS.map((title, i) => {
            const step = i + 1
            return (
              <button
                key={step}
                type="button"
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm text-text-secondary hover:bg-surface-hover"
                onClick={() =>
                  document.getElementById(sectionDomId(step))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <span className="flex size-5 flex-none items-center justify-center rounded-full bg-surface-sunken text-badge">
                  {invalidSections.has(step) ? step : <Check className="size-3 text-success-fg" aria-label="완료" />}
                </span>
                {title}
              </button>
            )
          })}
        </nav>

        {/* 업로드/저장 중엔 입력을 잠근다 — 요청 본문은 업로드 전 값으로 만들어서 그 사이 편집은 빠진다. */}
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <Section step={1} invalid={invalidSections.has(1)}>
            <FieldAnchor fieldKey="productName" tip={tipFor('productName')}>
              <Input
                label="상품명"
                maxLength={255}
                {...a11y('productName')}
                state={errorState('productName')}
                helperText={errors['productName']}
                value={values.productName}
                onChange={e => update({ productName: e.target.value })}
              />
            </FieldAnchor>
            {mode === 'create' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
                    loading={autofill.isPending}
                    disabled={values.productName.trim() === ''}
                    onClick={handleAutofill}
                  >
                    {draftMode === 'REFINE' ? '본문 다듬기' : 'AI 초안 받기'}
                  </Button>
                  {refinedFrom != null && (
                    <Button variant="ghost" size="sm" onClick={handleUndoRefine}>
                      되돌리기
                    </Button>
                  )}
                  <span className="text-caption text-text-tertiary">{AUTOFILL_HELP[draftMode]}</span>
                </div>
                {autofillNotice &&
                  (autofillNotice.ok ? (
                    <p role="status" className="text-caption text-text-secondary">
                      {autofillNotice.text}
                    </p>
                  ) : (
                    <FieldError>{autofillNotice.text}</FieldError>
                  ))}
              </div>
            )}
          </Section>

          <Section step={2} invalid={invalidSections.has(2)}>
            <FieldAnchor fieldKey="categoryId" tip={tipFor('categoryId')}>
              <div className="grid grid-cols-3 gap-3">
                <Select
                  label="대분류"
                  placeholder="선택"
                  options={toOptions(categories)}
                  value={largeId != null ? String(largeId) : ''}
                  {...categoryA11y(0)}
                  onChange={v => update({ categoryIds: [Number(v), null, null] })}
                />
                <Select
                  label="중분류"
                  placeholder="선택"
                  options={toOptions(largeNode?.children)}
                  value={middleId != null ? String(middleId) : ''}
                  disabled={!largeNode}
                  {...categoryA11y(1)}
                  onChange={v => update({ categoryIds: [largeId, Number(v), null] })}
                />
                <Select
                  label="소분류"
                  placeholder="선택"
                  options={toOptions(middleNode?.children)}
                  value={leafId != null ? String(leafId) : ''}
                  disabled={!middleNode}
                  {...categoryA11y(2)}
                  onChange={v => update({ categoryIds: [largeId, middleId, Number(v)] })}
                />
              </div>
            </FieldAnchor>
            <AutofillHint hint={autofillHint('category')} />
          </Section>

          <Section step={3} invalid={invalidSections.has(3)}>
            <div className="w-64">
              <FieldAnchor fieldKey="regularPrice" tip={tipFor('regularPrice')}>
                <Input
                  label="정가"
                  inputMode="numeric"
                  rightAddon="원"
                  {...a11y('regularPrice')}
                  state={errorState('regularPrice')}
                  helperText={errors['regularPrice']}
                  value={values.regularPrice}
                  onChange={e => update({ regularPrice: digitsOnly(e.target.value) })}
                />
              </FieldAnchor>
            </div>
            <div>
              <Toggle
                label="할인 설정"
                checked={values.discountEnabled}
                onChange={next =>
                  update(
                    next
                      ? { discountEnabled: true }
                      : { discountEnabled: false, discountPrice: '', discountStartDate: '', discountEndDate: '' },
                  )
                }
              />
            </div>
            {values.discountEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <FieldAnchor fieldKey="discountPrice" tip={tipFor('discountPrice')}>
                  <Input
                    label="할인가"
                    inputMode="numeric"
                    rightAddon="원"
                    {...a11y('discountPrice')}
                    state={errorState('discountPrice')}
                    helperText={errors['discountPrice']}
                    value={values.discountPrice}
                    onChange={e => update({ discountPrice: digitsOnly(e.target.value) })}
                  />
                </FieldAnchor>
                <div className="flex items-end pb-2.5">
                  {showRate && (
                    <span className="text-body-sm font-semibold text-text-accent">
                      할인율 {discountRate(regular, discount)}%
                    </span>
                  )}
                </div>
                <FieldAnchor fieldKey="discountStartDate" tip={tipFor('discountStartDate')}>
                  {/* DatePicker는 id/aria를 못 받아 오류 문구를 직접 alert로 그린다. */}
                  <div className="flex flex-col gap-1.5">
                    <DatePicker
                      label="할인 시작일"
                      value={values.discountStartDate}
                      state={errorState('discountStartDate')}
                      onChange={discountStartDate => update({ discountStartDate })}
                    />
                    {errors['discountStartDate'] && <FieldError>{errors['discountStartDate']}</FieldError>}
                  </div>
                </FieldAnchor>
                <FieldAnchor fieldKey="discountEndDate" tip={tipFor('discountEndDate')}>
                  <div className="flex flex-col gap-1.5">
                    <DatePicker
                      label="할인 종료일"
                      value={values.discountEndDate}
                      min={values.discountStartDate || undefined}
                      state={errorState('discountEndDate')}
                      helperText={errors['discountEndDate'] ? undefined : '비우면 종료일 없이 계속 할인해요'}
                      onChange={discountEndDate => update({ discountEndDate })}
                    />
                    {errors['discountEndDate'] && <FieldError>{errors['discountEndDate']}</FieldError>}
                  </div>
                </FieldAnchor>
              </div>
            )}
          </Section>

          <Section step={4} invalid={invalidSections.has(4)}>
            {IMAGE_FIELDS.map(({ key, label, max }) => (
              <ImageField
                key={key}
                fieldKey={key}
                label={label}
                max={max}
                slots={values[key]}
                error={imageErrors[key] ?? errors[key]}
                tip={tipFor(key)}
                onAdd={files => handleAddImages(key, max, files)}
                onRemove={index => handleRemoveImage(key, index)}
              />
            ))}
            <p className="text-caption text-text-tertiary">JPG/PNG/WEBP / 1장당 최대 10MB</p>
            <Textarea
              label="상세 설명"
              rows={5}
              helperText={autofillHint('description')?.text}
              value={values.description}
              onChange={description => update({ description })}
            />
          </Section>

          <Section step={5} invalid={invalidSections.has(5)}>
            <AutofillHint hint={autofillHint('options')} />
            {productId ? (
              <OptionStockReadOnly productId={productId} />
            ) : (
              <OptionBuilder
                value={values}
                errors={errors}
                tooltipKey={tooltipKey}
                onChange={patch => update(patch)}
              />
            )}
          </Section>

          <Section step={6} invalid={false}>
            {shippingSummary}
          </Section>
        </fieldset>
      </div>
    </div>
  )
}

const OPTION_COLUMNS: Column<SellerOptionCombination>[] = [
  { key: 'name', label: '옵션' },
  {
    key: 'additionalPrice',
    label: '추가 금액',
    align: 'right',
    render: c => <span className="tabular-nums">{c.additionalPrice.toLocaleString()}원</span>,
  },
  {
    key: 'stockQuantity',
    label: '재고',
    align: 'right',
    render: c => <span className="tabular-nums">{c.stockQuantity.toLocaleString()}</span>,
  },
  { key: 'isActive', label: '판매', align: 'center', render: c => (c.isActive ? '판매' : '판매 안 함') },
]

// 수정(PUT)은 옵션/재고를 바꾸지 않는다 — 지금 값만 보여주고 목록의 재고 Drawer로 안내한다.
function OptionStockReadOnly({ productId }: { productId: string }) {
  // 단건 조회가 성공해도 옵션 조회는 따로 실패할 수 있다(남의 상품 403/40007, 조회 불가 셀러
  // 403/40006, 5xx). `loading={!data}`로 두면 재시도가 끝난 뒤에도 표가 영원히 로딩으로 남아
  // "불러오지 못함"이 화면에 드러나지 않는다 — 실패는 실패로 보여 준다.
  const { data, isPending, isError, error } = useProductOptions(productId)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">
        옵션 구성은 수정할 수 없어요. 재고와 옵션별 판매 여부는 상품 목록의 재고 버튼에서 바꿀 수 있어요.
      </p>
      {isError && <FieldError>{productErrorMessage(error)}</FieldError>}
      <DataTable
        columns={OPTION_COLUMNS}
        rows={data?.optionCombinations ?? []}
        rowKey={c => String(c.optionCombinationId)}
        loading={isPending}
        emptyLabel={isError ? '옵션/재고를 불러오지 못했어요.' : '등록된 옵션이 없어요.'}
      />
    </div>
  )
}

function AutofillHint({ hint }: { hint: { filled: boolean; text: string } | null }) {
  if (!hint) return null
  return <p className={`text-caption ${hint.filled ? 'text-text-accent' : 'text-text-tertiary'}`}>{hint.text}</p>
}

function Section({ step, invalid, children }: { step: number; invalid: boolean; children: ReactNode }) {
  return (
    <section id={sectionDomId(step)} className="scroll-mt-24">
      <FormSection title={SECTIONS[step - 1]!} step={step} stepStatus={invalid ? 'todo' : 'done'}>
        {children}
      </FormSection>
    </section>
  )
}

function ImageField({
  fieldKey,
  label,
  max,
  slots,
  error,
  tip,
  onAdd,
  onRemove,
}: {
  fieldKey: ImageFieldKey
  label: string
  max: number
  slots: ImageSlot[]
  error?: string
  tip?: string
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}) {
  const labelId = useId()
  // 추가 버튼은 DS 안에 있어 이름이 {n}/{max}뿐이다 — 그룹 이름과 설명(말풍선, 오류)으로 맥락을 준다.
  const describedBy = tip ? tooltipId(fieldKey) : error ? fieldHelperId(fieldKey) : undefined
  return (
    <FieldAnchor fieldKey={fieldKey} tip={tip}>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className="flex flex-col gap-1.5"
      >
        <div className="flex items-baseline gap-2">
          <span id={labelId} className="text-label font-medium text-text-primary">
            {label}
          </span>
          <span className="text-caption text-text-tertiary">
            {slots.length}/{max}
          </span>
        </div>
        <PhotoUpload photos={slots.map(slot => slot.previewUrl)} max={max} onAdd={onAdd} onRemove={onRemove} />
        {error && <FieldError id={fieldHelperId(fieldKey)}>{error}</FieldError>}
      </div>
    </FieldAnchor>
  )
}
