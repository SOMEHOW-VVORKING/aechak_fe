import { FormSection } from '@aechak/design-system/web'
import { DocumentRow, type DocumentRowModel } from './DocumentRow'

interface DocumentSectionProps {
  documents: DocumentRowModel[]
  onSelect: (type: string, file: File) => void
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
      {errorMessage && (
        <p role="alert" className="text-caption text-error-fg">
          {errorMessage}
        </p>
      )}
    </FormSection>
  )
}
