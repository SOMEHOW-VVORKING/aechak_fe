import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileEdit,
  Upload,
} from 'lucide-react'
import type { SellerApplicationStatus } from '@aechak/domain'
import type { SellerDocumentType } from '@aechak/api'
import { Alert, Button, EmptyState, PageHeader, Skeleton, StatusPill } from '@aechak/design-system/web'
import type { StatusPillVariant } from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
import {
  DOCUMENT_LABEL,
  DocumentSection,
  REQUIRED_DOCUMENTS,
  StoreProfileSection,
  StoreSettingsForm,
  emptyFormValue,
  formValueFrom,
  isSupportedDocument,
  isValidBusinessRegNo,
  isWithinDocumentSizeLimit,
  missingDocuments,
  OVERSIZED_DOCUMENT_MESSAGE,
  sellerApplicationErrorMessage,
  UNSUPPORTED_DOCUMENT_MESSAGE,
  uploadSellerDocument,
  useSaveDraft,
  useSellerApplication,
  useSubmitApplication,
  type DocumentRowModel,
  type SellerApplicationFormValue,
} from '@/features/store-settings'

export const Route = createFileRoute('/store-settings/')({
  component: StoreSettingsRoute,
})

function formatAppliedAt(appliedAt: string) {
  // BE LocalDateTime('2026-08-13T14:32:10')에서 MM.DD만 뽑는다.
  const [, month, day] = appliedAt.slice(0, 10).split('-')
  return month && day ? `${month}.${day}` : appliedAt
}

// 작성 → 제출 → 심사 → 승인. 반려는 심사 단계의 부정 결과로 표기한다(BE 상태머신 1:1 —
// 재제출은 별도 단계가 아니라 REJECTED → 저장(자동 DRAFT 재개) → 재제출 전이).
const PIPELINE_STEPS = [
  { key: 'write', label: '신청 작성', icon: FileEdit },
  { key: 'submit', label: '제출', icon: Upload },
  { key: 'review', label: '심사', icon: Clock },
  { key: 'approve', label: '최종 승인', icon: Check },
] as const

type PipelineStepKey = (typeof PIPELINE_STEPS)[number]['key']
type ScreenStatus = SellerApplicationStatus | 'none'

function pipelineVariant(key: PipelineStepKey, status: ScreenStatus): StatusPillVariant {
  const reached: Record<PipelineStepKey, ScreenStatus[]> = {
    write: [],
    submit: ['none', 'draft', 'rejected'],
    review: ['submitted'],
    approve: ['reviewing'],
  }
  void reached
  switch (key) {
    case 'write':
      return status === 'none' || status === 'draft' || status === 'rejected' ? 'info' : 'success'
    case 'submit':
      return status === 'none' || status === 'draft' || status === 'rejected' ? 'neutral' : 'success'
    case 'review':
      if (status === 'rejected') return 'error'
      if (status === 'submitted' || status === 'reviewing') return 'info'
      return status === 'approved' ? 'success' : 'neutral'
    case 'approve':
      return status === 'approved' ? 'success' : 'neutral'
  }
}

interface HeaderMeta {
  title: string
  description?: string
  pillVariant: StatusPillVariant
  pillLabel: string
  pillIcon: typeof AlertCircle
}

