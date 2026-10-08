import { useState } from 'react'
import { Button, Drawer, Input, Toggle } from '@aechak/design-system/web'
import { productErrorMessage } from '../products.contract'
import { useChangeOptionCombination, useProductOptions } from '../products.queries'

interface InventoryDrawerProps {
  productId: string | null
  onClose: () => void
  onSaved: (message: string) => void
}

// 옵션 조합별 재고/판매 여부를 행마다 PATCH 한 번으로 고친다. BE는 재고를 증감(stockDelta)으로만 받아서
// 셀러가 적은 목표 재고와 지금 재고의 차이를 보낸다. 저장 후에도 열어 두고, 접두 무효화가 이 Drawer와
// 목록 행(재고/판매 상태)을 함께 갱신한다.
export function InventoryDrawer({ productId, onClose, onSaved }: InventoryDrawerProps) {
  const { data } = useProductOptions(productId)
  const change = useChangeOptionCombination()
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const pendingId = change.isPending ? change.variables.combinationId : null

  function setRowError(id: number, message: string | undefined) {
    setRowErrors(prev => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })
  }

  function handleChange(id: number, value: string) {
    setEdits(prev => ({ ...prev, [id]: value.replace(/\D/g, '') }))
    setRowError(id, undefined)
  }

  function handleSaveStock(id: number, current: number) {
    if (!productId) return
    const target = Number(edits[id])
    // 증감 한도(±1,000,000)는 BE가 90001로 거절하고 onError가 행 오류로 띄운다.
    change.mutate(
      { productId, combinationId: id, body: { stockDelta: target - current } },
      {
        onSuccess: res => {
          setEdits(prev => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          // 증감 사이에 주문 등으로 재고가 바뀌었으면 목표와 다르게 저장된다(0 미만은 0으로 잘림).
          onSaved(
            res.stockQuantity === target
              ? '재고를 저장했어요.'
              : `그사이 재고가 바뀌어 ${res.stockQuantity.toLocaleString()}개로 저장했어요.`,
          )
        },
        onError: error => setRowError(id, productErrorMessage(error)),
      },
    )
  }

  function handleToggleActive(id: number, isActive: boolean) {
    if (!productId) return
    change.mutate(
      { productId, combinationId: id, body: { isActive } },
      {
        onSuccess: () => onSaved(isActive ? '옵션 판매를 켰어요.' : '옵션 판매를 껐어요.'),
        onError: error => setRowError(id, productErrorMessage(error)),
      },
    )
  }

  return (
    <Drawer open={productId !== null} onClose={onClose} title="옵션별 재고" width="lg">
      {data && (
        <div className="flex flex-col gap-4">
          {data.optionCombinations.map(c => {
            const id = c.optionCombinationId
            const value = edits[id] ?? String(c.stockQuantity)
            const changed = edits[id] !== undefined && edits[id] !== '' && Number(edits[id]) !== c.stockQuantity
            const busy = pendingId !== null
            return (
              <div key={id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1 pt-2">
                  <p className="truncate text-body-sm font-medium text-text-primary">{c.name}</p>
                  {c.additionalPrice > 0 && (
                    <p className="text-caption text-text-tertiary">+{c.additionalPrice.toLocaleString()}원</p>
                  )}
                </div>
                <div className="pt-2">
                  <Toggle
                    ariaLabel={`${c.name} 판매`}
                    checked={c.isActive}
                    disabled={busy}
                    onChange={next => handleToggleActive(id, next)}
                  />
                </div>
                <div className="w-36">
                  <Input
                    inputMode="numeric"
                    aria-label={`${c.name} 재고`}
                    value={value}
                    // 저장 중 고친 값은 성공 콜백이 편집 상태를 지우면서 사라진다.
                    disabled={pendingId === id}
                    onChange={e => handleChange(id, e.target.value)}
                    state={rowErrors[id] ? 'error' : 'default'}
                    helperText={rowErrors[id]}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-1"
                  aria-label={`${c.name} 재고 저장`}
                  disabled={!changed || (busy && pendingId !== id)}
                  loading={pendingId === id}
                  onClick={() => handleSaveStock(id, c.stockQuantity)}
                >
                  저장
                </Button>
              </div>
            )
          })}
          <p className="text-caption text-text-tertiary">
            판매 중인 옵션의 재고가 모두 0이 되면 잠시 뒤 품절로 바뀌고, 다시 채우면 판매중으로 돌아와요.
          </p>
        </div>
      )}
    </Drawer>
  )
}
