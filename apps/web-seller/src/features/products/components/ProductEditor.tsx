import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Check } from 'lucide-react'
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
  Toast,
  Toggle,
  type Column,
} from '@aechak/design-system/web'
import {
  discountRate,
  fieldDomId,
  MAX_ADDITIONAL_IMAGES,
  MAX_DETAIL_IMAGES,
  MAX_REGULAR_PRICE,
  MIN_REGULAR_PRICE,
  PRODUCT_IMAGE_TYPES,
  validateProductForm,
  type CategoryNode,
  type ImageSlot,
  type ProductFormValues,
  type SellerOptionCombination,
} from '../products.contract'
import { mockUploadProductImage } from '../products.mock'
import { useProductOptions } from '../products.queries'
import { FieldAnchor, FieldError, fieldA11y, fieldHelperId, tooltipId } from './FieldAnchor'
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

// BE presign은 크기 제한이 없다 — 10MB는 FE UX 정책(store-settings.upload와 같은 값).
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const SECTIONS = ['기본 정보', '카테고리', '가격/할인', '이미지/상세', '옵션/재고', '배송 정책']

function sectionOf(key: string): number {
  if (key === 'productName') return 1
  if (key === 'categoryId') return 2
  if (key === 'regularPrice' || key.startsWith('discount')) return 3
  if (key === 'thumbnail') return 4
  return 5
}

const sectionDomId = (step: number) => `product-section-${step}`
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
  const [uploadFailed, setUploadFailed] = useState(false)

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
  const errorState = (key: string) => (errors[key] ? 'error' : 'default') as 'error' | 'default'

  function update(patch: Partial<ProductFormValues>) {
    setValues(prev => ({ ...prev, ...patch }))
    setTooltipKey(null)
  }

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
  const showRate =
    values.regularPrice !== '' &&
    values.discountPrice !== '' &&
    regular >= MIN_REGULAR_PRICE &&
    regular <= MAX_REGULAR_PRICE &&
    discount <= regular

  function handleAddImages(field: ImageFieldKey, max: number, files: File[]) {
    let message: string | undefined
    const accepted = files.filter(file => {
      if (!PRODUCT_IMAGE_TYPES.includes(file.type)) message ??= 'JPG/PNG/WEBP 이미지만 올릴 수 있어요'
      else if (file.size > MAX_IMAGE_BYTES) message ??= '이미지는 1장당 10MB까지 올릴 수 있어요'
      else return true
      return false
    })
    const room = max - values[field].length
    if (accepted.length > room) message ??= `최대 ${max}장까지 올릴 수 있어요`
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
    const pending = IMAGE_FIELDS.flatMap(({ key }) => v[key].filter(slot => slot.file && !slot.imageKey))
    if (pending.length === 0) return v
    setUploading(true)
    try {
      // 일부만 실패해도 성공한 키는 슬롯에 남겨 재시도 때 다시 올리지 않는다.
      const results = await Promise.allSettled(pending.map(slot => mockUploadProductImage(slot.file!)))
      const keyById = new Map<string, string>()
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') keyById.set(pending[i]!.id, result.value)
      })
      const withKeys = (slots: ImageSlot[]) =>
        slots.map(slot => (keyById.has(slot.id) ? { ...slot, imageKey: keyById.get(slot.id)! } : slot))
      setValues(prev => ({
        ...prev,
        thumbnail: withKeys(prev.thumbnail),
        additionalImages: withKeys(prev.additionalImages),
        detailImages: withKeys(prev.detailImages),
      }))
      if (keyById.size < pending.length) {
        setUploadFailed(true)
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
              value={values.description}
              onChange={description => update({ description })}
            />
          </Section>

          <Section step={5} invalid={invalidSections.has(5)}>
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

      {uploadFailed && (
        <Toast
          open
          variant="error"
          message="이미지를 올리지 못했어요. 다시 시도해 주세요."
          onClose={() => setUploadFailed(false)}
        />
      )}
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
  const { data } = useProductOptions(productId)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">
        옵션 구성은 수정할 수 없어요. 재고와 옵션별 판매 여부는 상품 목록의 재고 버튼에서 바꿀 수 있어요.
      </p>
      <DataTable
        columns={OPTION_COLUMNS}
        rows={data?.optionCombinations ?? []}
        rowKey={c => String(c.optionCombinationId)}
        loading={!data}
      />
    </div>
  )
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