const HEADER_META: Record<ScreenStatus, HeaderMeta> = {
  none: {
    title: '스토어 개설 신청',
    description: '입점 정보를 입력하고 서류를 제출해 주세요. 임시저장 후 이어서 작성할 수 있어요.',
    pillVariant: 'neutral',
    pillLabel: '작성 전',
    pillIcon: FileEdit,
  },
  draft: {
    title: '스토어 개설 신청',
    description: '작성 중인 신청서예요. 제출까지 완료해야 심사가 시작돼요.',
    pillVariant: 'neutral',
    pillLabel: '작성 중',
    pillIcon: FileEdit,
  },
  submitted: {
    title: '스토어 개설 심사',
    description: '입점 신청이 접수됐어요. 심사가 시작되면 이 화면의 상태가 바뀌어요.',
    pillVariant: 'neutral',
    pillLabel: '심사 대기',
    pillIcon: Clock,
  },
  reviewing: {
    title: '스토어 개설 심사',
    description: '제출하신 서류를 확인하고 있어요.',
    pillVariant: 'info',
    pillLabel: '심사 중',
    pillIcon: Clock,
  },
  rejected: {
    title: '스토어 개설 · 서류 보완',
    description: '신청이 반려됐어요. 아래에서 사유를 확인하고 수정한 뒤 다시 제출해 주세요.',
    pillVariant: 'error',
    pillLabel: '반려',
    pillIcon: AlertCircle,
  },
  approved: {
    title: '스토어 설정',
    pillVariant: 'success',
    pillLabel: '승인 완료',
    pillIcon: CheckCircle2,
  },
  cancelled: {
    title: '스토어 개설 신청',
    description: '취소된 신청이에요.',
    pillVariant: 'muted',
    pillLabel: '신청 취소',
    pillIcon: Ban,
  },
}

