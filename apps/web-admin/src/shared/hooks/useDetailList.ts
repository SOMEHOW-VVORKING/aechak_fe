import { useMemo, useState } from 'react'

/**
 * 목록 DataTable → 상세 Drawer → 확인 Modal 화면 5종의 공통 상태.
 * 처리 API가 아직 없어 화면에서 바꾼 값(edits)만 서버 데이터 위에 겹쳐 보여준다(서버 데이터는 쿼리
 * 캐시에 그대로). 실제 mutation이 붙으면 edits/patchRow를 invalidateQueries로 바꾸는 자리는 여기 하나다.
 */
export function useDetailList<T extends { id: string }>(data: T[] | undefined) {
  const [edits, setEdits] = useState<Record<string, Partial<T>>>({})
  const items = useMemo<T[]>(
    () => (data ?? []).map(row => ({ ...row, ...edits[row.id] })),
    [data, edits],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find(row => row.id === selectedId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function patchRow(id: string, patch: Partial<T>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function closeDrawer() {
    setSelectedId(null)
    setConfirmOpen(false)
  }

  return {
    items,
    patchRow,
    selected,
    select: setSelectedId,
    closeDrawer,
    confirmOpen,
    setConfirmOpen,
    toast,
    setToast,
  }
}
