import type { SellerDocumentType } from '@aechak/api'
import { FormSection } from '@aechak/design-system/web'
import { FieldError } from '@/shared/components/Field'
import { DocumentRow, type DocumentRowModel } from './DocumentRow'

interface DocumentSectionProps {
  documents: DocumentRowModel[]
  onSelect: (type: SellerDocumentType, file: File) => void
  step: number
  /** 파일 형식/크기 가드 실패 안내. */
  errorMessage?: string | null
}

export function DocumentSection({ documents, onSelect, step, errorMessage }: DocumentSectionProps) {
  return (
    <FormSection title="서류 제출" step={step} stepStatus="todo">
      <div className="flex flex-col">
        {documents.map(document => (
          <DocumentRow key={document.type} document={document} onSelect={onSelect} />
        ))}
      </div>
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </FormSection>
  )
}
