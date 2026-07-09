import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, Check, CheckCircle2, ChevronRight, Clock, Upload } from 'lucide-react'
import type { SellerApplication, SellerApplicationStatus } from '@aechak/domain'
import { Alert, Button, EmptyState, PageHeader, StatusPill, Toast } from '@aechak/design-system/web'
import type { StatusPillVariant } from '@aechak/design-system/web'
import { DocumentSection, StoreSettingsForm, useResubmitApplication, useSellerApplication } from '@/features/store-settings'

export const Route = createFileRoute('/store-settings/')({
  component: StoreSettingsRoute,
})

function formatAppliedAt(appliedAt: string) {
  const [, month, day] = appliedAt.split('-')
  return `${month}.${day}`
}

const PIPELINE_STEPS = [
  { key: 'applied', label: '신청 접수', icon: Check },
  { key: 'rejected', label: '서류 반려', icon: AlertCircle },
  { key: 'resubmit', label: '재제출', icon: Upload },
  { key: 'approved', label: '최종 승인', icon: Clock },
] as const

function pipelineVariant(key: (typeof PIPELINE_STEPS)[number]['key'], pastResubmission: boolean): StatusPillVariant {
  if (key === 'applied') return 'success'
  if (key === 'rejected') return 'error'
  if (key === 'resubmit') return pastResubmission ? 'success' : 'info'
  return pastResubmission ? 'info' : 'neutral'
}

// rejected/revision-requested는 동일한 "서류 보완 폼" 화면을 그대로 공유한다(캡틴 지시 —
// 이미 구현된 화면은 손대지 않음). pending/reviewing/resubmitted는 전부 "셀러가 할 일이
// 없고 기다리는 중"인 홀딩 뷰 하나로 묶이고, approved는 짧은 안내만 보여주는 최소 처리다
// (2-B 스토어 정보 편집 화면은 여전히 범위 밖).
interface HeaderMeta {
  title: string
  description?: string
  pillVariant: StatusPillVariant
  pillLabel: string
  pillIcon: typeof AlertCircle
}

// rejected/revision-requested는 완전히 같은 화면을 공유하므로 헤더 메타도 같은 객체를 참조한다.
const FORM_HEADER_META: HeaderMeta = {
  title: '스토어 개설 · 서류 보완',
  description: '일부 서류가 반려됐어요. 아래에서 사유를 확인한 뒤 다시 올려 주세요.',
  pillVariant: 'error',
  pillLabel: '서류 반려',
  pillIcon: AlertCircle,
}

const HEADER_META: Record<SellerApplicationStatus, HeaderMeta> = {
  pending: {
    title: '스토어 개설 심사',
    description: '입점 신청이 접수됐어요. 심사가 시작되면 알려드릴게요.',
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
  resubmitted: {
    title: '스토어 개설 심사',
    description: '재제출한 서류를 다시 확인하고 있어요.',
    pillVariant: 'info',
    pillLabel: '재제출 완료',
    pillIcon: Upload,
  },
  rejected: FORM_HEADER_META,
  'revision-requested': FORM_HEADER_META,
  approved: {
    title: '스토어 설정',
    pillVariant: 'success',
    pillLabel: '승인 완료',
    pillIcon: CheckCircle2,
  },
}

function holdingCopy(status: SellerApplicationStatus): { title: string; description: string } {
  switch (status) {
    case 'pending':
      return {
        title: '심사 대기 중이에요',
        description: '제출해주신 서류를 곧 확인할 예정이에요. 1~2영업일 안에 심사 결과를 알림으로 보내드릴게요.',
      }
    case 'reviewing':
      return {
        title: '심사 중이에요',
        description: '제출해주신 서류를 꼼꼼히 확인하고 있어요. 1~2영업일 안에 심사 결과를 알림으로 보내드릴게요.',
      }
    default:
      return {
        title: '재제출한 서류를 심사하고 있어요',
        description: '다시 제출해주신 서류를 확인하고 있어요. 1~2영업일 안에 심사 결과를 알림으로 보내드릴게요.',
      }
  }
}

function StoreSettingsRoute() {
  const { data, isLoading } = useSellerApplication()
  const [form, setForm] = useState<SellerApplication | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const resubmitApplication = useResubmitApplication()

  useEffect(() => {
    if (data && !form) setForm(data)
  }, [data, form])

  function handleChange(patch: Partial<SellerApplication>) {
    setForm(prev => (prev ? { ...prev, ...patch } : prev))
  }

  function handleDocumentUpload(key: string) {
    setForm(prev =>
      prev
        ? {
            ...prev,
            documents: prev.documents.map(doc => (doc.key === key ? { ...doc, status: 'submitted' } : doc)),
          }
        : prev,
    )
  }

  function handleResubmit() {
    if (!form) return
    resubmitApplication.mutate(form, {
      onSuccess: updated => {
        setForm(updated)
        setToastMessage('재제출했어요.')
      },
    })
  }

  if (isLoading || !form) {
    return <div className="p-6" />
  }

  const isApproved = form.status === 'approved'
  const isHolding = form.status === 'pending' || form.status === 'reviewing' || form.status === 'resubmitted'
  const pastResubmission = form.status !== 'rejected' && form.status !== 'revision-requested'
  const hasPendingRequiredDocument = form.documents.some(
    doc => doc.required && doc.status === 'resubmission-required',
  )
  const notice = isHolding
    ? { icon: <Clock className="size-6" />, ...holdingCopy(form.status) }
    : isApproved
      ? {
          icon: <CheckCircle2 className="size-6" />,
          title: '입점 신청이 승인됐어요',
          description: '스토어 정보를 설정하는 화면은 곧 제공될 예정이에요.',
        }
      : null
  const headerMeta = HEADER_META[form.status]
  const HeaderIcon = headerMeta.pillIcon

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

      {!isApproved && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3.5">
          <div className="flex items-center gap-2">
            {PIPELINE_STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <StatusPill variant={pipelineVariant(step.key, pastResubmission)}>
                    <Icon className="size-3" />
                    {step.label}
                  </StatusPill>
                  {index < PIPELINE_STEPS.length - 1 && <ChevronRight className="size-3.5 text-icon-muted" />}
                </div>
              )
            })}
          </div>
          <span className="flex-none text-caption text-text-tertiary">
            신청일 {formatAppliedAt(form.appliedAt)} · 평균 심사 1~2영업일
          </span>
        </div>
      )}

      {notice && <EmptyState icon={notice.icon} title={notice.title} description={notice.description} />}

      {!isHolding && !isApproved && (
        <>
          {form.rejectionReason && (
            <Alert variant="error" title={`반려 사유 · ${form.rejectionReason}`} className="mb-4">
              {form.revisionNote}
            </Alert>
          )}

          <StoreSettingsForm value={form} onChange={handleChange} />

          <div className="mt-5">
            <DocumentSection documents={form.documents} onUpload={handleDocumentUpload} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
              <Clock className="size-3.5" />
              재제출하면 1~2영업일 안에 심사 결과를 알림으로 보내드려요.
            </span>
            <Button onClick={handleResubmit} loading={resubmitApplication.isPending} disabled={hasPendingRequiredDocument}>
              재제출하기
            </Button>
          </div>
        </>
      )}

      {toastMessage && <Toast open onClose={() => setToastMessage(null)} message={toastMessage} variant="success" />}
    </div>
  )
}
