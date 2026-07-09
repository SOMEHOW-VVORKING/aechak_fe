import type { SellerApplicationDocument } from '@aechak/domain'
import { FormSection } from '@aechak/design-system/web'
import { DocumentRow } from './DocumentRow'

interface DocumentSectionProps {
  documents: SellerApplicationDocument[]
  onUpload: (key: string) => void
}

export function DocumentSection({ documents, onUpload }: DocumentSectionProps) {
  return (
    <FormSection title="서류 제출" step={4} stepStatus="todo">
      <div className="flex flex-col">
        {documents.map(document => (
          <DocumentRow key={document.key} document={document} onUpload={onUpload} />
        ))}
      </div>
    </FormSection>
  )
}