function StoreSettingsRoute() {
  const { application, isLoading, isError, refetch } = useSellerApplication()
  const saveDraft = useSaveDraft()
  const submitApplication = useSubmitApplication()

  const [form, setForm] = useState<SellerApplicationFormValue | null>(null)
  const [pendingDocs, setPendingDocs] = useState<Partial<Record<SellerDocumentType, File>>>({})
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const toast = useToast()
  const seededRef = useRef(false)

  // 서버 값(또는 '신청 없음' = 빈 폼)으로 한 번만 시드 — 저장 성공으로 캐시가 갱신돼도
  // 재시딩하지 않아 입력을 보존한다(shipping-policy 폼 관례의 !form 가드와 동일 목적).
  useEffect(() => {
    if (application !== undefined && !seededRef.current) {
      seededRef.current = true
      setForm(application ? formValueFrom(application) : emptyFormValue())
    }
  }, [application])

  const status: ScreenStatus = application === null || application === undefined ? 'none' : application.status
  const isFormStage = status === 'none' || status === 'draft' || status === 'rejected'

  function handleChange(patch: Partial<SellerApplicationFormValue>) {
    setForm(prev => (prev ? { ...prev, ...patch } : prev))
    setActionError(null)
  }

  function handleDocumentSelect(type: SellerDocumentType, file: File) {
    if (!isSupportedDocument(file)) {
      setDocumentError(UNSUPPORTED_DOCUMENT_MESSAGE)
      return
    }
    if (!isWithinDocumentSizeLimit(file)) {
      setDocumentError(OVERSIZED_DOCUMENT_MESSAGE)
      return
    }
    setDocumentError(null)
    setPendingDocs(prev => ({ ...prev, [type]: file }))
  }

  // 저장 전 로컬 가드. 계좌번호는 응답이 마스킹뿐 + 저장이 전체 덮어쓰기라, 서버에 저장된
  // 계좌가 있는데 폼이 비어 있으면 조용히 소거된다 — 재입력을 요구해 사고를 막는다.
  function validateBeforeSave(current: SellerApplicationFormValue): string | null {
    if (application?.accountNumberMasked && current.accountNumber.trim() === '') {
      return '보안을 위해 계좌번호는 저장할 때마다 다시 입력해야 해요.'
    }
    if (current.businessRegNo.trim() !== '' && !isValidBusinessRegNo(current.businessRegNo)) {
      return '사업자등록번호 형식이 올바르지 않아요.'
    }
    return null
  }

  // 선택된 서류를 presigned로 올리고 임시저장 documents 페이로드를 만든다(저장 직전 업로드 —
  // presigned URL 유효시간 10분 안에서 항상 신선한 키를 쓴다).
  async function uploadPendingDocuments() {
    const entries = Object.entries(pendingDocs) as [SellerDocumentType, File][]
    const uploaded: { documentType: SellerDocumentType; tmpKey: string }[] = []
    for (const [documentType, file] of entries) {
      uploaded.push({ documentType, tmpKey: await uploadSellerDocument(file) })
    }
    return uploaded
  }

  async function performSave(onSaved?: () => void) {
    if (!form) return
    const guardMessage = validateBeforeSave(form)
    if (guardMessage) {
      setActionError(guardMessage)
      return
    }
    setActionError(null)
    let documents: { documentType: SellerDocumentType; tmpKey: string }[]
    setIsUploading(true)
    try {
      documents = await uploadPendingDocuments()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '서류 업로드에 실패했어요.')
      return
    } finally {
      setIsUploading(false)
    }
    saveDraft.mutate(
      { form, documents },
      {
        onSuccess: () => {
          setPendingDocs({})
          if (onSaved) onSaved()
          else toast.show('저장했어요.')
        },
        onError: error => setActionError(sellerApplicationErrorMessage(error)),
      },
    )
  }

  // 제출 = 최신 폼 저장(반려 상태면 서버가 자동으로 DRAFT 재개) → submit. 저장 없이 바로
  // 제출하면 반려 상태에서 10101이 나는 BE 전이 규칙을 그대로 따른 체인이다.
  function handleSubmit() {
    void performSave(() => {
      submitApplication.mutate({
        onSuccess: () => toast.show('제출했어요. 심사 결과는 이 화면에서 확인할 수 있어요.'),
        onError: error => setActionError(sellerApplicationErrorMessage(error)),
      })
    })
  }

  if (isLoading || (!isError && application === undefined)) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton variant="rect" className="h-10 w-64" />
        <Skeleton variant="rect" className="h-40" />
      </div>
    )
  }

  // 읽은 적이 없을 때만 화면 전체를 실패로 바꾼다. 캐시가 있는데(재조회 실패) 전체를 갈면
  // 작성 중인 입력이 사라진다 — 신청 정보는 staleTime 60초라 창 포커스 한 번으로 재조회가
  // 돌고, 그 조회만 실패해도 승인 뒤 스토어 폼까지 언마운트돼 다시 서버 값으로 시드된다.
  if (isError && application === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title="신청 정보를 불러오지 못했어요"
          description="잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      </div>
    )
  }

  if (!form) return <div className="p-6" />

  const headerMeta = HEADER_META[status]
  const HeaderIcon = headerMeta.pillIcon
  const isBusy = isUploading || saveDraft.isPending || submitApplication.isPending

  // 서류 행 = 현재 셀러 유형의 필수 세트(+이미 서버에 있는 비필수 서류). 유형이 바뀌어도
  // 올린 서류는 서버에 유지되고 제출 시점 유형 기준으로 재평가된다(BE 계약).
  const uploadedByType = new Map((application?.documents ?? []).map(doc => [doc.key, doc]))
  const requiredTypes = REQUIRED_DOCUMENTS[form.legalType]
  const extraUploaded = [...uploadedByType.keys()].filter(type => !requiredTypes.includes(type))
  const documentRows: DocumentRowModel[] = [
    ...requiredTypes.map(type => ({
      type,
      label: DOCUMENT_LABEL[type],
      required: true,
      uploadedAt: uploadedByType.get(type)?.uploadedAt,
      pendingFileName: pendingDocs[type]?.name,
    })),
    ...extraUploaded.map(type => ({
      type,
      label: uploadedByType.get(type)?.label ?? type,
      required: false,
      uploadedAt: uploadedByType.get(type)?.uploadedAt,
      pendingFileName: pendingDocs[type]?.name,
    })),
  ]

  const providedTypes = new Set<string>([...uploadedByType.keys(), ...Object.keys(pendingDocs)])
  // 필수 정보 부족은 서버가 10105로 알려 준다 — 서류만 미리 막는다(b14-st-3 §8).
  const missing = missingDocuments(form.legalType, providedTypes)

  const holdingNotice =
    status === 'submitted' || status === 'reviewing'
      ? {
          icon: <Clock className="size-6" />,
          title: status === 'submitted' ? '심사 대기 중이에요' : '심사 중이에요',
          description:
            '제출해주신 서류를 확인하고 있어요. 보통 1~2영업일 걸려요. 따로 알림이 가지 않으니 이 화면에서 결과를 확인해 주세요.',
        }
      : status === 'cancelled'
        ? {
            icon: <Ban className="size-6" />,
            title: '취소된 신청이에요',
            description: '새로 입점을 원하시면 고객센터로 문의해 주세요.',
          }
        : null

  return (
    <div className="p-6">
      <PageHeader
        title={headerMeta.title}
        actions={
          <StatusPill variant={headerMeta.pillVariant}>
            <HeaderIcon className="size-3.5" />
            {headerMeta.pillLabel}
          </StatusPill>
        }
      />
      {headerMeta.description && (
        <p className="-mt-4 mb-4 text-body-sm text-text-tertiary">{headerMeta.description}</p>
      )}

      {/* 재조회 실패 — 화면은 그대로 두고 값이 마지막으로 읽은 것임을 밝힌다. */}
      {isError && (
        <Alert variant="warning" className="mb-4">
          <span>
            최신 신청 정보를 불러오지 못했어요. 마지막으로 불러온 정보와 작성 중인 입력은 그대로
            두었어요.{' '}
            <button
              type="button"
              onClick={() => void refetch()}
              className="underline underline-offset-2"
            >
              다시 시도
            </button>
          </span>
        </Alert>
      )}

      {status !== 'approved' && status !== 'cancelled' && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3.5">
          <div className="flex items-center gap-2">
            {PIPELINE_STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <StatusPill variant={pipelineVariant(step.key, status)}>
                    <Icon className="size-3" />
                    {step.key === 'review' && status === 'rejected' ? '심사 반려' : step.label}
                  </StatusPill>
                  {index < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className="size-3.5 text-icon-muted" />
                  )}
                </div>
              )
            })}
          </div>
          <span className="flex-none text-caption text-text-tertiary">
            {application ? `신청일 ${formatAppliedAt(application.appliedAt)} · ` : ''}평균 심사 1~2영업일
          </span>
        </div>
      )}

      {holdingNotice && (
        <EmptyState
          icon={holdingNotice.icon}
          title={holdingNotice.title}
          description={holdingNotice.description}
        />
      )}

      {/* 승인 뒤에는 같은 화면이 스토어 운영 설정이 된다(GET·PUT /sellers/me/store).
          조회·저장을 이 섹션이 소유하므로 라우트는 신청 단계만 들고 있는다. */}
      {status === 'approved' && <StoreProfileSection />}

      {isFormStage && (
        <>
          {status === 'rejected' && application?.rejectionReason && (
            <Alert variant="error" title="반려 사유" className="mb-4">
              {application.rejectionReason}
            </Alert>
          )}

          {actionError && (
            <Alert variant="error" className="mb-4" onDismiss={() => setActionError(null)}>
              {actionError}
            </Alert>
          )}

          <StoreSettingsForm
            value={form}
            onChange={handleChange}
            accountNumberMasked={application?.accountNumberMasked}
          />

          <div className="mt-5">
            <DocumentSection
              documents={documentRows}
              onSelect={handleDocumentSelect}
              step={form.legalType === 'individual' ? 3 : 4}
              errorMessage={documentError}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
              {missing.length > 0 ? (
                <>
                  <AlertCircle className="size-3.5" />
                  제출 전 필요: {missing.join(', ')}
                </>
              ) : (
                <>
                  <Clock className="size-3.5" />
                  제출하면 보통 1~2영업일 안에 결과가 이 화면에 표시돼요.
                </>
              )}
            </span>
            <div className="flex flex-none items-center gap-2">
              <Button variant="secondary" onClick={() => void performSave()} loading={isBusy}>
                임시저장
              </Button>
              <Button onClick={handleSubmit} loading={isBusy} disabled={missing.length > 0}>
                {status === 'rejected' ? '재제출하기' : '제출하기'}
              </Button>
            </div>
          </div>
        </>
      )}

      {toast.element}
    </div>
  )
}
