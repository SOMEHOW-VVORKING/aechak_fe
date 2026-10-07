import { ChevronRight } from 'lucide-react'
import { Drawer, ListItem } from '@aechak/design-system/web'
import type { ProductDraftSummary } from '../products.contract'

interface DraftListDrawerProps {
  open: boolean
  drafts: ProductDraftSummary[]
  onClose: () => void
  onSelect: (draftId: string) => void
}

// savedAt은 BE LocalDateTime 관례(오프셋 없는 KST)라 Date로 바꾸지 않고 자리만 맞춘다.
const formatSavedAt = (localDateTime: string) => localDateTime.slice(0, 16).replace('T', ' ').replaceAll('-', '.')

export function DraftListDrawer({ open, drafts, onClose, onSelect }: DraftListDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="임시저장한 상품" width="md">
      <div className="flex flex-col divide-y divide-border-subtle">
        {drafts.map(draft => (
          <ListItem
            key={draft.productId}
            title={draft.productName || '이름 없는 상품'}
            subtitle={`${formatSavedAt(draft.savedAt)} 저장`}
            trailing={<ChevronRight className="size-4" />}
            onClick={() => onSelect(draft.productId)}
          />
        ))}
      </div>
    </Drawer>
  )
}
