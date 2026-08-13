import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button, StatusPill } from '@aechak/design-system/web'
import type { StatusPillVariant } from '@aechak/design-system/web'

export interface DocumentRowModel {
  /** BE SellerDocumentType 값. */
  type: string
  label: string
  required: boolean
  /** 서버에 이미 등록된 시각(있으면 제출 완료). */
  uploadedAt?: string
  /** 이번 저장에 실릴 새 파일 이름(선택만 하고 아직 저장 안 함). */
  pendingFileName?: string
}

interface DocumentRowProps {
  document: DocumentRowModel
  onSelect: (type: string, file: File) => void
}

// 서류 한 줄 — 라벨 + 상태 pill + 파일 선택. PDF까지 받아야 해서 이미지 썸네일 그리드
// (PhotoUpload) 대신 숨김 file input을 쓴다. 파일은 여기서 올리지 않고 저장 시점에
// presigned 업로드된다(선택 = '첨부됨', 저장 = 서버 등록).
export function DocumentRow({ document, onSelect }: DocumentRowProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const state: { label: string; variant: StatusPillVariant } = document.pendingFileName
    ? { label: '첨부됨 (저장 전)', variant: 'info' }
    : document.uploadedAt
      ? { label: '제출 완료', variant: 'success' }
      : { label: '미제출', variant: document.required ? 'error' : 'neutral' }

  const hasFile = Boolean(document.pendingFileName || document.uploadedAt)

  return (
    <div className="border-b border-border-subtle py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span
          className={
            !hasFile && document.required
              ? 'text-body-sm font-semibold text-error-fg'
              : 'text-body-sm text-text-primary'
          }
        >
          {document.label}
          {document.required && <span className="text-error-fg"> *</span>}
          {document.pendingFileName && (
            <span className="text-caption text-text-tertiary"> · {document.pendingFileName}</span>
          )}
        </span>
        <div className="flex items-center gap-2.5">
          <StatusPill variant={state.variant}>{state.label}</StatusPill>
          <Button
            variant={!hasFile && document.required ? 'primary' : 'secondary'}
            size="sm"
            leftIcon={!hasFile ? <Upload className="size-3.5" /> : undefined}
            onClick={() => fileRef.current?.click()}
          >
            {hasFile ? '교체' : '업로드'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            aria-label={`${document.label} 파일 선택`}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) onSelect(document.type, file)
              // 같은 파일을 다시 골라도 change가 발화하도록 입력을 비운다.
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
