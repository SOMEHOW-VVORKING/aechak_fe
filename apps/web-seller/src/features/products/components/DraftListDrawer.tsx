import { ChevronRight, FileText, Trash2 } from 'lucide-react'
import { Alert, Button, Drawer, EmptyState, ListItem } from '@aechak/design-system/web'
import type { ProductDraftSummary } from '../products.contract'

interface DraftListDrawerProps {
  open: boolean
  drafts: ProductDraftSummary[]
  /** 목록 조회가 실패했을 때 띄울 문구. 성공이면 null. */
  loadError?: string | null
  /** 조회 실패를 되돌릴 유일한 길 — 실패했는데 다시 읽을 버튼이 없으면 셀러는 초안을 포기한다. */
  onRetry?: () => void
  /** 삭제 중이거나 목록이 낡아 삭제를 맡길 수 없는 동안 켠다. 이어쓰기는 잠그지 않는다. */
  deleteDisabled?: boolean
  onClose: () => void
  onSelect: (draftId: string) => void
  /**
   * 삭제는 되돌릴 수 없어 확인 한 단계를 거친다. 그 확인 Modal은 **라우트가 소유한다**(AGENTS 4절
   * 확인 Modal 패턴). Drawer 안에 중첩하면 두 컴포넌트가 document에 포커스 트랩과 Escape 핸들러를
   * 각각 걸어, 확인창에서 Tab이 뒤쪽 Drawer로 빠지고 Escape 한 번이 둘을 함께 닫는다.
   */
  onRequestDelete: (draft: ProductDraftSummary) => void
}

// savedAt은 BE LocalDateTime 관례(오프셋 없는 KST)라 Date로 바꾸지 않고 자리만 맞춘다.
const formatSavedAt = (localDateTime: string) => localDateTime.slice(0, 16).replace('T', ' ').replaceAll('-', '.')

/** 상품명을 아직 안 적은 초안도 빈 줄이 되지 않게 — 목록과 확인 문구가 같은 이름을 써야 한다. */
export const draftLabel = (draft: ProductDraftSummary) => draft.productName || '이름 없는 상품'

export function DraftListDrawer({
  open,
  drafts,
  loadError = null,
  deleteDisabled = false,
  onClose,
  onRetry,
  onSelect,
  onRequestDelete,
}: DraftListDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="임시저장한 상품" width="lg">
      {loadError && (
        <div className="mb-3 flex flex-col gap-2">
          <Alert variant="error">{loadError}</Alert>
          {onRetry && (
            <Button variant="secondary" size="sm" className="self-start" onClick={onRetry}>
              다시 시도
            </Button>
          )}
        </div>
      )}
      {drafts.length === 0 && !loadError ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="임시저장한 상품이 없어요"
          description="상품 등록 화면에서 '임시저장'을 누르면 여기에 쌓여요. 최대 10개까지 보관해요."
        />
      ) : (
        <div className="flex flex-col divide-y divide-border-subtle">
          {drafts.map(draft => (
            <ListItem
              key={draft.draftId}
              title={draftLabel(draft)}
              subtitle={`${formatSavedAt(draft.savedAt)} 저장`}
              trailing={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${draftLabel(draft)} 임시저장 삭제`}
                    disabled={deleteDisabled}
                    onClick={() => onRequestDelete(draft)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  {/* 이어쓰기는 읽기로 가는 길이라 목록이 낡아도 막지 않는다 — 초안이 이미 없으면
                      등록 화면이 스스로 조회해 '찾을 수 없어요'로 안내한다(AGENTS 6절 7항). */}
                  <Button
                    variant="secondary"
                    size="sm"
                    rightIcon={<ChevronRight className="size-4" />}
                    onClick={() => onSelect(draft.draftId)}
                  >
                    이어쓰기
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}
    </Drawer>
  )
}
