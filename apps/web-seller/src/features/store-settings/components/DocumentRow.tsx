import { useState } from 'react'
import { Upload } from 'lucide-react'
import type { SellerApplicationDocument } from '@aechak/domain'
import { Button, PhotoUpload, StatusPill } from '@aechak/design-system/web'
import { DOCUMENT_STATUS_META } from '../store-settings.queries'

interface DocumentRowProps {
  document: SellerApplicationDocument
  onUpload: (key: string) => void
}

export function DocumentRow({ document, onUpload }: DocumentRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const status = document.status ?? 'not-applicable'
  const meta = DOCUMENT_STATUS_META[status]
  const needsResubmission = status === 'resubmission-required'

  function handleAdd(files: File[]) {
    const [file] = files
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setExpanded(false)
    onUpload(document.key)
  }

  return (
    <div className="border-b border-border-subtle py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className={needsResubmission ? 'text-body-sm font-semibold text-error-fg' : 'text-body-sm text-text-primary'}>
          {document.label}
          {document.required && <span className="text-error-fg"> *</span>}
          {document.note && <span className="text-caption text-text-tertiary"> · {document.note}</span>}
        </span>
        <div className="flex items-center gap-2.5">
          <StatusPill variant={meta.variant}>{meta.label}</StatusPill>
          {status !== 'not-applicable' && (
            <Button
              variant={needsResubmission ? 'primary' : 'secondary'}
              size="sm"
              leftIcon={needsResubmission ? <Upload className="size-3.5" /> : undefined}
              onClick={() => setExpanded(v => !v)}
            >
              {needsResubmission ? '업로드' : '교체'}
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-2.5">
          <PhotoUpload photos={preview ? [preview] : []} onAdd={handleAdd} onRemove={() => setPreview(null)} max={1} />
        </div>
      )}
    </div>
  )
}
